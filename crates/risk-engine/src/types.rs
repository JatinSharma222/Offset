use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

pub type Money = Decimal;
pub type Ratio = Decimal;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AssetPosition {
    pub asset: String,
    pub amount: Money,
    pub price: Money,
    /// Fraction of this asset's value that counts toward covering debt.
    /// Required for collateral, `None` for debt.
    pub liquidation_threshold: Option<Ratio>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Position {
    pub collateral: Vec<AssetPosition>,
    pub debt: Vec<AssetPosition>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RiskLevel {
    Healthy,
    Warning,
    Danger,
    Critical,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HedgeTier {
    pub minimum_distance: Ratio,
    pub hedge_ratio: Ratio,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RiskPolicy {
    pub warning: HedgeTier,  // default: distance 0.15, ratio 0.25
    pub danger: HedgeTier,   // default: distance 0.10, ratio 0.50
    pub critical: HedgeTier, // default: distance 0.05, ratio 0.75
}

impl Default for RiskPolicy {
    fn default() -> Self {
        Self {
            warning: HedgeTier {
                minimum_distance: Decimal::new(15, 2), // 0.15
                hedge_ratio: Decimal::new(25, 2),      // 0.25
            },
            danger: HedgeTier {
                minimum_distance: Decimal::new(10, 2), // 0.10
                hedge_ratio: Decimal::new(50, 2),      // 0.50
            },
            critical: HedgeTier {
                minimum_distance: Decimal::new(5, 2), // 0.05
                hedge_ratio: Decimal::new(75, 2),     // 0.75
            },
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RiskSnapshot {
    pub collateral_value: Money,         // raw, unweighted
    pub risk_adjusted_collateral: Money, // weighted by liquidation thresholds
    pub debt_value: Money,
    pub health_factor: Option<Ratio>,        // None when debt == 0
    pub liquidation_price: Option<Money>,    // None when not solvable
    pub liquidation_distance: Option<Ratio>, // None when liquidation_price is None
    pub risk_level: RiskLevel,
    pub emergency: bool,                // distance < 0.02
    pub variable_asset_exposure: Money, // notional of the hedged asset
    pub hedge_ratio: Ratio,
    pub target_hedge: Money,
}
