pub mod fixtures;
pub mod positions;
pub mod prices;

pub use fixtures::HistoricalScenario;
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
        assert_eq!(scn.prices.len(), 10);
    }
}
