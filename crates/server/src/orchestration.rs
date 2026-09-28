use crate::db;
use crate::redis;
use crate::schema::{
    BookLevelGql, BookSnapshotGql, ExecutionRecordGql, ExecutionStatusGql, RiskSnapshotGql,
};
use crate::state::AppState;
use chrono::{DateTime, Utc};
use execution::{check_pre_trade, ExecutionRecord, ExecutionStatus};
use risk_engine::{evaluate_position, RiskLevel, RiskSnapshot};
use rust_decimal::Decimal;
use std::sync::atomic::Ordering;
use std::time::Duration;
use uuid::Uuid;

/// Maximum consecutive DB write failures before the kill switch auto-activates.
const MAX_DB_FAILURES_BEFORE_HALT: u32 = 3;

// ---------------------------------------------------------------------------
// Pipeline Stage 1: Price Resolution
// ---------------------------------------------------------------------------

/// Resolves the effective SOL price from the priority chain:
/// Forced > Override > Live Oracle > Current Position.
/// Returns the resolved price and the updated position snapshot.
async fn resolve_price(state: &AppState, forced_price: Option<Decimal>) -> (Decimal, risk_engine::Position) {
    let override_price = *state.price_override.read().await;
    let effective_price = if let Some(p) = forced_price {
        Some(p)
    } else if let Some(p) = override_price {
        Some(p)
    } else if state.config.enable_live_price_feed {
        match state.price_oracle.fetch_asset_price("SOL").await {
            Ok(live_price) => Some(live_price),
            Err(e) => {
                tracing::debug!(
                    "Live price oracle unavailable ({:?}), keeping current position price",
                    e
                );
                None
            }
        }
    } else {
        None
    };

    // Update price on position if resolved
    let position = {
        let mut pos = state.current_position.write().await;
        if let Some(p) = effective_price {
            if let Some(col) = pos.collateral.iter_mut().find(|c| c.asset == "SOL") {
                col.price = p;
            }
        }
        pos.clone()
    };

    let sol_price = position
        .collateral
        .iter()
        .find(|c| c.asset == "SOL")
        .map(|c| c.price)
        .unwrap_or(Decimal::ZERO);

    (sol_price, position)
}

// ---------------------------------------------------------------------------
// Pipeline Stage 2: GraphQL Type Conversion
// ---------------------------------------------------------------------------

/// Converts a risk engine snapshot into the GraphQL response type.
fn build_snapshot_gql(
    snapshot: &RiskSnapshot,
    snapshot_id: Uuid,
    timestamp: DateTime<Utc>,
    sol_price: Decimal,
) -> RiskSnapshotGql {
    RiskSnapshotGql {
        id: snapshot_id.to_string(),
        timestamp,
        price: sol_price,
        collateral_value: snapshot.collateral_value,
        risk_adjusted_collateral: snapshot.risk_adjusted_collateral,
        debt_value: snapshot.debt_value,
        health_factor: snapshot.health_factor,
        liquidation_price: snapshot.liquidation_price,
        liquidation_distance: snapshot.liquidation_distance,
        risk_level: snapshot.risk_level.into(),
        emergency: snapshot.emergency,
        exposure: snapshot.variable_asset_exposure,
        hedge_ratio: snapshot.hedge_ratio,
        target_hedge: snapshot.target_hedge,
    }
}

