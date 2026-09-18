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
}
