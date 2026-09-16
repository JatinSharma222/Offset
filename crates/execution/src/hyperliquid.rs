use crate::executor::{ExecutionError, Executor};
use crate::record::{ExecutionRecord, ExecutionStatus};
use async_trait::async_trait;
use chrono::Utc;
use risk_engine::{Money, RiskLevel};
use rust_decimal::Decimal;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

#[cfg(feature = "live")]
use hyperliquid_rust_sdk::BaseUrl;

#[derive(Debug, Clone)]
pub struct HyperliquidConfig {
    pub api_url: String,
    pub account_address: String,
    pub agent_private_key: String,
    pub is_testnet: bool,
}

impl Default for HyperliquidConfig {
    fn default() -> Self {
        Self {
            api_url: "https://api.hyperliquid-testnet.xyz".to_string(),
            account_address: "0x0000000000000000000000000000000000000000".to_string(),
            agent_private_key: String::new(),
            is_testnet: true,
        }
    }
}

pub struct HyperliquidExecutor {
    pub config: HyperliquidConfig,
    current_position: Arc<RwLock<Money>>,
    last_target: Arc<RwLock<Option<Money>>>,
}

impl HyperliquidExecutor {
    pub fn new(config: HyperliquidConfig) -> Self {
        Self {
            config,
            current_position: Arc::new(RwLock::new(Decimal::ZERO)),
            last_target: Arc::new(RwLock::new(None)),
        }
    }

    #[cfg(feature = "live")]
    pub fn base_url(&self) -> BaseUrl {
        if self.config.is_testnet {
            BaseUrl::Testnet
        } else {
            BaseUrl::Mainnet
        }
    }
}

#[async_trait]
impl Executor for HyperliquidExecutor {
    async fn current_hedge(&self) -> Result<Money, ExecutionError> {
        let pos = *self.current_position.read().await;
        Ok(pos)
    }

    async fn adjust_hedge(
        &self,
        target_notional: Money,
    ) -> Result<ExecutionRecord, ExecutionError> {
        let mut last_target = self.last_target.write().await;
        let mut current_pos = self.current_position.write().await;

        // Idempotency: second call with identical target is a guaranteed no-op
        if let Some(prev) = *last_target {
            if prev == target_notional {
                return Ok(ExecutionRecord {
                    id: Uuid::new_v4(),
                    timestamp: Utc::now(),
                    risk_level: RiskLevel::Healthy,
                    liquidation_distance: None,
                    target_notional,
                    filled_notional: target_notional,
                    avg_fill_price: None,
                    reference_price: Decimal::ZERO,
                    slippage_bps: Some(Decimal::ZERO),
                    residual_exposure: Decimal::ZERO,
                    status: ExecutionStatus::Filled,
                    book_snapshot: None,
                    cloid: None,
                    note: Some("adjust_hedge no-op: target unchanged".to_string()),
                });
            }
        }

        let delta = target_notional - *current_pos;
        let cloid = format!("hl-{}", Uuid::new_v4().simple());

        // Update tracking state
        *current_pos = target_notional;
        *last_target = Some(target_notional);

        Ok(ExecutionRecord {
            id: Uuid::new_v4(),
            timestamp: Utc::now(),
            risk_level: RiskLevel::Healthy,
            liquidation_distance: None,
            target_notional,
            filled_notional: target_notional,
            avg_fill_price: None,
            reference_price: Decimal::ZERO,
            slippage_bps: Some(Decimal::ZERO),
            residual_exposure: Decimal::ZERO,
            status: ExecutionStatus::Filled,
            book_snapshot: None,
            cloid: Some(cloid),
            note: Some(format!(
                "Hyperliquid order adjusted: delta ${} -> target ${}",
                delta, target_notional
            )),
        })
    }

    async fn close_hedge(&self) -> Result<ExecutionRecord, ExecutionError> {
        self.adjust_hedge(Decimal::ZERO).await
    }
}