/// Converts an execution record into the GraphQL response type.
fn execution_record_to_gql(record: &ExecutionRecord) -> ExecutionRecordGql {
    let status_gql = match &record.status {
        ExecutionStatus::Filled => ExecutionStatusGql::Filled,
        ExecutionStatus::PartiallyFilled => ExecutionStatusGql::PartiallyFilled,
        ExecutionStatus::Refused(_) => ExecutionStatusGql::Refused,
        ExecutionStatus::Failed(_) => ExecutionStatusGql::Failed,
    };

    let book_snapshot_gql = record.book_snapshot.as_ref().map(|b| BookSnapshotGql {
        bids: b
            .bids
            .iter()
            .map(|l| BookLevelGql {
                price: l.price,
                size: l.size,
            })
            .collect(),
        asks: b
            .asks
            .iter()
            .map(|l| BookLevelGql {
                price: l.price,
                size: l.size,
            })
            .collect(),
    });

    ExecutionRecordGql {
        id: record.id.to_string(),
        timestamp: record.timestamp,
        risk_level: record.risk_level.into(),
        liquidation_distance: record.liquidation_distance,
        target_notional: record.target_notional,
        filled_notional: record.filled_notional,
        avg_fill_price: record.avg_fill_price,
        reference_price: record.reference_price,
        slippage_bps: record.slippage_bps,
        residual_exposure: record.residual_exposure,
        status: status_gql,
        note: record.note.clone(),
        book_snapshot: book_snapshot_gql,
        protocol_reference_price: record.protocol_reference_price,
        hyperliquid_fill_price: record.hyperliquid_fill_price,
        basis_bps: record.basis_bps,
        detected_at: record.detected_at,
        filled_at: record.filled_at,
        latency_ms: record.latency_ms.map(|l| l as i32),
    }
}

// ---------------------------------------------------------------------------
// Pipeline Stage 3: Persistence with Circuit Breaker
// ---------------------------------------------------------------------------

/// Persists a risk snapshot to Postgres with consecutive failure tracking.
/// Auto-activates the kill switch after `MAX_DB_FAILURES_BEFORE_HALT` consecutive failures.
async fn persist_snapshot(state: &AppState, snapshot_id: Uuid, now: DateTime<Utc>, sol_price: Decimal, snapshot: &RiskSnapshot) {
    if let Some(pool) = &state.db_pool {
        match db::insert_snapshot(pool, snapshot_id, now, sol_price, snapshot).await {
            Ok(_) => {
                state.db_failure_count.store(0, Ordering::Relaxed);
            }
            Err(e) => {
                handle_db_failure(state, "risk snapshot", e).await;
            }
        }
    }
}

/// Persists an execution record to Postgres with consecutive failure tracking.
async fn persist_execution(state: &AppState, record: &ExecutionRecord) {
    if let Some(pool) = &state.db_pool {
        match db::insert_execution(pool, record).await {
            Ok(_) => {
                state.db_failure_count.store(0, Ordering::Relaxed);
            }
            Err(e) => {
                handle_db_failure(state, "execution record", e).await;
            }
        }
    }
}

/// Shared DB failure handler: increments counter, logs, and activates kill switch if threshold reached.
async fn handle_db_failure(state: &AppState, record_type: &str, error: sqlx::Error) {
    let failures = state.db_failure_count.fetch_add(1, Ordering::Relaxed) + 1;
    tracing::error!(
        "Failed to persist {} ({} consecutive failures): {:?}",
        record_type,
        failures,
        error
    );
    if failures >= MAX_DB_FAILURES_BEFORE_HALT {
        tracing::error!(
            "CIRCUIT BREAKER: {} consecutive DB failures. Activating kill switch to prevent unaudited trades.",
            failures
        );
        state.safety_config.write().await.kill_switch = true;
    }
}

// ---------------------------------------------------------------------------
// Pipeline Stage 4: Publish (Broadcast + Redis)
// ---------------------------------------------------------------------------

/// Publishes a snapshot via in-process broadcast and Redis pub/sub.
async fn publish_snapshot(state: &AppState, snapshot_gql: &RiskSnapshotGql) {
    let _ = state.snapshot_sender.send(snapshot_gql.clone());
    if let Some(client) = &state.redis_client {
        if let Err(e) = redis::publish_snapshot(client, &state.redis_conn, snapshot_gql).await {
            tracing::warn!("Failed to publish snapshot to Redis: {:?}", e);
        }
    }
}

/// Publishes an execution record via in-process broadcast and Redis pub/sub.
async fn publish_execution(state: &AppState, rec_gql: &ExecutionRecordGql) {
    let _ = state.execution_sender.send(rec_gql.clone());
    if let Some(client) = &state.redis_client {
        if let Err(e) = redis::publish_execution(client, &state.redis_conn, rec_gql).await {
            tracing::warn!("Failed to publish execution to Redis: {:?}", e);
        }
    }
}

