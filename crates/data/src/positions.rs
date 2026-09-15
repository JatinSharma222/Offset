use risk_engine::{AssetPosition, Money, Position, Ratio};

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
