use async_graphql::{Enum, InputObject, SimpleObject};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
pub enum RiskLevelGql {
    Healthy,
    Warning,
    Danger,
    Critical,
}

impl From<risk_engine::RiskLevel> for RiskLevelGql {
    fn from(r: risk_engine::RiskLevel) -> Self {
        match r {
            risk_engine::RiskLevel::Healthy => RiskLevelGql::Healthy,
            risk_engine::RiskLevel::Warning => RiskLevelGql::Warning,
            risk_engine::RiskLevel::Danger => RiskLevelGql::Danger,
            risk_engine::RiskLevel::Critical => RiskLevelGql::Critical,
        }
    }
}

impl From<RiskLevelGql> for risk_engine::RiskLevel {
    fn from(r: RiskLevelGql) -> Self {
        match r {
            RiskLevelGql::Healthy => risk_engine::RiskLevel::Healthy,
            RiskLevelGql::Warning => risk_engine::RiskLevel::Warning,
            RiskLevelGql::Danger => risk_engine::RiskLevel::Danger,
            RiskLevelGql::Critical => risk_engine::RiskLevel::Critical,
        }
    }
}

#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
pub enum ExecutionStatusGql {
    Filled,
    PartiallyFilled,
    Refused,
    Failed,
}

#[derive(SimpleObject, Clone, Serialize, Deserialize)]
pub struct RiskSnapshotGql {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub price: Decimal,
    pub collateral_value: Decimal,
    pub risk_adjusted_collateral: Decimal,
    pub debt_value: Decimal,
    pub health_factor: Option<Decimal>,
    pub liquidation_price: Option<Decimal>,
    pub liquidation_distance: Option<Decimal>,
    pub risk_level: RiskLevelGql,
    pub emergency: bool,
    pub exposure: Decimal,
    pub hedge_ratio: Decimal,
    pub target_hedge: Decimal,
}

#[derive(SimpleObject, Clone, Serialize, Deserialize)]
pub struct BookLevelGql {
    pub price: Decimal,
    pub size: Decimal,
}

#[derive(SimpleObject, Clone, Serialize, Deserialize)]
pub struct BookSnapshotGql {
    pub bids: Vec<BookLevelGql>,
    pub asks: Vec<BookLevelGql>,
}

#[derive(SimpleObject, Clone, Serialize, Deserialize)]
pub struct ExecutionRecordGql {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub risk_level: RiskLevelGql,
    pub liquidation_distance: Option<Decimal>,
    pub target_notional: Decimal,
    pub filled_notional: Decimal,
    pub avg_fill_price: Option<Decimal>,
    pub reference_price: Decimal,
    pub slippage_bps: Option<Decimal>,
    pub residual_exposure: Decimal,
    pub status: ExecutionStatusGql,
    pub note: Option<String>,
    pub book_snapshot: Option<BookSnapshotGql>,
}

#[derive(SimpleObject, Clone, Serialize, Deserialize)]
pub struct ProtectionImpactGql {
    pub loss_avoided: Decimal,
    pub damage_offset_pct: Decimal,
    pub bad_debt_reduction_pct: Decimal,
    pub liquidations_prevented: i32,
    pub on_chain_liquidations_absorbed: i32,
    pub hedge_cost: Decimal,
}

#[derive(SimpleObject, Clone, Serialize, Deserialize)]
pub struct OutcomeSummaryGql {
    pub liquidation_penalties: Decimal,
    pub bad_debt: Decimal,
    pub hedge_pnl: Decimal,
    pub funding_cost: Decimal,
    pub slippage_cost: Decimal,
    pub net_loss: Decimal,
}

#[derive(SimpleObject, Clone, Serialize, Deserialize)]
pub struct ReplayTickGql {
    pub timestamp: DateTime<Utc>,
    pub price: Decimal,
    pub snapshot: RiskSnapshotGql,
    pub execution: Option<ExecutionRecordGql>,
    pub hedge_position: Decimal,
    pub hedge_pnl: Decimal,
    pub cumulative_funding: Decimal,
}

#[derive(SimpleObject, Clone, Serialize, Deserialize)]
pub struct ReplayResultGql {
    pub scenario: String,
    pub source_note: String,
    pub ticks: Vec<ReplayTickGql>,
    pub without_hedge: OutcomeSummaryGql,
    pub with_hedge: OutcomeSummaryGql,
    pub impact: ProtectionImpactGql,
}

#[derive(SimpleObject, Clone, Serialize, Deserialize)]
pub struct HedgeTierGql {
    pub minimum_distance: Decimal,
    pub hedge_ratio: Decimal,
}

#[derive(SimpleObject, Clone, Serialize, Deserialize)]
pub struct RiskPolicyGql {
    pub warning: HedgeTierGql,
    pub danger: HedgeTierGql,
    pub critical: HedgeTierGql,
}

#[derive(SimpleObject, Clone, Serialize, Deserialize)]
pub struct ExecutionStatusInfoGql {
    pub connected: bool,
    pub trading_permission: bool,
    pub withdraw_permission: bool, // always false — displayed as a feature
    pub account_address: Option<String>,
    pub margin_available: Option<Decimal>,
    pub kill_switch_active: bool,
}

#[derive(SimpleObject, Clone, Serialize, Deserialize)]
pub struct ScenarioGql {
    pub id: String,
    pub name: String,
    pub description: String,
    pub source_note: String,
}

#[derive(InputObject)]
pub struct HedgeTierInput {
    pub minimum_distance: Decimal,
    pub hedge_ratio: Decimal,
}

#[derive(InputObject)]
pub struct RiskPolicyInput {
    pub warning: HedgeTierInput,
    pub danger: HedgeTierInput,
    pub critical: HedgeTierInput,
}
