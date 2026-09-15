use crate::record::SafetyViolation;
use risk_engine::Money;

#[derive(Debug, Clone)]
pub struct SafetyConfig {
    pub max_total_notional: Money,
    pub max_single_order: Money,
    pub max_price_staleness_secs: u64,
    pub kill_switch: bool,
}

impl Default for SafetyConfig {
    fn default() -> Self {
        Self {
            max_total_notional: Money::new(10_000_000, 0),
            max_single_order: Money::new(1_000_000, 0),
            max_price_staleness_secs: 30,
            kill_switch: false,
        }
    }
}

pub fn check_pre_trade(
    target_notional: Money,
    order_size: Money,
    price_age_secs: u64,
    margin_available: Money,
    margin_required: Money,
    config: &SafetyConfig,
) -> Result<(), SafetyViolation> {
    if config.kill_switch {
        return Err(SafetyViolation::KillSwitchActive);
    }

    if target_notional > config.max_total_notional {
        return Err(SafetyViolation::MaxNotionalExceeded {
            target: target_notional,
            cap: config.max_total_notional,
        });
    }

    if order_size > config.max_single_order {
        return Err(SafetyViolation::MaxSingleOrderExceeded {
            size: order_size,
            cap: config.max_single_order,
        });
    }

    if price_age_secs > config.max_price_staleness_secs {
        return Err(SafetyViolation::StalePrice {
            age_secs: price_age_secs,
        });
    }

    if margin_available < margin_required {
        return Err(SafetyViolation::InsufficientMargin {
            required: margin_required,
            available: margin_available,
        });
    }

    Ok(())
}
