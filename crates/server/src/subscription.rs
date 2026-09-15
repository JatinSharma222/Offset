use crate::schema::*;
use async_graphql::Subscription;
use chrono::Utc;
use futures_util::Stream;
use rust_decimal_macros::dec;
use std::time::Duration;
use tokio_stream::StreamExt;
use uuid::Uuid;

pub struct SubscriptionRoot;

#[Subscription]
impl SubscriptionRoot {
    async fn snapshot_stream(&self) -> impl Stream<Item = RiskSnapshotGql> {
        tokio_stream::wrappers::IntervalStream::new(tokio::time::interval(Duration::from_secs(5)))
            .map(|_| RiskSnapshotGql {
                id: Uuid::new_v4().to_string(),
                timestamp: Utc::now(),
                price: dec!(184.20),
                collateral_value: dec!(18420000),
                risk_adjusted_collateral: dec!(14736000),
                debt_value: dec!(13800000),
                health_factor: Some(dec!(1.067)),
                liquidation_price: Some(dec!(172.50)),
                liquidation_distance: Some(dec!(0.0635)),
                risk_level: RiskLevelGql::Danger,
                emergency: false,
                exposure: dec!(18420000),
                hedge_ratio: dec!(0.50),
                target_hedge: dec!(9210000),
            })
    }

    async fn execution_stream(&self) -> impl Stream<Item = ExecutionRecordGql> {
        tokio_stream::wrappers::IntervalStream::new(tokio::time::interval(Duration::from_secs(15)))
            .map(|_| ExecutionRecordGql {
                id: Uuid::new_v4().to_string(),
                timestamp: Utc::now(),
                risk_level: RiskLevelGql::Danger,
                liquidation_distance: Some(dec!(0.0635)),
                target_notional: dec!(9210000),
                filled_notional: dec!(9210000),
                avg_fill_price: Some(dec!(184.12)),
                reference_price: dec!(184.20),
                slippage_bps: Some(dec!(4.3)),
                residual_exposure: dec!(0),
                status: ExecutionStatusGql::Filled,
                note: None,
                book_snapshot: None,
            })
    }
}
