use crate::db;
use crate::schema::*;
use crate::state::AppState;
use async_graphql::{Context, Object, Result};
use risk_engine::{HedgeTier, RiskPolicy};
use rust_decimal::Decimal;

pub struct MutationRoot;

#[Object]
impl MutationRoot {
    async fn update_policy(
        &self,
        ctx: &Context<'_>,
        input: RiskPolicyInput,
    ) -> Result<RiskPolicyGql> {
        let state = ctx.data::<AppState>()?;

        let new_policy = RiskPolicy {
            warning: HedgeTier {
                minimum_distance: input.warning.minimum_distance,
                hedge_ratio: input.warning.hedge_ratio,
            },
            danger: HedgeTier {
                minimum_distance: input.danger.minimum_distance,
                hedge_ratio: input.danger.hedge_ratio,
            },
            critical: HedgeTier {
                minimum_distance: input.critical.minimum_distance,
                hedge_ratio: input.critical.hedge_ratio,
            },
        };

        *state.policy.write().await = new_policy.clone();

        if let Some(pool) = &state.db_pool {
            if let Err(e) = db::save_policy(pool, &new_policy).await {
                tracing::error!("Failed to persist updated policy: {:?}", e);
            }
        }

        tracing::info!(
            "Risk Policy updated: warning {}% (ratio {}), danger {}% (ratio {}), critical {}% (ratio {})",
            new_policy.warning.minimum_distance * Decimal::new(100, 0),
            new_policy.warning.hedge_ratio,
            new_policy.danger.minimum_distance * Decimal::new(100, 0),
            new_policy.danger.hedge_ratio,
            new_policy.critical.minimum_distance * Decimal::new(100, 0),
            new_policy.critical.hedge_ratio,
        );

        Ok(RiskPolicyGql {
            warning: HedgeTierGql {
                minimum_distance: new_policy.warning.minimum_distance,
                hedge_ratio: new_policy.warning.hedge_ratio,
            },
            danger: HedgeTierGql {
                minimum_distance: new_policy.danger.minimum_distance,
                hedge_ratio: new_policy.danger.hedge_ratio,
            },
            critical: HedgeTierGql {
                minimum_distance: new_policy.critical.minimum_distance,
                hedge_ratio: new_policy.critical.hedge_ratio,
            },
        })
    }

    async fn set_kill_switch(
        &self,
        ctx: &Context<'_>,
        active: bool,
    ) -> Result<ExecutionStatusInfoGql> {
        let state = ctx.data::<AppState>()?;

        state.safety_config.write().await.kill_switch = active;

        if active {
            tracing::warn!("CIRCUIT BREAKER: KILL SWITCH ACTIVATED. ALL EXECUTION HALTED.");
        } else {
            tracing::info!("Circuit breaker / kill switch deactivated. Normal execution resumed.");
        }

        Ok(ExecutionStatusInfoGql {
            connected: true,
            trading_permission: true,
            withdraw_permission: false,
            account_address: Some("0x84Ae...01Cd (Offset Agent Wallet)".to_string()),
            margin_available: Some(Decimal::new(1_000_000, 0)),
            kill_switch_active: active,
        })
    }

    /// Sets a simulated price directly, forcing an immediate risk evaluation and hedge adjustment if required.
    async fn set_simulated_price(
        &self,
        ctx: &Context<'_>,
        price: Decimal,
    ) -> Result<RiskSnapshotGql> {
        let state = ctx.data::<AppState>()?;
        *state.price_override.write().await = Some(price);
        tracing::info!("Simulated market price set to ${}", price);

        let snapshot = crate::orchestration::evaluate_and_orchestrate(state, Some(price)).await;
        Ok(snapshot)
    }

    /// Simulates a sudden market crash / price shock by a specified drop percentage (e.g. 15.0 for 15% drop).
    async fn simulate_price_shock(
        &self,
        ctx: &Context<'_>,
        drop_percentage: Decimal,
    ) -> Result<RiskSnapshotGql> {
        let state = ctx.data::<AppState>()?;
        let current_price = {
            let pos = state.current_position.read().await;
            pos.collateral
                .iter()
                .find(|c| c.asset == "SOL")
                .map(|c| c.price)
                .unwrap_or(Decimal::new(180, 0))
        };

        let factor = Decimal::ONE - (drop_percentage / Decimal::new(100, 0));
        let shocked_price = (current_price * factor).round_dp(2);

        *state.price_override.write().await = Some(shocked_price);
        tracing::warn!(
            "SIMULATED PRICE SHOCK: -{}% (price drop from ${} to ${})",
            drop_percentage,
            current_price,
            shocked_price
        );

        let snapshot =
            crate::orchestration::evaluate_and_orchestrate(state, Some(shocked_price)).await;
        Ok(snapshot)
    }

