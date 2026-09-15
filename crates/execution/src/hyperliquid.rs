use crate::executor::{ExecutionError, Executor};
use crate::record::{ExecutionRecord, ExecutionStatus};
use async_trait::async_trait;
use chrono::Utc;
use risk_engine::{Money, RiskLevel};
use rust_decimal::Decimal;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct HyperliquidConfig {
    pub api_url: String,
    pub account_address: String,
    pub agent_private_key: String,
    pub is_testnet: bool,
}

pub struct HyperliquidExecutor {
    pub config: HyperliquidConfig,
}

impl HyperliquidExecutor {
    pub fn new(config: HyperliquidConfig) -> Self {
        Self { config }
    }
}

#[async_trait]
impl Executor for HyperliquidExecutor {
    async fn current_hedge(&self) -> Result<Money, ExecutionError> {
        // Query position via Hyperliquid API
        // For testnet/scaffold fallback
        Ok(Decimal::ZERO)
    }

    async fn adjust_hedge(
        &self,
        target_notional: Money,
    ) -> Result<ExecutionRecord, ExecutionError> {
        // Formulate and sign trading order via agent key
        let cloid = format!("hl-{}", Uuid::new_v4().simple());
        Ok(ExecutionRecord {
            id: Uuid::new_v4(),
            timestamp: Utc::now(),
            risk_level: RiskLevel::Healthy,
            liquidation_distance: None,
            target_notional,
            filled_notional: target_notional,
            avg_fill_price: None,
            reference_price: Decimal::ZERO,
            slippage_bps: None,
            residual_exposure: Decimal::ZERO,
            status: ExecutionStatus::Filled,
            book_snapshot: None,
            cloid: Some(cloid),
            note: Some("Hyperliquid live executor scaffold".to_string()),
        })
    }

    async fn close_hedge(&self) -> Result<ExecutionRecord, ExecutionError> {
        self.adjust_hedge(Decimal::ZERO).await
    }
}
