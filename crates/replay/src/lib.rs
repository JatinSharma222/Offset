pub mod attribution;
pub mod runner;

pub use attribution::{OutcomeSummary, ProtectionImpact};
pub use runner::{run_replay, ReplayResult, ReplayTick};

#[cfg(test)]
mod tests {
    use super::*;
    use data::HistoricalScenario;
    use risk_engine::RiskPolicy;

    #[tokio::test]
    async fn test_replay_determinism() {
        let scenario = HistoricalScenario::solend_whale_2022();
        let policy = RiskPolicy::default();

        let run1 = run_replay(&scenario, &policy).await;
        let run2 = run_replay(&scenario, &policy).await;

        assert_eq!(run1.ticks.len(), run2.ticks.len());
        assert_eq!(run1.with_hedge.net_loss, run2.with_hedge.net_loss);
        assert_eq!(run1.without_hedge.net_loss, run2.without_hedge.net_loss);
        assert_eq!(run1.impact.loss_avoided, run2.impact.loss_avoided);
    }

    #[tokio::test]
    async fn test_replay_csv_export() {
        let scenario = HistoricalScenario::solend_whale_2022();
        let policy = RiskPolicy::default();
        let result = run_replay(&scenario, &policy).await;

        let csv = result.to_csv();
        assert!(csv.starts_with("timestamp,price,health_factor"));
        assert!(csv.contains("55.20"));
        assert_eq!(csv.lines().count(), result.ticks.len() + 1);
    }

    #[tokio::test]
    async fn test_ftx_and_whipsaw_replays() {
        let policy = RiskPolicy::default();

        let ftx = HistoricalScenario::ftx_collapse_2022();
        let ftx_result = run_replay(&ftx, &policy).await;
        assert_eq!(ftx_result.ticks.len(), 24);
        assert!(ftx_result.impact.loss_avoided > rust_decimal::Decimal::ZERO);

        let whipsaw = HistoricalScenario::sol_whipsaw_2023();
        let whipsaw_result = run_replay(&whipsaw, &policy).await;
        assert_eq!(whipsaw_result.ticks.len(), 13);
    }
}
