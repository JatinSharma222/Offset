use crate::schema::{ExecutionRecordGql, RiskSnapshotGql};
use redis::AsyncCommands;

pub const SNAPSHOTS_CHANNEL: &str = "Offset:snapshots";
pub const EXECUTIONS_CHANNEL: &str = "Offset:executions";

pub fn init_client(redis_url: &str) -> Result<redis::Client, redis::RedisError> {
    redis::Client::open(redis_url)
}

pub async fn publish_snapshot(
    client: &redis::Client,
    snapshot: &RiskSnapshotGql,
) -> Result<(), redis::RedisError> {
    if let Ok(json) = serde_json::to_string(snapshot) {
        let mut conn = client.get_multiplexed_async_connection().await?;
        conn.publish::<_, _, ()>(SNAPSHOTS_CHANNEL, json).await?;
    }
    Ok(())
}

pub async fn publish_execution(
    client: &redis::Client,
    record: &ExecutionRecordGql,
) -> Result<(), redis::RedisError> {
    if let Ok(json) = serde_json::to_string(record) {
        let mut conn = client.get_multiplexed_async_connection().await?;
        conn.publish::<_, _, ()>(EXECUTIONS_CHANNEL, json).await?;
    }
    Ok(())
}