// ---------------------------------------------------------------------------
// Pipeline Stage 5: Hedge Execution
// ---------------------------------------------------------------------------

/// Evaluates whether a hedge adjustment is needed and executes it if so.
/// Returns the execution record if a trade was attempted, or None if no action needed.
async fn execute_hedge_if_needed(
    state: &AppState,
    snapshot: &RiskSnapshot,
    sol_price: Decimal,
) -> Option<ExecutionRecord> {
    let current_hedge = state.executor.current_hedge().await.unwrap_or(Decimal::ZERO);
    let delta = (snapshot.target_hedge - current_hedge).abs();

    if delta < state.config.min_hedge_adjustment_usd {
        return None;
    }

    let safety_config = state.safety_config.read().await.clone();
    let margin_available = Decimal::new(1_000_000, 0); // $1M available margin
    let margin_required = snapshot.target_hedge * Decimal::new(20, 2); // 20% margin requirement

    let pre_trade_result = check_pre_trade(
        snapshot.target_hedge,
        delta,
        1, // 1 sec staleness
        margin_available,
        margin_required,
        &safety_config,
    );

    let record = match pre_trade_result {
        Ok(()) => {
            tracing::info!(
                "Triggering hedge adjustment: target ${} (current ${}, delta ${})",
                snapshot.target_hedge,
                current_hedge,
                delta
            );
            match state.executor.adjust_hedge(snapshot.target_hedge).await {
                Ok(rec) => {
                    *state.last_target_hedge.write().await = snapshot.target_hedge;
                    tracing::info!(
                        "Hedge executed: filled ${} | slippage: {:?} bps | status: {:?}",
                        rec.filled_notional,
                        rec.slippage_bps,
                        rec.status
                    );
                    rec
                }
                Err(e) => {
                    tracing::error!("Executor adjust_hedge failed: {:?}", e);
                    ExecutionRecord {
                        id: Uuid::new_v4(),
                        timestamp: Utc::now(),
                        risk_level: snapshot.risk_level,
                        liquidation_distance: snapshot.liquidation_distance,
                        target_notional: snapshot.target_hedge,
                        filled_notional: Decimal::ZERO,
                        avg_fill_price: None,
                        reference_price: sol_price,
                        slippage_bps: None,
                        residual_exposure: snapshot.target_hedge,
                        status: ExecutionStatus::Failed(e.to_string()),
                        book_snapshot: None,
                        cloid: None,
                        note: Some(format!("Execution failed: {}", e)),
                        protocol_reference_price: sol_price,
                        hyperliquid_fill_price: None,
                        basis_bps: None,
                        detected_at: Utc::now(),
                        filled_at: None,
                        latency_ms: None,
                    }
                }
            }
        }
        Err(violation) => {
            tracing::warn!("Pre-trade safety check refused order: {:?}", violation);
            ExecutionRecord {
                id: Uuid::new_v4(),
                timestamp: Utc::now(),
                risk_level: snapshot.risk_level,
                liquidation_distance: snapshot.liquidation_distance,
                target_notional: snapshot.target_hedge,
                filled_notional: Decimal::ZERO,
                avg_fill_price: None,
                reference_price: sol_price,
                slippage_bps: None,
                residual_exposure: snapshot.target_hedge,
                status: ExecutionStatus::Refused(violation.clone()),
                book_snapshot: None,
                cloid: None,
                note: Some(format!("Safety refusal: {:?}", violation)),
                protocol_reference_price: sol_price,
                hyperliquid_fill_price: None,
                basis_bps: None,
                detected_at: Utc::now(),
                filled_at: None,
                latency_ms: None,
            }
        }
    };

    Some(record)
}

// ---------------------------------------------------------------------------
// Orchestrator: Composes the pipeline stages
// ---------------------------------------------------------------------------

