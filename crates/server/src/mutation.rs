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
}
