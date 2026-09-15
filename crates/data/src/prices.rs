use chrono::{DateTime, Utc};
use risk_engine::Money;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PricePoint {
    pub timestamp: DateTime<Utc>,
    pub price: Money,
}
