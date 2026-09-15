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
}
