use crate::executor::{ExecutionError, Executor};
use crate::record::{BookLevel, BookSnapshot, ExecutionRecord, ExecutionStatus};
use async_trait::async_trait;
use chrono::Utc;
use risk_engine::{Money, Ratio, RiskLevel};
use rust_decimal::Decimal;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

/// Default hourly funding rate charged on short perpetual positions during market stress.
/// 0.0001 = 1 bps / hour = ~0.08% / 8 hours = ~29.2% annualized.
pub const DEFAULT_HOURLY_FUNDING_RATE: Decimal = Decimal::from_parts(1, 0, 0, false, 4);

/// Execution slippage in basis points applied to simulated orderbook fills (5 bps).
pub const DEFAULT_SLIPPAGE_BPS: Decimal = Decimal::from_parts(5, 0, 0, false, 0);

pub use crate::record::ClearinghouseState;

#[derive(Debug, Clone)]
pub struct SimulatedExecutor {
    current_position: Arc<RwLock<Money>>,
    reference_price: Arc<RwLock<Money>>,
    entry_price: Arc<RwLock<Option<Money>>>,
    realized_pnl: Arc<RwLock<Money>>,
    cumulative_funding: Arc<RwLock<Money>>,
    cumulative_slippage: Arc<RwLock<Money>>,
    hourly_funding_rate: Arc<RwLock<Ratio>>,
    risk_level: Arc<RwLock<RiskLevel>>,
    liquidation_dist: Arc<RwLock<Option<Ratio>>>,
    counter: Arc<AtomicI64>,
}

impl Default for SimulatedExecutor {
    fn default() -> Self {
        Self::new(Money::new(200, 0))
    }
}

impl SimulatedExecutor {
    pub fn new(initial_price: Money) -> Self {
        Self {
            current_position: Arc::new(RwLock::new(Decimal::ZERO)),
            reference_price: Arc::new(RwLock::new(initial_price)),
            entry_price: Arc::new(RwLock::new(None)),
            realized_pnl: Arc::new(RwLock::new(Decimal::ZERO)),
            cumulative_funding: Arc::new(RwLock::new(Decimal::ZERO)),
            cumulative_slippage: Arc::new(RwLock::new(Decimal::ZERO)),
            hourly_funding_rate: Arc::new(RwLock::new(DEFAULT_HOURLY_FUNDING_RATE)),
            risk_level: Arc::new(RwLock::new(RiskLevel::Healthy)),
            liquidation_dist: Arc::new(RwLock::new(None)),
            counter: Arc::new(AtomicI64::new(0)),
        }
    }

    /// Sets a custom hourly funding rate for the simulation.
    pub async fn set_funding_rate(&self, rate: Ratio) {
        *self.hourly_funding_rate.write().await = rate;
    }

    /// Updates market state with current price, risk level, and liquidation distance.
    /// Accumulates hourly funding carry when an open short position is held.
    pub async fn set_market_state(&self, price: Money, level: RiskLevel, distance: Option<Ratio>) {
        let old_price = *self.reference_price.read().await;
        let current_pos = *self.current_position.read().await;

        // Accumulate funding carry over the interval if holding a position
        if !old_price.is_zero() && !current_pos.is_zero() {
            let rate = *self.hourly_funding_rate.read().await;
            let funding_cost = current_pos * rate;
            *self.cumulative_funding.write().await += funding_cost;
        }

        *self.reference_price.write().await = price;
        *self.risk_level.write().await = level;
        *self.liquidation_dist.write().await = distance;
    }

    /// Returns the comprehensive clearinghouse accounting state (P&L, funding carry, slippage).
    pub async fn clearinghouse_state(&self) -> ClearinghouseState {
        let current_pos = *self.current_position.read().await;
        let ref_price = *self.reference_price.read().await;
        let entry = *self.entry_price.read().await;
        let realized = *self.realized_pnl.read().await;
        let funding = *self.cumulative_funding.read().await;
        let slippage = *self.cumulative_slippage.read().await;

        let unrealized = match (entry, !current_pos.is_zero(), !ref_price.is_zero()) {
            (Some(entry_px), true, true) if !entry_px.is_zero() => {
                // Short position P&L: position_notional * (entry - current) / entry
                current_pos * (entry_px - ref_price) / entry_px
            }
            _ => Decimal::ZERO,
        };

        let total = realized + unrealized;

        ClearinghouseState {
            position_notional: current_pos,
            entry_price: entry,
            unrealized_pnl: unrealized,
            realized_pnl: realized,
            total_pnl: total,
            cumulative_funding: funding,
            cumulative_slippage: slippage,
        }
    }
}

