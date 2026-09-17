use risk_engine::{
    format_sweep_csv, format_sweep_table, run_price_sweep, run_price_sweep_with_prices,
    PriceSweepConfig, RiskLevel,
};
use rust_decimal::Decimal;
use rust_decimal_macros::dec;

#[test]
fn test_price_sweep_liquidation_price_invariance() {
    let config = PriceSweepConfig {
        variable_asset: "SOL".to_string(),
        collateral_amount: dec!(100),
        liquidation_threshold: dec!(0.80),
        debt_amount: dec!(14000),
        debt_asset: "USDC".to_string(),
        start_price: dec!(250),
        end_price: dec!(140),
        step_size: dec!(10),
        ..Default::default()
    };

    let steps = run_price_sweep(&config);
    assert!(!steps.is_empty());

    // Expected liquidation price = 14,000 / (100 * 0.80) = $175.00
    let expected_lp = dec!(175);

    for step in &steps {
        assert_eq!(
            step.snapshot.liquidation_price,
            Some(expected_lp),
            "Liquidation price must remain constant across all prices when debt and collateral are fixed"
        );
    }
}

#[test]
fn test_price_sweep_monotonic_hf_and_distance_decrease() {
    let config = PriceSweepConfig::default();
    let steps = run_price_sweep(&config);

    for window in steps.windows(2) {
        let prev = &window[0];
        let curr = &window[1];

        // As price decreases:
        assert!(prev.price > curr.price);

        // HF must decrease
        let prev_hf = prev.snapshot.health_factor.unwrap();
        let curr_hf = curr.snapshot.health_factor.unwrap();
        assert!(
            prev_hf > curr_hf,
            "HF must decrease monotonically as price falls"
        );

        // Liquidation distance must decrease
        let prev_dist = prev.snapshot.liquidation_distance.unwrap();
        let curr_dist = curr.snapshot.liquidation_distance.unwrap();
        assert!(
            prev_dist > curr_dist,
            "Liquidation distance must decrease monotonically as price falls"
        );
    }
}

#[test]
fn test_price_sweep_risk_level_transitions() {
    // 100 SOL, LT 0.80, Debt 14,000 => Liq Price $175
    // Distance = (Price - 175) / Price
    // Price $220 -> Distance 20.45% -> Healthy (ratio 0%)
    // Price $200 -> Distance 12.50% -> Warning (ratio 25%)
    // Price $190 -> Distance 7.89%  -> Danger  (ratio 50%)
    // Price $180 -> Distance 2.78%  -> Critical (ratio 75%, emergency false)
    // Price $175 -> Distance 0.00%  -> Critical (ratio 75%, emergency true)
    // Price $160 -> Distance -9.38% -> Critical (ratio 75%, emergency true)
    let prices = vec![
        dec!(220),
        dec!(200),
        dec!(190),
        dec!(180),
        dec!(175),
        dec!(160),
    ];

    let config = PriceSweepConfig::default();
    let steps = run_price_sweep_with_prices(&prices, &config);

    assert_eq!(steps.len(), 6);

    // Step 0: $220 - Healthy
    assert_eq!(steps[0].snapshot.risk_level, RiskLevel::Healthy);
    assert_eq!(steps[0].snapshot.hedge_ratio, dec!(0.0));
    assert_eq!(steps[0].snapshot.target_hedge, dec!(0));
    assert!(!steps[0].snapshot.emergency);

    // Step 1: $200 - Warning
    assert_eq!(steps[1].snapshot.risk_level, RiskLevel::Warning);
    assert_eq!(steps[1].snapshot.hedge_ratio, dec!(0.25));
    assert_eq!(steps[1].snapshot.target_hedge, dec!(5000)); // 20,000 * 0.25
    assert!(!steps[1].snapshot.emergency);

    // Step 2: $190 - Danger
    assert_eq!(steps[2].snapshot.risk_level, RiskLevel::Danger);
    assert_eq!(steps[2].snapshot.hedge_ratio, dec!(0.50));
    assert_eq!(steps[2].snapshot.target_hedge, dec!(9500)); // 19,000 * 0.50
    assert!(!steps[2].snapshot.emergency);

    // Step 3: $180 - Critical (distance 2.78% > 2% emergency)
    assert_eq!(steps[3].snapshot.risk_level, RiskLevel::Critical);
    assert_eq!(steps[3].snapshot.hedge_ratio, dec!(0.75));
    assert_eq!(steps[3].snapshot.target_hedge, dec!(13500)); // 18,000 * 0.75
    assert!(!steps[3].snapshot.emergency);

    // Step 4: $175 - Critical with Emergency (distance 0.00% <= 2%)
    assert_eq!(steps[4].snapshot.risk_level, RiskLevel::Critical);
    assert_eq!(steps[4].snapshot.hedge_ratio, dec!(0.75));
    assert_eq!(steps[4].snapshot.target_hedge, dec!(13125)); // 17,500 * 0.75
    assert!(steps[4].snapshot.emergency);

    // Step 5: $160 - Past boundary (negative distance)
    assert_eq!(steps[5].snapshot.risk_level, RiskLevel::Critical);
    assert_eq!(steps[5].snapshot.hedge_ratio, dec!(0.75));
    assert!(steps[5].snapshot.emergency);
    assert!(steps[5].snapshot.liquidation_distance.unwrap() < Decimal::ZERO);
}

#[test]
fn test_sweep_table_and_csv_formatting() {
    let config = PriceSweepConfig {
        start_price: dec!(200),
        end_price: dec!(180),
        step_size: dec!(10),
        ..Default::default()
    };

    let steps = run_price_sweep(&config);
    let table = format_sweep_table(&steps);
    let csv = format_sweep_csv(&steps);

    assert!(table.contains("PRICE"));
    assert!(table.contains("HEALTH FAC"));
    assert!(table.contains("LIQ PRICE"));
    assert!(table.contains("$175.00"));

    assert!(csv.starts_with("price,health_factor,liquidation_price,liquidation_distance_pct,risk_level,emergency,variable_asset_exposure,hedge_ratio_pct,target_hedge"));
    assert!(csv.contains("200,"));
    assert!(csv.contains("190,"));
    assert!(csv.contains("180,"));
}
