use crate::health_factor::{
    debt_value, health_factor, risk_adjusted_collateral, total_collateral_value,
};
use crate::hedge::{hedge_ratio, target_hedge};
use crate::liquidation::{liquidation_distance, liquidation_price};
use crate::risk::risk_level;
use crate::types::{Position, RiskLevel, RiskPolicy, RiskSnapshot};
use rust_decimal::Decimal;

/// The master entrypoint for position risk evaluation.
///
/// Evaluates collateral and debt values, solves for liquidation price with respect
/// to `variable_asset`, derives distance to liquidation, risk tier, and target hedge notional.
pub fn evaluate_position(
    position: &Position,
    variable_asset: &str,
    policy: &RiskPolicy,
) -> RiskSnapshot {
    let collateral_val = total_collateral_value(position);
    let risk_adj_collateral = risk_adjusted_collateral(position);
    let debt_val = debt_value(position);
    let hf = health_factor(position);

    // Degenerate case 1: zero debt
    if debt_val.is_zero() {
        let variable_pos = position
            .collateral
            .iter()
            .find(|c| c.asset == variable_asset);
        let exposure = variable_pos
            .map(|c| c.amount * c.price)
            .unwrap_or(Decimal::ZERO);

        return RiskSnapshot {
            collateral_value: collateral_val,
            risk_adjusted_collateral: risk_adj_collateral,
            debt_value: debt_val,
            health_factor: None,
            liquidation_price: None,
            liquidation_distance: None,
            risk_level: RiskLevel::Healthy,
            emergency: false,
            variable_asset_exposure: exposure,
            hedge_ratio: Decimal::ZERO,
            target_hedge: Decimal::ZERO,
        };
    }

    // Find variable asset collateral entry
    let variable_pos = match position
        .collateral
        .iter()
        .find(|c| c.asset == variable_asset)
    {
        Some(pos) => pos,
        None => {
            // Degenerate case 2: variable asset not in collateral
            return RiskSnapshot {
                collateral_value: collateral_val,
                risk_adjusted_collateral: risk_adj_collateral,
                debt_value: debt_val,
                health_factor: hf,
                liquidation_price: None,
                liquidation_distance: None,
                risk_level: RiskLevel::Healthy,
                emergency: false,
                variable_asset_exposure: Decimal::ZERO,
                hedge_ratio: Decimal::ZERO,
                target_hedge: Decimal::ZERO,
            };
        }
    };

    let exposure = variable_pos.amount * variable_pos.price;
    let lt = variable_pos.liquidation_threshold.unwrap_or(Decimal::ZERO);
    let variable_adj = variable_pos.amount * variable_pos.price * lt;
    let fixed_adj = risk_adj_collateral - variable_adj;

    let liq_price = liquidation_price(variable_pos.amount, lt, debt_val, fixed_adj);

    // Degenerate case 3: liquidation price cannot be solved (e.g. fixed collateral covers debt)
    let liq_price = match liq_price {
        Some(p) => p,
        None => {
            return RiskSnapshot {
                collateral_value: collateral_val,
                risk_adjusted_collateral: risk_adj_collateral,
                debt_value: debt_val,
                health_factor: hf,
                liquidation_price: None,
                liquidation_distance: None,
                risk_level: RiskLevel::Healthy,
                emergency: false,
                variable_asset_exposure: exposure,
                hedge_ratio: Decimal::ZERO,
                target_hedge: Decimal::ZERO,
            };
        }
    };

    // Degenerate case 4: current_price <= 0
    if variable_pos.price <= Decimal::ZERO {
        return RiskSnapshot {
            collateral_value: collateral_val,
            risk_adjusted_collateral: risk_adj_collateral,
            debt_value: debt_val,
            health_factor: hf,
            liquidation_price: Some(liq_price),
            liquidation_distance: None,
            risk_level: RiskLevel::Critical,
            emergency: true,
            variable_asset_exposure: exposure,
            hedge_ratio: Decimal::ZERO,
            target_hedge: Decimal::ZERO,
        };
    }

    // Normal calculation or negative distance (already past boundary)
    let dist = liquidation_distance(variable_pos.price, liq_price);
    let distance_val = dist.unwrap_or(Decimal::ZERO);

    let level = risk_level(distance_val, policy);
    let ratio = hedge_ratio(level, policy);
    let hedge_amt = target_hedge(exposure, ratio);

    let emergency_threshold = Decimal::new(2, 2); // 0.02 (2%)
    let emergency = distance_val < emergency_threshold;

    RiskSnapshot {
        collateral_value: collateral_val,
        risk_adjusted_collateral: risk_adj_collateral,
        debt_value: debt_val,
        health_factor: hf,
        liquidation_price: Some(liq_price),
        liquidation_distance: dist,
        risk_level: level,
        emergency,
        variable_asset_exposure: exposure,
        hedge_ratio: ratio,
        target_hedge: hedge_amt,
    }
}
