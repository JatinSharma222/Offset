pub mod executor;
pub mod hyperliquid;
pub mod record;
pub mod safety;
pub mod simulated;

pub use executor::{ExecutionError, Executor};
pub use hyperliquid::{HyperliquidConfig, HyperliquidExecutor};
pub use record::{BookLevel, BookSnapshot, ExecutionRecord, ExecutionStatus, SafetyViolation};
pub use safety::{check_pre_trade, SafetyConfig};
pub use simulated::SimulatedExecutor;

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal::Decimal;

    #[tokio::test]
    async fn test_simulated_executor_idempotency() {
        let sim = SimulatedExecutor::new(Decimal::new(200, 0));
        let target = Decimal::new(5000, 0);

        let rec1 = sim.adjust_hedge(target).await.unwrap();
        assert_eq!(rec1.filled_notional, target);
        assert_eq!(sim.current_hedge().await.unwrap(), target);

        // Call again with same target -> no-op
        let rec2 = sim.adjust_hedge(target).await.unwrap();
        assert_eq!(rec2.filled_notional, target);
        assert!(rec2.note.unwrap().contains("no-op"));
    }

    #[tokio::test]
    async fn test_hyperliquid_executor_idempotency() {
        let hl = HyperliquidExecutor::new(HyperliquidConfig::default());
        let target = Decimal::new(7500, 0);

        let rec1 = hl.adjust_hedge(target).await.unwrap();
        assert_eq!(rec1.filled_notional, target);
        assert!(rec1.cloid.is_some());

        // Second call with same target is guaranteed no-op
        let rec2 = hl.adjust_hedge(target).await.unwrap();
        assert_eq!(rec2.filled_notional, target);
        assert!(rec2.note.unwrap().contains("no-op"));
    }

    #[test]
    fn test_safety_rails_max_notional() {
        let config = SafetyConfig {
            max_total_notional: Decimal::new(10000, 0),
            ..Default::default()
        };

        let res = check_pre_trade(
            Decimal::new(15000, 0),
            Decimal::new(1000, 0),
            5,
            Decimal::new(50000, 0),
            Decimal::new(1000, 0),
            &config,
        );

        assert!(matches!(
            res,
            Err(SafetyViolation::MaxNotionalExceeded { .. })
        ));
    }

    #[test]
    fn test_safety_rails_stale_price() {
        let config = SafetyConfig {
            max_price_staleness_secs: 30,
            ..Default::default()
        };

        let res = check_pre_trade(
            Decimal::new(5000, 0),
            Decimal::new(1000, 0),
            45,
            Decimal::new(50000, 0),
            Decimal::new(1000, 0),
            &config,
        );

        assert!(matches!(res, Err(SafetyViolation::StalePrice { .. })));
    }

    #[test]
    fn test_safety_rails_max_single_order() {
        let config = SafetyConfig {
            max_single_order: Decimal::new(1000, 0),
            ..Default::default()
        };

        let res = check_pre_trade(
            Decimal::new(5000, 0),
            Decimal::new(2500, 0),
            5,
            Decimal::new(50000, 0),
            Decimal::new(1000, 0),
            &config,
        );

        assert!(matches!(
            res,
            Err(SafetyViolation::MaxSingleOrderExceeded { .. })
        ));
    }

    #[test]
    fn test_safety_rails_insufficient_margin() {
        let config = SafetyConfig::default();

        let res = check_pre_trade(
            Decimal::new(5000, 0),
            Decimal::new(1000, 0),
            5,
            Decimal::new(500, 0),  // available
            Decimal::new(1000, 0), // required
            &config,
        );

        assert!(matches!(
            res,
            Err(SafetyViolation::InsufficientMargin { .. })
        ));
    }

    #[test]
    fn test_safety_rails_kill_switch() {
        let config = SafetyConfig {
            kill_switch: true,
            ..Default::default()
        };

        let res = check_pre_trade(
            Decimal::new(5000, 0),
            Decimal::new(1000, 0),
            5,
            Decimal::new(50000, 0),
            Decimal::new(1000, 0),
            &config,
        );

        assert!(matches!(res, Err(SafetyViolation::KillSwitchActive)));
    }
}
