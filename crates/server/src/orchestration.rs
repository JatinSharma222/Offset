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
use std::time::Duration;
use uuid::Uuid;

pub fn start_orchestration_loop(state: AppState) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        tracing::info!(
            "Starting orchestration loop (interval: {}s, min adjustment: ${})",
            state.config.loop_interval_secs,
            state.config.min_hedge_adjustment_usd
        );

        let mut interval =
            tokio::time::interval(Duration::from_secs(state.config.loop_interval_secs));
        let mut last_risk_level = RiskLevel::Healthy;
        let mut last_target_hedge = Decimal::ZERO;

        loop {
            interval.tick().await;

            // 1. Get current position and active policy
            let position = state.current_position.read().await.clone();
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

            // Log risk level transition if changed
            if snapshot.risk_level != last_risk_level {
                let dist_str = snapshot
                    .liquidation_distance
                    .map(|d| format!("{:.2}%", d * Decimal::new(100, 0)))
                    .unwrap_or_else(|| "N/A".to_string());
                tracing::info!(
                    "RISK LEVEL TRANSITION: {:?} -> {:?} | distance: {} | SOL price: ${} | target hedge: ${}",
                    last_risk_level,
                    snapshot.risk_level,
                    dist_str,
                    sol_price,
                    snapshot.target_hedge
                );
                last_risk_level = snapshot.risk_level;
            }

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
                if let Err(e) =
                    db::insert_snapshot(pool, snapshot_id, now, sol_price, &snapshot).await
                {
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
            let delta = (snapshot.target_hedge - last_target_hedge).abs();
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
                                last_target_hedge = snapshot.target_hedge;
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

                // Convert to ExecutionRecordGql
                let status_gql = match &execution_record.status {
                    ExecutionStatus::Filled => ExecutionStatusGql::Filled,
                    ExecutionStatus::PartiallyFilled => ExecutionStatusGql::PartiallyFilled,
                    ExecutionStatus::Refused(_) => ExecutionStatusGql::Refused,
                    ExecutionStatus::Failed(_) => ExecutionStatusGql::Failed,
                };

                let book_snapshot_gql =
                    execution_record
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

                // Persist execution to Postgres
                if let Some(pool) = &state.db_pool {
                    if let Err(e) = db::insert_execution(pool, &execution_record).await {
                        tracing::error!("Failed to persist execution record: {:?}", e);
                    }
                }

                // Publish execution (broadcast + Redis)
                let _ = state.execution_sender.send(rec_gql.clone());
                if let Some(client) = &state.redis_client {
                    if let Err(e) = redis::publish_execution(client, &rec_gql).await {
                        tracing::warn!("Failed to publish execution to Redis: {:?}", e);
                    }
                }
            }
        }
    })
}
