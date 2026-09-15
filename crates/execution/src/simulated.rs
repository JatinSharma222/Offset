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

#[derive(Debug, Clone)]
pub struct SimulatedExecutor {
    current_position: Arc<RwLock<Money>>,
    reference_price: Arc<RwLock<Money>>,
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
            risk_level: Arc::new(RwLock::new(RiskLevel::Healthy)),
            liquidation_dist: Arc::new(RwLock::new(None)),
            counter: Arc::new(AtomicI64::new(0)),
        }
    }

    pub async fn set_market_state(&self, price: Money, level: RiskLevel, distance: Option<Ratio>) {
        *self.reference_price.write().await = price;
        *self.risk_level.write().await = level;
        *self.liquidation_dist.write().await = distance;
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

        // Model mild execution slippage (e.g. 5 bps)
        let slippage_bps = Decimal::new(5, 0); // 5 bps
        let fill_price = ref_price * (Decimal::ONE - Decimal::new(5, 4));

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
