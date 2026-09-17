pub mod evaluate;
pub mod health_factor;
pub mod hedge;
pub mod liquidation;
pub mod risk;
pub mod sweep;
pub mod types;

// Re-export primary types and entrypoint
pub use evaluate::evaluate_position;
pub use health_factor::{
    debt_value, health_factor, risk_adjusted_collateral, total_collateral_value,
};
pub use hedge::{hedge_ratio, target_hedge};
pub use liquidation::{liquidation_distance, liquidation_price};
pub use risk::risk_level;
pub use sweep::{
    format_sweep_csv, format_sweep_table, run_price_sweep, run_price_sweep_with_prices,
    PriceSweepConfig, PriceSweepStep,
};
pub use types::{
    AssetPosition, HedgeTier, Money, Position, Ratio, RiskLevel, RiskPolicy, RiskSnapshot,
};

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal::Decimal;
    use rust_decimal_macros::dec;

    #[test]
    fn test_health_factor_single_collateral() {
        let pos = Position {
            collateral: vec![AssetPosition {
                asset: "SOL".to_string(),
                amount: dec!(100),
                price: dec!(200),
                liquidation_threshold: Some(dec!(0.80)),
            }],
            debt: vec![AssetPosition {
                asset: "USDC".to_string(),
                amount: dec!(10000),
                price: dec!(1),
                liquidation_threshold: None,
            }],
        };

        let hf = health_factor(&pos).unwrap();
        assert_eq!(hf, dec!(1.6));
    }

    #[test]
    fn test_health_factor_multi_collateral() {
        let pos = Position {
            collateral: vec![
                AssetPosition {
                    asset: "SOL".to_string(),
                    amount: dec!(100),
                    price: dec!(200),
                    liquidation_threshold: Some(dec!(0.80)),
                },
                AssetPosition {
                    asset: "mSOL".to_string(),
                    amount: dec!(50),
                    price: dec!(200),
                    liquidation_threshold: Some(dec!(0.75)),
                },
            ],
            debt: vec![AssetPosition {
                asset: "USDC".to_string(),
                amount: dec!(20000),
                price: dec!(1),
                liquidation_threshold: None,
            }],
        };

        // (100*200*0.80 + 50*200*0.75) / 20000 = (16000 + 7500) / 20000 = 23500 / 20000 = 1.175
        let hf = health_factor(&pos).unwrap();
        assert_eq!(hf, dec!(1.175));
    }

    #[test]
    fn test_health_factor_zero_debt_returns_none() {
        let pos = Position {
            collateral: vec![AssetPosition {
                asset: "SOL".to_string(),
                amount: dec!(100),
                price: dec!(200),
                liquidation_threshold: Some(dec!(0.80)),
            }],
            debt: vec![],
        };

        assert!(health_factor(&pos).is_none());
    }

    #[test]
    fn test_collateral_with_no_liquidation_threshold_contributes_zero() {
        let pos = Position {
            collateral: vec![AssetPosition {
                asset: "SOL".to_string(),
                amount: dec!(100),
                price: dec!(200),
                liquidation_threshold: None,
            }],
            debt: vec![AssetPosition {
                asset: "USDC".to_string(),
                amount: dec!(10000),
                price: dec!(1),
                liquidation_threshold: None,
            }],
        };

        assert_eq!(risk_adjusted_collateral(&pos), Decimal::ZERO);
        assert_eq!(health_factor(&pos).unwrap(), Decimal::ZERO);
    }

    #[test]
    fn test_liquidation_price_no_fixed_collateral() {
        // Test 1: S = 100, LT = 0.80, D = 10,000, F = 0
        // P_liq = (10,000 - 0) / (100 * 0.80) = 125
        let p_liq = liquidation_price(dec!(100), dec!(0.80), dec!(10000), dec!(0)).unwrap();
        assert_eq!(p_liq, dec!(125));
    }

    #[test]
    fn test_liquidation_price_with_fixed_collateral() {
        // Test 4: S = 100, LT = 0.80, D = 20,000, F = 7,500
        // P_liq = (20,000 - 7,500) / (100 * 0.80) = 12,500 / 80 = 156.25
        let p_liq = liquidation_price(dec!(100), dec!(0.80), dec!(20000), dec!(7500)).unwrap();
        assert_eq!(p_liq, dec!(156.25));
    }

    #[test]
    fn test_liquidation_price_returns_none_when_fixed_collateral_covers_debt() {
        // D = 10,000, F = 15,000 -> D - F < 0
        let p_liq = liquidation_price(dec!(100), dec!(0.80), dec!(10000), dec!(15000));
        assert!(p_liq.is_none());
    }

    #[test]
    fn test_liquidation_price_returns_none_when_variable_amount_is_zero() {
        let p_liq = liquidation_price(dec!(0), dec!(0.80), dec!(10000), dec!(0));
        assert!(p_liq.is_none());
    }

    #[test]
    fn test_liquidation_distance_basic() {
        // P = 200, P_liq = 125 -> (200 - 125) / 200 = 75 / 200 = 0.375
        let dist = liquidation_distance(dec!(200), dec!(125)).unwrap();
        assert_eq!(dist, dec!(0.375));
    }

    #[test]
    fn test_liquidation_distance_returns_none_on_zero_or_negative_price() {
        assert!(liquidation_distance(dec!(0), dec!(125)).is_none());
        assert!(liquidation_distance(dec!(-10), dec!(125)).is_none());
    }

    #[test]
    fn test_liquidation_distance_negative_when_past_boundary() {
        // P = 100, P_liq = 125 -> (100 - 125) / 100 = -0.25
        let dist = liquidation_distance(dec!(100), dec!(125)).unwrap();
        assert_eq!(dist, dec!(-0.25));
    }

    #[test]
    fn test_risk_level_boundaries() {
        let policy = RiskPolicy::default();

        // Exactly 15% is Warning (inclusive on lower bound)
        assert_eq!(risk_level(dec!(0.15), &policy), RiskLevel::Warning);
        // Just above 15% is Healthy
        assert_eq!(risk_level(dec!(0.150001), &policy), RiskLevel::Healthy);

        // Exactly 10% is Danger
        assert_eq!(risk_level(dec!(0.10), &policy), RiskLevel::Danger);
        // Just above 10% is Warning
        assert_eq!(risk_level(dec!(0.100001), &policy), RiskLevel::Warning);

        // Exactly 5% is Critical
        assert_eq!(risk_level(dec!(0.05), &policy), RiskLevel::Critical);
        // Just above 5% is Danger
        assert_eq!(risk_level(dec!(0.050001), &policy), RiskLevel::Danger);

        // Below 5% is Critical
        assert_eq!(risk_level(dec!(0.02), &policy), RiskLevel::Critical);
        assert_eq!(risk_level(dec!(-0.10), &policy), RiskLevel::Critical);
    }

    #[test]
    fn test_transition_healthy_warning_danger_critical() {
        let policy = RiskPolicy::default();
        assert_eq!(risk_level(dec!(0.20), &policy), RiskLevel::Healthy);
        assert_eq!(risk_level(dec!(0.12), &policy), RiskLevel::Warning);
        assert_eq!(risk_level(dec!(0.08), &policy), RiskLevel::Danger);
        assert_eq!(risk_level(dec!(0.03), &policy), RiskLevel::Critical);
    }

    #[test]
    fn test_hedge_ratio_per_level() {
        let policy = RiskPolicy::default();
        assert_eq!(hedge_ratio(RiskLevel::Healthy, &policy), dec!(0.0));
        assert_eq!(hedge_ratio(RiskLevel::Warning, &policy), dec!(0.25));
        assert_eq!(hedge_ratio(RiskLevel::Danger, &policy), dec!(0.50));
        assert_eq!(hedge_ratio(RiskLevel::Critical, &policy), dec!(0.75));
    }

    #[test]
    fn test_target_hedge_exposure_times_ratio() {
        assert_eq!(target_hedge(dec!(20000), dec!(0.25)), dec!(5000));
        assert_eq!(target_hedge(dec!(20000), dec!(0.50)), dec!(10000));
        assert_eq!(target_hedge(dec!(20000), dec!(0.75)), dec!(15000));
        assert_eq!(target_hedge(dec!(20000), dec!(0.0)), dec!(0));
    }

    #[test]
    fn test_evaluate_position_test_1_healthy() {
        let pos = Position {
            collateral: vec![AssetPosition {
                asset: "SOL".to_string(),
                amount: dec!(100),
                price: dec!(200),
                liquidation_threshold: Some(dec!(0.80)),
            }],
            debt: vec![AssetPosition {
                asset: "USDC".to_string(),
                amount: dec!(10000),
                price: dec!(1),
                liquidation_threshold: None,
            }],
        };
        let policy = RiskPolicy::default();
        let snapshot = evaluate_position(&pos, "SOL", &policy);

        assert_eq!(snapshot.collateral_value, dec!(20000));
        assert_eq!(snapshot.risk_adjusted_collateral, dec!(16000));
        assert_eq!(snapshot.debt_value, dec!(10000));
        assert_eq!(snapshot.health_factor, Some(dec!(1.6)));
        assert_eq!(snapshot.liquidation_price, Some(dec!(125)));
        assert_eq!(snapshot.liquidation_distance, Some(dec!(0.375)));
        assert_eq!(snapshot.risk_level, RiskLevel::Healthy);
        assert!(!snapshot.emergency);
        assert_eq!(snapshot.variable_asset_exposure, dec!(20000));
        assert_eq!(snapshot.hedge_ratio, dec!(0.0));
        assert_eq!(snapshot.target_hedge, dec!(0));
    }

    #[test]
    fn test_evaluate_position_test_2_warning() {
        let pos = Position {
            collateral: vec![AssetPosition {
                asset: "SOL".to_string(),
                amount: dec!(100),
                price: dec!(200),
                liquidation_threshold: Some(dec!(0.80)),
            }],
            debt: vec![AssetPosition {
                asset: "USDC".to_string(),
                amount: dec!(14000),
                price: dec!(1),
                liquidation_threshold: None,
            }],
        };
        let policy = RiskPolicy::default();
        let snapshot = evaluate_position(&pos, "SOL", &policy);

        assert_eq!(snapshot.collateral_value, dec!(20000));
        assert_eq!(snapshot.risk_adjusted_collateral, dec!(16000));
        assert_eq!(snapshot.debt_value, dec!(14000));
        assert_eq!(snapshot.liquidation_price, Some(dec!(175)));
        assert_eq!(snapshot.liquidation_distance, Some(dec!(0.125)));
        assert_eq!(snapshot.risk_level, RiskLevel::Warning);
        assert!(!snapshot.emergency);
        assert_eq!(snapshot.variable_asset_exposure, dec!(20000));
        assert_eq!(snapshot.hedge_ratio, dec!(0.25));
        assert_eq!(snapshot.target_hedge, dec!(5000));
    }

    #[test]
    fn test_evaluate_position_test_3_critical() {
        let pos = Position {
            collateral: vec![AssetPosition {
                asset: "SOL".to_string(),
                amount: dec!(100),
                price: dec!(200),
                liquidation_threshold: Some(dec!(0.80)),
            }],
            debt: vec![AssetPosition {
                asset: "USDC".to_string(),
                amount: dec!(15500),
                price: dec!(1),
                liquidation_threshold: None,
            }],
        };
        let policy = RiskPolicy::default();
        let snapshot = evaluate_position(&pos, "SOL", &policy);

        assert_eq!(snapshot.collateral_value, dec!(20000));
        assert_eq!(snapshot.risk_adjusted_collateral, dec!(16000));
        assert_eq!(snapshot.debt_value, dec!(15500));
        assert_eq!(snapshot.liquidation_price, Some(dec!(193.75)));
        assert_eq!(snapshot.liquidation_distance, Some(dec!(0.03125)));
        assert_eq!(snapshot.risk_level, RiskLevel::Critical);
        assert!(!snapshot.emergency); // 3.125% is > 2% emergency threshold
        assert_eq!(snapshot.variable_asset_exposure, dec!(20000));
        assert_eq!(snapshot.hedge_ratio, dec!(0.75));
        assert_eq!(snapshot.target_hedge, dec!(15000));
    }

    #[test]
    fn test_evaluate_position_test_4_multi_collateral() {
        let pos = Position {
            collateral: vec![
                AssetPosition {
                    asset: "SOL".to_string(),
                    amount: dec!(100),
                    price: dec!(200),
                    liquidation_threshold: Some(dec!(0.80)),
                },
                AssetPosition {
                    asset: "mSOL".to_string(),
                    amount: dec!(50),
                    price: dec!(200),
                    liquidation_threshold: Some(dec!(0.75)),
                },
            ],
            debt: vec![AssetPosition {
                asset: "USDC".to_string(),
                amount: dec!(20000),
                price: dec!(1),
                liquidation_threshold: None,
            }],
        };
        let policy = RiskPolicy::default();
        let snapshot = evaluate_position(&pos, "SOL", &policy);

        assert_eq!(snapshot.liquidation_price, Some(dec!(156.25)));
        assert_eq!(snapshot.liquidation_distance, Some(dec!(0.21875)));
        assert_eq!(snapshot.risk_level, RiskLevel::Healthy);
        assert_eq!(snapshot.target_hedge, dec!(0));
    }

    #[test]
    fn test_evaluate_position_variable_asset_absent() {
        let pos = Position {
            collateral: vec![AssetPosition {
                asset: "ETH".to_string(),
                amount: dec!(10),
                price: dec!(3000),
                liquidation_threshold: Some(dec!(0.80)),
            }],
            debt: vec![AssetPosition {
                asset: "USDC".to_string(),
                amount: dec!(10000),
                price: dec!(1),
                liquidation_threshold: None,
            }],
        };
        let policy = RiskPolicy::default();
        let snapshot = evaluate_position(&pos, "SOL", &policy);

        assert_eq!(snapshot.risk_level, RiskLevel::Healthy);
        assert_eq!(snapshot.target_hedge, dec!(0));
        assert!(snapshot.liquidation_price.is_none());
        assert!(snapshot.liquidation_distance.is_none());
    }

    #[test]
    fn test_evaluate_position_zero_debt() {
        let pos = Position {
            collateral: vec![AssetPosition {
                asset: "SOL".to_string(),
                amount: dec!(100),
                price: dec!(200),
                liquidation_threshold: Some(dec!(0.80)),
            }],
            debt: vec![],
        };
        let policy = RiskPolicy::default();
        let snapshot = evaluate_position(&pos, "SOL", &policy);

        assert_eq!(snapshot.risk_level, RiskLevel::Healthy);
        assert_eq!(snapshot.target_hedge, dec!(0));
        assert!(snapshot.health_factor.is_none());
        assert!(snapshot.liquidation_price.is_none());
        assert!(snapshot.liquidation_distance.is_none());
    }

    #[test]
    fn test_evaluate_position_zero_price_critical_zero_hedge() {
        let pos = Position {
            collateral: vec![AssetPosition {
                asset: "SOL".to_string(),
                amount: dec!(100),
                price: dec!(0),
                liquidation_threshold: Some(dec!(0.80)),
            }],
            debt: vec![AssetPosition {
                asset: "USDC".to_string(),
                amount: dec!(10000),
                price: dec!(1),
                liquidation_threshold: None,
            }],
        };
        let policy = RiskPolicy::default();
        let snapshot = evaluate_position(&pos, "SOL", &policy);

        assert_eq!(snapshot.risk_level, RiskLevel::Critical);
        assert_eq!(snapshot.target_hedge, dec!(0));
        assert!(snapshot.emergency);
        assert!(snapshot.liquidation_distance.is_none());
    }
}
