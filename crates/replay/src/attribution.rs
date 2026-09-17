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
    /// Hero metric: Net financial loss avoided after deducting funding and slippage friction.
    pub loss_avoided: Money,
    /// Percentage of protocol liquidation loss offset by the hedge.
    pub damage_offset_pct: Money,
    /// Percentage reduction of bad debt (100% when bad debt remains strictly zero).
    pub bad_debt_reduction_pct: Money,
    /// Legacy counter for backward compatibility.
    pub liquidations_prevented: u32,
    /// Number of on-chain liquidation events whose penalties were fully absorbed by hedge P&L.
    pub on_chain_liquidations_absorbed: u32,
    /// Total overhead cost: funding carry + execution slippage.
    pub hedge_cost: Money,
}
