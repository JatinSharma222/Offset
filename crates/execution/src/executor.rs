use crate::record::ExecutionRecord;
use async_trait::async_trait;
use risk_engine::Money;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ExecutionError {
    #[error("API error: {0}")]
    Api(String),
    #[error("Network error: {0}")]
    Network(String),
    #[error("Safety violation: {0:?}")]
    Safety(crate::record::SafetyViolation),
    #[error("Internal error: {0}")]
    Internal(String),
}

#[async_trait]
pub trait Executor: Send + Sync {
    async fn current_hedge(&self) -> Result<Money, ExecutionError>;
    async fn adjust_hedge(&self, target_notional: Money)
        -> Result<ExecutionRecord, ExecutionError>;
    async fn close_hedge(&self) -> Result<ExecutionRecord, ExecutionError>;
}
