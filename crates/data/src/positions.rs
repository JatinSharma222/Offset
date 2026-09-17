use crate::solana::{OnChainObligation, SolanaRpcClient};
use risk_engine::{AssetPosition, Money, Position, Ratio};
use std::collections::HashMap;

/// Constructs a lending protocol position with variable collateral and stable debt.
pub fn create_lending_position(
    variable_asset: &str,
    variable_amount: Money,
    variable_price: Money,
    liquidation_threshold: Ratio,
    debt_amount: Money,
) -> Position {
    Position {
        collateral: vec![AssetPosition {
            asset: variable_asset.to_string(),
            amount: variable_amount,
            price: variable_price,
            liquidation_threshold: Some(liquidation_threshold),
        }],
        debt: vec![AssetPosition {
            asset: "USDC".to_string(),
            amount: debt_amount,
            price: Money::ONE,
            liquidation_threshold: None,
        }],
    }
}

/// Fetches an on-chain lending position from a Solana RPC endpoint or falls back to standard Kamino vault layout.
pub async fn fetch_onchain_lending_position(
    rpc_url: &str,
    obligation_pubkey: &str,
    current_sol_price: Money,
) -> (Position, OnChainObligation) {
    let client = SolanaRpcClient::new(rpc_url);
    let obligation = client
        .fetch_obligation_with_fallback(obligation_pubkey)
        .await;

    let mut prices = HashMap::new();
    prices.insert("SOL".to_string(), current_sol_price);
    prices.insert("mSOL".to_string(), current_sol_price);
    prices.insert("USDC".to_string(), Money::ONE);

    let position = obligation.to_position(&prices);
    (position, obligation)
}
