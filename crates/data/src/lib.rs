pub mod fixtures;
pub mod positions;
pub mod prices;
pub mod solana;

pub use fixtures::{DataError, HistoricalScenario, ScenarioMetadata};
pub use positions::{create_lending_position, fetch_onchain_lending_position};
pub use prices::{LivePriceOracle, PriceFeedError, PricePoint};
pub use solana::{
    ObligationSource, OnChainBorrow, OnChainDeposit, OnChainObligation, SolanaError,
    SolanaRpcClient,
};

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal::Decimal;
    use std::collections::HashMap;

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

    #[test]
    fn test_onchain_kamino_obligation_to_position() {
        let obl = OnChainObligation::mock_kamino_obligation();
        let mut prices = HashMap::new();
        prices.insert("SOL".to_string(), Decimal::new(150, 0));
        prices.insert("USDC".to_string(), Decimal::ONE);

        let pos = obl.to_position(&prices);
        assert_eq!(pos.collateral.len(), 1);
        assert_eq!(pos.collateral[0].asset, "SOL");
        assert_eq!(pos.collateral[0].amount, Decimal::new(50000, 0));
        assert_eq!(pos.collateral[0].price, Decimal::new(150, 0));
        assert_eq!(
            pos.collateral[0].liquidation_threshold,
            Some(Decimal::new(80, 2))
        );

        assert_eq!(pos.debt.len(), 1);
        assert_eq!(pos.debt[0].asset, "USDC");
        assert_eq!(pos.debt[0].amount, Decimal::new(6500000, 0));
    }

    #[test]
    fn test_onchain_save_obligation_to_position() {
        let obl = OnChainObligation::mock_save_obligation();
        let mut prices = HashMap::new();
        prices.insert("SOL".to_string(), Decimal::new(200, 0));
        prices.insert("USDC".to_string(), Decimal::ONE);

        let pos = obl.to_position(&prices);
        assert_eq!(pos.collateral[0].amount, Decimal::new(100000, 0));
        assert_eq!(pos.debt[0].amount, Decimal::new(14000000, 0));
    }

    #[test]
    fn test_obligation_binary_bytes_parsing() {
        let client = SolanaRpcClient::new("http://localhost:8899");
        // Construct simulated 120-byte obligation account payload
        let mut bytes = vec![0u8; 128];
        // Discriminator (8 bytes)
        bytes[0..8].copy_from_slice(&[1, 2, 3, 4, 5, 6, 7, 8]);
        // Lending market (32 bytes)
        bytes[8..40].copy_from_slice(&[0xaa; 32]);
        // Owner (32 bytes)
        bytes[40..72].copy_from_slice(&[0xbb; 32]);
        // Deposit count = 1
        bytes[72] = 1;
        // Deposit reserve (32 bytes)
        bytes[73..105].copy_from_slice(&[0xcc; 32]);
        // Deposited amount = 25,000 (u64 LE)
        let amount = 25000u64.to_le_bytes();
        bytes[105..113].copy_from_slice(&amount);
        // Liquidation threshold = 8000 bps (0.80)
        let lt_bps = 8000u64.to_le_bytes();
        bytes[113..121].copy_from_slice(&lt_bps);

        let parsed = client
            .parse_obligation_bytes("ObligationPubkey123", &bytes)
            .unwrap();
        assert_eq!(parsed.pubkey, "ObligationPubkey123");
        assert_eq!(parsed.deposits.len(), 1);
        assert_eq!(parsed.deposits[0].deposited_amount, Decimal::from(25000));
        assert_eq!(
            parsed.deposits[0].liquidation_threshold,
            Decimal::new(80, 2)
        );
    }

    #[tokio::test]
    async fn test_fetch_onchain_lending_position_fallback() {
        // Points to an intentionally unreachable RPC to test fallback safety
        let (pos, obl) = fetch_onchain_lending_position(
            "http://127.0.0.1:9999",
            "SimulatedObligationAddress",
            Decimal::new(160, 0),
        )
        .await;

        assert_eq!(obl.source, ObligationSource::MockKamino);
        assert_eq!(pos.collateral[0].asset, "SOL");
        assert_eq!(pos.collateral[0].price, Decimal::new(160, 0));
        assert_eq!(pos.debt[0].asset, "USDC");
    }

    #[tokio::test]
    async fn test_live_price_oracle_handling() {
        let oracle = LivePriceOracle::new("http://127.0.0.1:9999");
        let res = oracle.fetch_asset_price("SOL").await;
        assert!(res.is_err(), "Expected error for unreachable URL");
    }
}
