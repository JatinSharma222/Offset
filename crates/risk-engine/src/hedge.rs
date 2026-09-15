use crate::types::{Money, Ratio, RiskLevel, RiskPolicy};
use rust_decimal::Decimal;

/// Derives the target hedge ratio from risk level and policy.
pub fn hedge_ratio(level: RiskLevel, policy: &RiskPolicy) -> Ratio {
    match level {
        RiskLevel::Healthy => Decimal::ZERO,
        RiskLevel::Warning => policy.warning.hedge_ratio,
        RiskLevel::Danger => policy.danger.hedge_ratio,
        RiskLevel::Critical => policy.critical.hedge_ratio,
    }
}

/// Derives the target dollar hedge notional:
/// target_hedge = exposure * hedge_ratio
pub fn target_hedge(exposure: Money, ratio: Ratio) -> Money {
    exposure * ratio
}
