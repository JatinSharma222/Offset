use crate::schema::*;
use crate::state::AppState;
use async_graphql::{Context, Result, Subscription};
use futures_util::Stream;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

pub struct SubscriptionRoot;

#[Subscription]
impl SubscriptionRoot {
    async fn snapshot_stream<'ctx>(
        &self,
        ctx: &'ctx Context<'_>,
    ) -> Result<impl Stream<Item = RiskSnapshotGql> + 'ctx> {
        let state = ctx.data::<AppState>()?;
        let rx = state.snapshot_sender.subscribe();
        Ok(BroadcastStream::new(rx).filter_map(|res| res.ok()))
    }

    async fn execution_stream<'ctx>(
        &self,
        ctx: &'ctx Context<'_>,
    ) -> Result<impl Stream<Item = ExecutionRecordGql> + 'ctx> {
        let state = ctx.data::<AppState>()?;
        let rx = state.execution_sender.subscribe();
        Ok(BroadcastStream::new(rx).filter_map(|res| res.ok()))
    }
}