    /// Resets the simulated price override, restoring real-time oracle price feeds.
    async fn reset_simulated_price(&self, ctx: &Context<'_>) -> Result<RiskSnapshotGql> {
        let state = ctx.data::<AppState>()?;
        *state.price_override.write().await = None;
        tracing::info!("Reset simulated price override. Resuming live oracle feed.");

        let snapshot = crate::orchestration::evaluate_and_orchestrate(state, None).await;
        Ok(snapshot)
    }

    /// Deliberately triggers a pre-trade safety rail refusal (e.g. single order clip limit exceeded)
    /// to demonstrate risk controls and audit logging with decision-time order book snapshots.
    async fn trigger_safety_refusal(
        &self,
        ctx: &Context<'_>,
        check_type: Option<String>,
    ) -> Result<ExecutionRecordGql> {
        let state = ctx.data::<AppState>()?;
        let check = check_type.unwrap_or_else(|| "max_single_order".to_string());

        let sol_price = {
            let pos = state.current_position.read().await;
            pos.collateral
                .iter()
                .find(|c| c.asset == "SOL")
                .map(|c| c.price)
                .unwrap_or(Decimal::new(180, 0))
        };

        let bids = vec![
            execution::BookLevel {
                price: sol_price - Decimal::new(5, 2),
                size: Decimal::new(2500, 0),
            },
            execution::BookLevel {
                price: sol_price - Decimal::new(10, 2),
                size: Decimal::new(5200, 0),
            },
            execution::BookLevel {
                price: sol_price - Decimal::new(15, 2),
                size: Decimal::new(8400, 0),
            },
            execution::BookLevel {
                price: sol_price - Decimal::new(25, 2),
                size: Decimal::new(12000, 0),
            },
            execution::BookLevel {
                price: sol_price - Decimal::new(40, 2),
                size: Decimal::new(21000, 0),
            },
        ];
        let asks = vec![
            execution::BookLevel {
                price: sol_price + Decimal::new(5, 2),
                size: Decimal::new(2100, 0),
            },
            execution::BookLevel {
                price: sol_price + Decimal::new(10, 2),
                size: Decimal::new(4800, 0),
            },
            execution::BookLevel {
                price: sol_price + Decimal::new(15, 2),
                size: Decimal::new(7600, 0),
            },
            execution::BookLevel {
                price: sol_price + Decimal::new(25, 2),
                size: Decimal::new(11500, 0),
            },
            execution::BookLevel {
                price: sol_price + Decimal::new(40, 2),
                size: Decimal::new(19500, 0),
            },
        ];
        let book = execution::BookSnapshot { bids, asks };

        let (target_notional, violation, note) = match check.as_str() {
            "book_too_thin" => (
                Decimal::new(2_500_000, 0),
                execution::SafetyViolation::BookTooThin {
                    available_depth: Decimal::new(450_000, 0),
                    needed: Decimal::new(2_500_000, 0),
                },
                "Top-of-book depth ($450K) below required liquidity tolerance".to_string(),
            ),
            "insufficient_margin" => (
                Decimal::new(4_000_000, 0),
                execution::SafetyViolation::InsufficientMargin {
                    required: Decimal::new(800_000, 0),
                    available: Decimal::new(500_000, 0),
                },
                "Required margin ($800K) exceeds available account margin ($500K)".to_string(),
            ),
            _ => (
                Decimal::new(2_500_000, 0),
                execution::SafetyViolation::MaxSingleOrderExceeded {
                    size: Decimal::new(2_500_000, 0),
                    cap: state.config.safety.max_single_order,
                },
                format!(
                    "Single clip size ${} exceeds configured maximum ${}",
                    Decimal::new(2_500_000, 0),
                    state.config.safety.max_single_order
                ),
            ),
        };

        let record = execution::ExecutionRecord {
            id: uuid::Uuid::new_v4(),
            timestamp: chrono::Utc::now(),
            risk_level: risk_engine::RiskLevel::Danger,
            liquidation_distance: Some(Decimal::new(82, 3)),
            target_notional,
            filled_notional: Decimal::ZERO,
            avg_fill_price: None,
            reference_price: sol_price,
            slippage_bps: None,
            residual_exposure: target_notional,
            status: execution::ExecutionStatus::Refused(violation),
            book_snapshot: Some(book),
            cloid: None,
            note: Some(note.clone()),
        };

        if let Some(pool) = &state.db_pool {
            if let Err(e) = db::insert_execution(pool, &record).await {
                tracing::error!("Failed to persist deliberate safety refusal: {:?}", e);
            }
        }

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

        let rec_gql = ExecutionRecordGql {
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
            status: ExecutionStatusGql::Refused,
            note: record.note.clone(),
            book_snapshot: book_snapshot_gql,
        };

        let _ = state.execution_sender.send(rec_gql.clone());
        if let Some(client) = &state.redis_client {
            let _ = crate::redis::publish_execution(client, &rec_gql).await;
        }

        tracing::info!("Pre-trade safety refusal recorded: {}", note);
        Ok(rec_gql)
    }
}
