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
    current_units: Arc<RwLock<Decimal>>,
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
            current_units: Arc::new(RwLock::new(Decimal::ZERO)),
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

    /// Returns the currently held hedge position in base asset units (e.g. SOL).
    pub async fn current_units(&self) -> Decimal {
        *self.current_units.read().await
    }

    /// Sets a custom hourly funding rate for the simulation.
    pub async fn set_funding_rate(&self, rate: Ratio) {
        *self.hourly_funding_rate.write().await = rate;
    }

    /// Updates market state with current price, risk level, and liquidation distance.
    /// Accumulates hourly funding carry when an open short position is held.
    pub async fn set_market_state(&self, price: Money, level: RiskLevel, distance: Option<Ratio>) {
        let old_price = *self.reference_price.read().await;
        let units = *self.current_units.read().await;

        // Accumulate funding carry over the interval if holding a position.
        // Funding cost is charged on current mark-to-market notional (units * price * rate).
        if !old_price.is_zero() && !units.is_zero() {
            let rate = *self.hourly_funding_rate.read().await;
            let current_notional = units * price;
            let funding_cost = current_notional * rate;
            *self.cumulative_funding.write().await += funding_cost;
        }

        *self.reference_price.write().await = price;
        *self.risk_level.write().await = level;
        *self.liquidation_dist.write().await = distance;
    }

    /// Returns the comprehensive clearinghouse accounting state (P&L, funding carry, slippage).
    pub async fn clearinghouse_state(&self) -> ClearinghouseState {
        let units = *self.current_units.read().await;
        let ref_price = *self.reference_price.read().await;
        let entry = *self.entry_price.read().await;
        let realized = *self.realized_pnl.read().await;
        let funding = *self.cumulative_funding.read().await;
        let slippage = *self.cumulative_slippage.read().await;

        let unrealized = match (entry, !units.is_zero(), !ref_price.is_zero()) {
            (Some(entry_px), true, true) if !entry_px.is_zero() => {
                // Short position P&L: units * (entry - current_price)
                units * (entry_px - ref_price)
            }
            _ => Decimal::ZERO,
        };

        let total = realized + unrealized;

        ClearinghouseState {
            position_notional: units * ref_price,
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
        let units = *self.current_units.read().await;
        let ref_price = *self.reference_price.read().await;
        Ok(units * ref_price)
    }

    async fn adjust_hedge(
        &self,
        target_notional: Money,
    ) -> Result<ExecutionRecord, ExecutionError> {
        let mut units_guard = self.current_units.write().await;
        let current_units = *units_guard;
        let ref_price = *self.reference_price.read().await;
        let r_level = *self.risk_level.read().await;
        let dist = *self.liquidation_dist.read().await;

        let target_units = if !ref_price.is_zero() {
            target_notional / ref_price
        } else {
            Decimal::ZERO
        };

        let delta_units = target_units - current_units;

        // Idempotent: no-op if target units equal current units
        if delta_units.is_zero() {
            return Ok(ExecutionRecord {
                id: Uuid::new_v4(),
                timestamp: Utc::now(),
                risk_level: r_level,
                liquidation_distance: dist,
                target_notional,
                filled_notional: target_notional,
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

        let fill_price = if delta_units > Decimal::ZERO {
            // Increasing short (selling into bid): fill price is lower than mid
            let order_units = delta_units;
            let px = ref_price * (Decimal::ONE - slippage_factor);
            let slip_cost = order_units * ref_price * slippage_factor;
            *self.cumulative_slippage.write().await += slip_cost;

            // Update weighted average entry price
            let mut entry_guard = self.entry_price.write().await;
            let new_units = current_units + order_units;
            match *entry_guard {
                Some(old_entry) if !current_units.is_zero() => {
                    let blended = (current_units * old_entry + order_units * px) / new_units;
                    *entry_guard = Some(blended);
                }
                _ => {
                    *entry_guard = Some(px);
                }
            }
            *units_guard = new_units;
            px
        } else {
            // Decreasing short (buying from ask): fill price is higher than mid
            let closed_units = -delta_units;
            let px = ref_price * (Decimal::ONE + slippage_factor);
            let slip_cost = closed_units * ref_price * slippage_factor;
            *self.cumulative_slippage.write().await += slip_cost;

            // Realize P&L on closed portion of the short
            let mut entry_guard = self.entry_price.write().await;
            if let Some(entry) = *entry_guard {
                let closed_pnl = closed_units * (entry - px);
                *self.realized_pnl.write().await += closed_pnl;
            }
            let new_units = current_units - closed_units;
            *units_guard = new_units;
            if new_units.is_zero() {
                *entry_guard = None;
            }
            px
        };

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

    async fn update_reference_price(&self, price: Money) -> Result<(), ExecutionError> {
        *self.reference_price.write().await = price;
        Ok(())
    }
}
