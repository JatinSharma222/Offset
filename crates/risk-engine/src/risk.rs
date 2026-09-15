use crate::types::{Ratio, RiskLevel, RiskPolicy};

/// Evaluates the risk level given distance to liquidation and configured policy.
///
/// Order matters: checks tightest band first.
/// Boundaries are inclusive on the lower bound (<=).
pub fn risk_level(distance: Ratio, policy: &RiskPolicy) -> RiskLevel {
    if distance <= policy.critical.minimum_distance {
        RiskLevel::Critical
    } else if distance <= policy.danger.minimum_distance {
        RiskLevel::Danger
    } else if distance <= policy.warning.minimum_distance {
        RiskLevel::Warning
    } else {
        RiskLevel::Healthy
    }
}
