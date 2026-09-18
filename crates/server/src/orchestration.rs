use crate::db;
use crate::redis;
use crate::schema::{
    BookLevelGql, BookSnapshotGql, ExecutionRecordGql, ExecutionStatusGql, RiskSnapshotGql,
};
use crate::state::AppState;
use chrono::Utc;
use execution::{check_pre_trade, ExecutionRecord, ExecutionStatus};
use risk_engine::{evaluate_position, RiskLevel};
use rust_decimal::Decimal;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use uuid::Uuid;

static LAST_TARGET_HEDGE_MICROS: AtomicU64 = AtomicU64::new(0);

fn get_last_target_hedge() -> Decimal {
    let micros = LAST_TARGET_HEDGE_MICROS.load(Ordering::Relaxed);
    Decimal::from(micros)
}

fn set_last_target_hedge(val: Decimal) {
    if let Ok(u) = val.to_string().parse::<f64>() {
        LAST_TARGET_HEDGE_MICROS.store(u.round() as u64, Ordering::Relaxed);
    }
}

/// Evaluates the current position against policy, persists snapshots, and executes hedge adjustments if thresholds are crossed.
pub async fn evaluate_and_orchestrate(
    state: &AppState,
    forced_price: Option<Decimal>,
) -> RiskSnapshotGql {
    // 1. Resolve active price (Forced > Override > Live Oracle > Current Position)
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

    let policy = state.policy.read().await.clone();
    let sol_price = position
        .collateral
        .iter()
        .find(|c| c.asset == "SOL")
        .map(|c| c.price)
        .unwrap_or(Decimal::ZERO);

    // 2. Pure Risk Engine Evaluation
    let snapshot = evaluate_position(&position, "SOL", &policy);
    let now = Utc::now();
    let snapshot_id = Uuid::new_v4();

    let snapshot_gql = RiskSnapshotGql {
        id: snapshot_id.to_string(),
        timestamp: now,
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
    };

    // 3. Update in-memory state
    *state.latest_snapshot.write().await = Some(snapshot_gql.clone());

    // 4. Persist snapshot to Postgres
    if let Some(pool) = &state.db_pool {
        if let Err(e) = db::insert_snapshot(pool, snapshot_id, now, sol_price, &snapshot).await {
            tracing::error!("Failed to persist risk snapshot: {:?}", e);
        }
    }

    // 5. Publish snapshot (broadcast + Redis)
    let _ = state.snapshot_sender.send(snapshot_gql.clone());
    if let Some(client) = &state.redis_client {
        if let Err(e) = redis::publish_snapshot(client, &snapshot_gql).await {
            tracing::warn!("Failed to publish snapshot to Redis: {:?}", e);
        }
    }

    // 6. Check if target hedge changed beyond threshold
    let last_target = get_last_target_hedge();
    let delta = (snapshot.target_hedge - last_target).abs();
    if delta >= state.config.min_hedge_adjustment_usd {
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

        let execution_record = match pre_trade_result {
            Ok(()) => {
                tracing::info!(
                    "Triggering hedge adjustment: target ${} (delta ${})",
                    snapshot.target_hedge,
                    delta
                );
                match state.executor.adjust_hedge(snapshot.target_hedge).await {
                    Ok(rec) => {
                        set_last_target_hedge(snapshot.target_hedge);
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
                }
            }
        };

        let status_gql = match &execution_record.status {
            ExecutionStatus::Filled => ExecutionStatusGql::Filled,
            ExecutionStatus::PartiallyFilled => ExecutionStatusGql::PartiallyFilled,
            ExecutionStatus::Refused(_) => ExecutionStatusGql::Refused,
            ExecutionStatus::Failed(_) => ExecutionStatusGql::Failed,
        };

        let book_snapshot_gql = execution_record
            .book_snapshot
            .as_ref()
            .map(|b| BookSnapshotGql {
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

        let rec_gql = ExecutionRecordGql {
            id: execution_record.id.to_string(),
            timestamp: execution_record.timestamp,
            risk_level: execution_record.risk_level.into(),
            liquidation_distance: execution_record.liquidation_distance,
            target_notional: execution_record.target_notional,
            filled_notional: execution_record.filled_notional,
            avg_fill_price: execution_record.avg_fill_price,
            reference_price: execution_record.reference_price,
            slippage_bps: execution_record.slippage_bps,
            residual_exposure: execution_record.residual_exposure,
            status: status_gql,
            note: execution_record.note.clone(),
            book_snapshot: book_snapshot_gql,
        };

        if let Some(pool) = &state.db_pool {
            if let Err(e) = db::insert_execution(pool, &execution_record).await {
                tracing::error!("Failed to persist execution record: {:?}", e);
            }
        }

        let _ = state.execution_sender.send(rec_gql.clone());
        if let Some(client) = &state.redis_client {
            if let Err(e) = redis::publish_execution(client, &rec_gql).await {
                tracing::warn!("Failed to publish execution to Redis: {:?}", e);
            }
        }
    }

    snapshot_gql
}

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
