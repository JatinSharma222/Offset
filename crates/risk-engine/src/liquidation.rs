use crate::types::{Money, Ratio};
use rust_decimal::Decimal;

/// Solves for the price at which this position reaches its liquidation boundary.
///
/// Assumptions:
/// - Debt is denominated in a stable asset and constant while solving.
/// - All collateral other than the variable asset is constant.
/// - Only `variable_collateral` price changes.
///
/// Returns `None` when no such price exists (e.g. variable collateral is zero,
/// or fixed collateral alone covers debt).
pub fn liquidation_price(
    variable_amount: Money,
    liquidation_threshold: Ratio,
    debt_value: Money,
    fixed_adjusted_collateral: Money,
) -> Option<Money> {
    let denominator = variable_amount * liquidation_threshold;
    if denominator <= Decimal::ZERO {
        return None;
    }

    let numerator = debt_value - fixed_adjusted_collateral;
    if numerator < Decimal::ZERO {
        return None;
    }

    Some(numerator / denominator)
}

/// Computes the percentage distance between current price and liquidation price:
/// (current_price - liquidation_price) / current_price
///
/// Returns `None` when `current_price <= 0`.
/// Returns negative value if current_price < liquidation_price (already past boundary).
pub fn liquidation_distance(current_price: Money, liquidation_price: Money) -> Option<Ratio> {
    if current_price <= Decimal::ZERO {
        return None;
    }

    Some((current_price - liquidation_price) / current_price)
}
