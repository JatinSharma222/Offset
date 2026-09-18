use chrono::{DateTime, Utc};
use reqwest::Client;
use risk_engine::Money;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::str::FromStr;
use std::time::Duration;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum PriceFeedError {
    #[error("HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),
    #[error("JSON decode error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Asset '{0}' not found in price feed")]
    AssetNotFound(String),
    #[error("Invalid price string: '{0}'")]
    InvalidPrice(String),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PricePoint {
    pub timestamp: DateTime<Utc>,
    pub price: Money,
}

/// Free, public real-time price oracle connecting directly to exchange mid-market feeds.
#[derive(Debug, Clone)]
pub struct LivePriceOracle {
    client: Client,
    hyperliquid_url: String,
}

impl LivePriceOracle {
    pub fn new(hyperliquid_url: impl Into<String>) -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(5))
                .build()
                .unwrap_or_default(),
            hyperliquid_url: hyperliquid_url.into(),
        }
    }

    pub fn default_testnet() -> Self {
        Self::new("https://api.hyperliquid-testnet.xyz/info")
    }

    pub fn default_mainnet() -> Self {
        Self::new("https://api.hyperliquid.xyz/info")
    }

    /// Fetches all mid prices from the Hyperliquid info endpoint (public, zero-key).
    pub async fn fetch_mids(&self) -> Result<HashMap<String, Money>, PriceFeedError> {
        let payload = serde_json::json!({ "type": "allMids" });
        let resp = self
            .client
            .post(&self.hyperliquid_url)
            .json(&payload)
            .send()
            .await?;

        let mids: HashMap<String, String> = resp.json().await?;
        let mut result = HashMap::with_capacity(mids.len());

        for (coin, price_str) in mids {
            if let Ok(price) = Decimal::from_str(&price_str) {
                result.insert(coin, price);
            }
        }

        Ok(result)
    }

    /// Fetches real-time price for an asset like "SOL".
    pub async fn fetch_asset_price(&self, asset: &str) -> Result<Money, PriceFeedError> {
        let mids = self.fetch_mids().await?;
        mids.get(asset)
            .copied()
            .ok_or_else(|| PriceFeedError::AssetNotFound(asset.to_string()))
    }
}

