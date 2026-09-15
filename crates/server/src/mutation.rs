use crate::schema::*;
use async_graphql::{Context, Object, Result};
use rust_decimal::Decimal;

pub struct MutationRoot;

#[Object]
impl MutationRoot {
    async fn update_policy(
        &self,
        _ctx: &Context<'_>,
        input: RiskPolicyInput,
    ) -> Result<RiskPolicyGql> {
        Ok(RiskPolicyGql {
            warning: HedgeTierGql {
                minimum_distance: input.warning.minimum_distance,
                hedge_ratio: input.warning.hedge_ratio,
            },
            danger: HedgeTierGql {
                minimum_distance: input.danger.minimum_distance,
                hedge_ratio: input.danger.hedge_ratio,
            },
            critical: HedgeTierGql {
                minimum_distance: input.critical.minimum_distance,
                hedge_ratio: input.critical.hedge_ratio,
            },
        })
    }

    async fn set_kill_switch(
        &self,
        _ctx: &Context<'_>,
        active: bool,
    ) -> Result<ExecutionStatusInfoGql> {
        Ok(ExecutionStatusInfoGql {
            connected: true,
            trading_permission: true,
            withdraw_permission: false,
            account_address: Some("0x1234...5678".to_string()),
            margin_available: Some(Decimal::new(1_000_000, 0)),
            kill_switch_active: active,
        })
    }
}
