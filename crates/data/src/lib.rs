pub mod fixtures;
pub mod positions;
pub mod prices;

pub use fixtures::{DataError, HistoricalScenario, ScenarioMetadata};
pub use positions::create_lending_position;
pub use prices::PricePoint;

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal::Decimal;

    #[test]
    fn test_scenario_creation() {
        let scn = HistoricalScenario::solend_whale_2022();
        assert_eq!(scn.id, "solend-whale-2022");
        assert_eq!(scn.collateral_amount, Decimal::new(5_700_000, 0));
        assert_eq!(scn.prices.len(), 48);
    }

    #[test]
    fn test_scenario_loading_and_list() {
        let scenarios = HistoricalScenario::list_all();
        assert_eq!(scenarios.len(), 3);

        let solend = HistoricalScenario::load("solend-whale-2022").unwrap();
        assert_eq!(solend.id, "solend-whale-2022");
        assert_eq!(solend.prices.len(), 48);

        let ftx = HistoricalScenario::load("ftx-collapse-2022").unwrap();
        assert_eq!(ftx.id, "ftx-collapse-2022");
        assert_eq!(ftx.prices.len(), 24);

        let whipsaw = HistoricalScenario::load("sol-whipsaw-2023").unwrap();
        assert_eq!(whipsaw.id, "sol-whipsaw-2023");
        assert_eq!(whipsaw.prices.len(), 13);
    }
}
