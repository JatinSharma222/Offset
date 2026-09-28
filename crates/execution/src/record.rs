use chrono::{DateTime, Utc};
use risk_engine::{Money, Ratio, RiskLevel};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BookLevel {
    pub price: Money,
    pub size: Money,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BookSnapshot {
    pub bids: Vec<BookLevel>,
    pub asks: Vec<BookLevel>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum SafetyViolation {
    MaxNotionalExceeded {
        target: Money,
        cap: Money,
    },
    MaxSingleOrderExceeded {
        size: Money,
        cap: Money,
    },
    StalePrice {
        age_secs: u64,
    },
    InsufficientMargin {
        required: Money,
        available: Money,
    },
    BookTooThin {
        available_depth: Money,
        needed: Money,
    },
    KillSwitchActive,
    RateLimited {
        retry_after_secs: u64,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ExecutionStatus {
    Filled,
    PartiallyFilled,
    Refused(SafetyViolation),
    Failed(String),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExecutionRecord {
    pub id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub risk_level: RiskLevel,
    pub liquidation_distance: Option<Ratio>,
    pub target_notional: Money,
    pub filled_notional: Money,
    pub avg_fill_price: Option<Money>,
    pub reference_price: Money, // mid at decision time
    pub slippage_bps: Option<Money>,
    pub residual_exposure: Money, // target - filled
    pub status: ExecutionStatus,
    pub book_snapshot: Option<BookSnapshot>,
    pub cloid: Option<String>,
    pub note: Option<String>, // e.g. safety violation reason
    pub protocol_reference_price: Money, // the price from protocol oracle that triggered decision
    pub hyperliquid_fill_price: Option<Money>, // price at which Hyperliquid filled
    pub basis_bps: Option<Money>, // divergence between the two in basis points
    pub detected_at: DateTime<Utc>, // when the loop observed the threshold crossing
    pub filled_at: Option<DateTime<Utc>>, // when fill was confirmed
    pub latency_ms: Option<i64>, // detection-to-fill latency in milliseconds
}

/// Clearinghouse position, P&L, and carry accounting snapshot from the exchange.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ClearinghouseState {
    pub position_notional: Money,
    pub entry_price: Option<Money>,
    pub unrealized_pnl: Money,
    pub realized_pnl: Money,
    pub total_pnl: Money,
    pub cumulative_funding: Money,
    pub cumulative_slippage: Money,
}
