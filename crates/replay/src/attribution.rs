use risk_engine::Money;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OutcomeSummary {
    pub liquidation_penalties: Money,
    pub bad_debt: Money,
    pub hedge_pnl: Money,
    pub funding_cost: Money,
    pub slippage_cost: Money,
    pub net_loss: Money,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProtectionImpact {
    pub loss_avoided: Money,
    pub bad_debt_reduction_pct: Money,
    pub liquidations_prevented: u32,
    pub hedge_cost: Money,
}
