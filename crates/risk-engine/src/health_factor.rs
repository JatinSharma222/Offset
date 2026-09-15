use crate::types::{Money, Position, Ratio};
use rust_decimal::Decimal;

/// Computes the risk-adjusted collateral value:
/// Σ(collateral_amount × price × liquidation_threshold)
///
/// Collateral entries with `liquidation_threshold: None` contribute zero.
pub fn risk_adjusted_collateral(position: &Position) -> Money {
    position
        .collateral
        .iter()
        .map(|c| {
            let threshold = c.liquidation_threshold.unwrap_or(Decimal::ZERO);
            c.amount * c.price * threshold
        })
        .sum()
}

/// Computes the total raw unweighted collateral value:
/// Σ(collateral_amount × price)
pub fn total_collateral_value(position: &Position) -> Money {
    position.collateral.iter().map(|c| c.amount * c.price).sum()
}

/// Computes the total debt value:
/// Σ(debt_amount × price)
pub fn debt_value(position: &Position) -> Money {
    position.debt.iter().map(|d| d.amount * d.price).sum()
}

/// Computes health factor:
/// risk_adjusted_collateral / debt_value
///
/// Returns None when debt_value == 0.
pub fn health_factor(position: &Position) -> Option<Ratio> {
    let debt = debt_value(position);
    if debt.is_zero() {
        return None;
    }
    let collateral = risk_adjusted_collateral(position);
    Some(collateral / debt)
}