#[async_trait]
impl Executor for SimulatedExecutor {
    async fn current_hedge(&self) -> Result<Money, ExecutionError> {
        let pos = *self.current_position.read().await;
        Ok(pos)
    }

    async fn adjust_hedge(
        &self,
        target_notional: Money,
    ) -> Result<ExecutionRecord, ExecutionError> {
        let mut current = self.current_position.write().await;
        let ref_price = *self.reference_price.read().await;
        let r_level = *self.risk_level.read().await;
        let dist = *self.liquidation_dist.read().await;

        let delta = target_notional - *current;

        // Idempotent: no-op if target equals current
        if delta.is_zero() {
            return Ok(ExecutionRecord {
                id: Uuid::new_v4(),
                timestamp: Utc::now(),
                risk_level: r_level,
                liquidation_distance: dist,
                target_notional,
                filled_notional: *current,
                avg_fill_price: Some(ref_price),
                reference_price: ref_price,
                slippage_bps: Some(Decimal::ZERO),
                residual_exposure: Decimal::ZERO,
                status: ExecutionStatus::Filled,
                book_snapshot: None,
                cloid: Some(format!(
                    "sim-noop-{}",
                    self.counter.fetch_add(1, Ordering::SeqCst)
                )),
                note: Some("Idempotent no-op: target unchanged".to_string()),
            });
        }

        // Simulated book: 5 levels
        let spread_step = ref_price * Decimal::new(1, 4); // 1 bps per level
        let bids = (1..=5)
            .map(|i| BookLevel {
                price: ref_price - spread_step * Decimal::from(i),
                size: Decimal::from(1000 * i),
            })
            .collect();
        let asks = (1..=5)
            .map(|i| BookLevel {
                price: ref_price + spread_step * Decimal::from(i),
                size: Decimal::from(1000 * i),
            })
            .collect();

        let slippage_bps = DEFAULT_SLIPPAGE_BPS; // 5 bps
        let slippage_factor = Decimal::new(5, 4); // 0.0005

        let fill_price = if delta > Decimal::ZERO {
            // Increasing short (selling into bid): fill price is lower than mid
            let px = ref_price * (Decimal::ONE - slippage_factor);
            let slip_cost = delta * slippage_factor;
            *self.cumulative_slippage.write().await += slip_cost;

            // Update weighted average entry price
            let mut entry_guard = self.entry_price.write().await;
            match *entry_guard {
                Some(old_entry) if !current.is_zero() && !old_entry.is_zero() => {
                    let old_units = *current / old_entry;
                    let new_units = delta / px;
                    let total_units = old_units + new_units;
                    if !total_units.is_zero() {
                        *entry_guard = Some((*current + delta) / total_units);
                    }
                }
                _ => {
                    *entry_guard = Some(px);
                }
            }
            px
        } else {
            // Decreasing short (buying from ask): fill price is higher than mid
            let px = ref_price * (Decimal::ONE + slippage_factor);
            let closed_notional = -delta;
            let slip_cost = closed_notional * slippage_factor;
            *self.cumulative_slippage.write().await += slip_cost;

            // Realize P&L on closed portion of the short
            let mut entry_guard = self.entry_price.write().await;
            if let Some(entry) = *entry_guard {
                if !entry.is_zero() {
                    let closed_pnl = closed_notional * (entry - px) / entry;
                    *self.realized_pnl.write().await += closed_pnl;
                }
            }
            if target_notional.is_zero() {
                *entry_guard = None;
            }
            px
        };

        *current = target_notional;

        Ok(ExecutionRecord {
            id: Uuid::new_v4(),
            timestamp: Utc::now(),
            risk_level: r_level,
            liquidation_distance: dist,
            target_notional,
            filled_notional: target_notional,
            avg_fill_price: Some(fill_price),
            reference_price: ref_price,
            slippage_bps: Some(slippage_bps),
            residual_exposure: Decimal::ZERO,
            status: ExecutionStatus::Filled,
            book_snapshot: Some(BookSnapshot { bids, asks }),
            cloid: Some(format!(
                "sim-order-{}",
                self.counter.fetch_add(1, Ordering::SeqCst)
            )),
            note: None,
        })
    }

    async fn close_hedge(&self) -> Result<ExecutionRecord, ExecutionError> {
        self.adjust_hedge(Decimal::ZERO).await
    }
}
