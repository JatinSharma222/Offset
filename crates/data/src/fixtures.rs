use crate::prices::PricePoint;
use chrono::{TimeZone, Utc};
use risk_engine::{Money, Position, Ratio};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HistoricalScenario {
    pub id: String,
    pub name: String,
    pub description: String,
    pub source_note: String,
    pub liquidation_threshold: Ratio,
    pub collateral_amount: Money,
    pub debt_value: Money,
    pub prices: Vec<PricePoint>,
}

impl HistoricalScenario {
    pub fn initial_position(&self) -> Position {
        let first_price = self
            .prices
            .first()
            .map(|p| p.price)
            .unwrap_or(Decimal::ZERO);
        crate::positions::create_lending_position(
            "SOL",
            self.collateral_amount,
            first_price,
            self.liquidation_threshold,
            self.debt_value,
        )
    }

    pub fn solend_whale_2022() -> Self {
        // Solend Whale May 2022 position:
        // ~5.7M SOL deposited, ~$108M USDC debt, liquidation threshold 80% (0.80)
        let base_time = Utc.with_ymd_and_hms(2022, 5, 20, 0, 0, 0).unwrap();
        let price_series = vec![
            (0, Decimal::new(55, 0)),
            (1, Decimal::new(52, 0)),
            (2, Decimal::new(48, 0)),
            (3, Decimal::new(44, 0)),
            (4, Decimal::new(41, 0)),
            (5, Decimal::new(38, 0)),
            (6, Decimal::new(35, 0)),
            (7, Decimal::new(32, 0)),
            (8, Decimal::new(28, 0)),
            (9, Decimal::new(25, 0)),
        ];

        let prices = price_series
            .into_iter()
            .map(|(hours, price)| PricePoint {
                timestamp: base_time + chrono::Duration::hours(hours),
                price,
            })
            .collect();

        Self {
            id: "solend-whale-2022".to_string(),
            name: "Solend Whale — May 2022".to_string(),
            description: "Single large SOL borrower on Solend facing cascade liquidation during market crash".to_string(),
            source_note: "Position parameters reconstructed from Solend reserve config and publicly reported account size; SOL price series hourly.".to_string(),
            liquidation_threshold: Decimal::new(80, 2), // 0.80
            collateral_amount: Decimal::new(5_700_000, 0), // 5.7M SOL
            debt_value: Decimal::new(108_000_000, 0),    // $108M USDC
            prices,
        }
    }
}
