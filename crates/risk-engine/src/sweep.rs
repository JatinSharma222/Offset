use crate::evaluate::evaluate_position;
use crate::types::{AssetPosition, Money, Position, Ratio, RiskPolicy, RiskSnapshot};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::fmt::Write;

/// A single step in a price sweep evaluation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PriceSweepStep {
    pub price: Money,
    pub snapshot: RiskSnapshot,
}

/// Configuration for sweeping collateral price across a position.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PriceSweepConfig {
    pub variable_asset: String,
    pub collateral_amount: Money,
    pub liquidation_threshold: Ratio,
    pub debt_amount: Money,
    pub debt_asset: String,
    pub start_price: Money,
    pub end_price: Money,
    pub step_size: Money,
    pub policy: RiskPolicy,
}

impl Default for PriceSweepConfig {
    fn default() -> Self {
        Self {
            variable_asset: "SOL".to_string(),
            collateral_amount: Decimal::from(100),
            liquidation_threshold: Decimal::new(80, 2), // 0.80
            debt_amount: Decimal::from(14000),
            debt_asset: "USDC".to_string(),
            start_price: Decimal::from(250),
            end_price: Decimal::from(140),
            step_size: Decimal::from(10),
            policy: RiskPolicy::default(),
        }
    }
}

/// Runs a price sweep across a range of prices from `start_price` down to `end_price`.
pub fn run_price_sweep(config: &PriceSweepConfig) -> Vec<PriceSweepStep> {
    let mut prices = Vec::new();
    let mut current = config.start_price;

    // Generate descending price sequence
    if config.step_size > Decimal::ZERO {
        while current >= config.end_price {
            prices.push(current);
            current -= config.step_size;
        }
    } else {
        prices.push(config.start_price);
    }

    run_price_sweep_with_prices(&prices, config)
}

/// Evaluates a discrete list of prices using the specified configuration.
pub fn run_price_sweep_with_prices(
    prices: &[Money],
    config: &PriceSweepConfig,
) -> Vec<PriceSweepStep> {
    let mut steps = Vec::with_capacity(prices.len());

    for &price in prices {
        let position = Position {
            collateral: vec![AssetPosition {
                asset: config.variable_asset.clone(),
                amount: config.collateral_amount,
                price,
                liquidation_threshold: Some(config.liquidation_threshold),
            }],
            debt: vec![AssetPosition {
                asset: config.debt_asset.clone(),
                amount: config.debt_amount,
                price: Decimal::ONE,
                liquidation_threshold: None,
            }],
        };

        let snapshot = evaluate_position(&position, &config.variable_asset, &config.policy);
        steps.push(PriceSweepStep { price, snapshot });
    }

    steps
}

/// Formats the price sweep results into an aligned, human-readable ASCII table.
pub fn format_sweep_table(steps: &[PriceSweepStep]) -> String {
    let mut out = String::new();
    let separator = "=".repeat(102);

    let _ = writeln!(out, "{}", separator);
    let _ = writeln!(
        out,
        " {:>9} | {:>10} | {:>11} | {:>10} | {:>9} | {:>9} | {:>11} | {:>12}",
        "PRICE",
        "HEALTH FAC",
        "LIQ PRICE",
        "DISTANCE",
        "RISK",
        "EMERGENCY",
        "HEDGE RATIO",
        "TARGET HEDGE"
    );
    let _ = writeln!(out, "{}", separator);

    for step in steps {
        let price_str = format!("${:.2}", step.price);
        let hf_str = match step.snapshot.health_factor {
            Some(hf) => format!("{:.4}", hf),
            None => "N/A".to_string(),
        };
        let liq_price_str = match step.snapshot.liquidation_price {
            Some(lp) => format!("${:.2}", lp),
            None => "N/A".to_string(),
        };
        let dist_str = match step.snapshot.liquidation_distance {
            Some(d) => format!("{:.2}%", d * Decimal::from(100)),
            None => "N/A".to_string(),
        };
        let risk_str = format!("{:?}", step.snapshot.risk_level);
        let emerg_str = if step.snapshot.emergency {
            "CRITICAL!"
        } else {
            "No"
        };
        let ratio_str = format!("{:.1}%", step.snapshot.hedge_ratio * Decimal::from(100));
        let hedge_str = format!("${:.2}", step.snapshot.target_hedge);

        let _ = writeln!(
            out,
            " {:>9} | {:>10} | {:>11} | {:>10} | {:>9} | {:>9} | {:>11} | {:>12}",
            price_str, hf_str, liq_price_str, dist_str, risk_str, emerg_str, ratio_str, hedge_str
        );
    }

    let _ = writeln!(out, "{}", separator);
    out
}

/// Emits the price sweep results in standard CSV format.
pub fn format_sweep_csv(steps: &[PriceSweepStep]) -> String {
    let mut out = String::new();
    out.push_str("price,health_factor,liquidation_price,liquidation_distance_pct,risk_level,emergency,variable_asset_exposure,hedge_ratio_pct,target_hedge\n");

    for step in steps {
        let hf_str = step
            .snapshot
            .health_factor
            .map(|v| v.to_string())
            .unwrap_or_else(|| "".to_string());
        let lp_str = step
            .snapshot
            .liquidation_price
            .map(|v| v.to_string())
            .unwrap_or_else(|| "".to_string());
        let dist_pct_str = step
            .snapshot
            .liquidation_distance
            .map(|v| (v * Decimal::from(100)).to_string())
            .unwrap_or_else(|| "".to_string());
        let ratio_pct = (step.snapshot.hedge_ratio * Decimal::from(100)).to_string();

        let _ = writeln!(
            out,
            "{},{},{},{},{:?},{},{},{},{}",
            step.price,
            hf_str,
            lp_str,
            dist_pct_str,
            step.snapshot.risk_level,
            step.snapshot.emergency,
            step.snapshot.variable_asset_exposure,
            ratio_pct,
            step.snapshot.target_hedge
        );
    }

    out
}