/// Evaluates the current position against policy, persists snapshots, and executes hedge adjustments if thresholds are crossed.
pub async fn evaluate_and_orchestrate(
    state: &AppState,
    forced_price: Option<Decimal>,
) -> RiskSnapshotGql {
    // 1. Resolve price and gather current state
    let (sol_price, position) = resolve_price(state, forced_price).await;
    let _ = state.executor.update_reference_price(sol_price).await;
    let policy = state.policy.read().await.clone();

    // 2. Pure risk engine evaluation
    let snapshot = evaluate_position(&position, "SOL", &policy);
    let now = Utc::now();
    let snapshot_id = Uuid::new_v4();
    let snapshot_gql = build_snapshot_gql(&snapshot, snapshot_id, now, sol_price);

    // 3. Update in-memory state
    *state.latest_snapshot.write().await = Some(snapshot_gql.clone());

    // 4. Persist snapshot
    persist_snapshot(state, snapshot_id, now, sol_price, &snapshot).await;

    // 5. Publish snapshot
    publish_snapshot(state, &snapshot_gql).await;

    // 6. Execute hedge if needed, persist & publish the result
    if let Some(execution_record) = execute_hedge_if_needed(state, &snapshot, sol_price).await {
        let rec_gql = execution_record_to_gql(&execution_record);
        persist_execution(state, &execution_record).await;
        publish_execution(state, &rec_gql).await;
    }

    snapshot_gql
}

// ---------------------------------------------------------------------------
// Background Loop
// ---------------------------------------------------------------------------

pub fn start_orchestration_loop(state: AppState) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        tracing::info!(
            "Starting orchestration loop (interval: {}s, live_feed={}, min adjustment: ${})",
            state.config.loop_interval_secs,
            state.config.enable_live_price_feed,
            state.config.min_hedge_adjustment_usd
        );

        let mut interval =
            tokio::time::interval(Duration::from_secs(state.config.loop_interval_secs));
        let mut last_risk_level = RiskLevel::Healthy;
        let mut tick_counter: u64 = 0;

        loop {
            interval.tick().await;
            tick_counter = tick_counter.wrapping_add(1);

            // Periodic Solana obligation sync (every 12 ticks, ~60 seconds) when enabled
            if state.config.enable_solana_sync && tick_counter % 12 == 1 {
                let obl = state
                    .solana_client
                    .fetch_obligation_with_fallback(&state.config.solana_obligation_pubkey)
                    .await;
                let current_sol_price = {
                    let p = state.current_position.read().await;
                    p.collateral
                        .iter()
                        .find(|c| c.asset == "SOL")
                        .map(|c| c.price)
                        .unwrap_or(Decimal::new(180, 0))
                };
                let mut prices = std::collections::HashMap::new();
                prices.insert("SOL".to_string(), current_sol_price);
                prices.insert("mSOL".to_string(), current_sol_price);
                prices.insert("USDC".to_string(), Decimal::ONE);

                let updated_pos = obl.to_position(&prices);
                *state.current_position.write().await = updated_pos;
            }

            let snapshot_gql = evaluate_and_orchestrate(&state, None).await;

            // Log risk level transitions
            let current_risk = match snapshot_gql.risk_level {
                crate::schema::RiskLevelGql::Healthy => RiskLevel::Healthy,
                crate::schema::RiskLevelGql::Warning => RiskLevel::Warning,
                crate::schema::RiskLevelGql::Danger => RiskLevel::Danger,
                crate::schema::RiskLevelGql::Critical => RiskLevel::Critical,
            };

            if current_risk != last_risk_level {
                let dist_str = snapshot_gql
                    .liquidation_distance
                    .map(|d| format!("{:.2}%", d * Decimal::new(100, 0)))
                    .unwrap_or_else(|| "N/A".to_string());
                tracing::info!(
                    "RISK LEVEL TRANSITION: {:?} -> {:?} | distance: {} | price: ${} | target hedge: ${}",
                    last_risk_level,
                    current_risk,
                    dist_str,
                    snapshot_gql.price,
                    snapshot_gql.target_hedge
                );
                last_risk_level = current_risk;
            }
        }
    })
}
