use crate::schema::{ExecutionRecordGql, RiskSnapshotGql};
use redis::aio::MultiplexedConnection;
use redis::AsyncCommands;
use tokio::sync::RwLock;

pub const SNAPSHOTS_CHANNEL: &str = "Offset:snapshots";
pub const EXECUTIONS_CHANNEL: &str = "Offset:executions";

pub fn init_client(redis_url: &str) -> Result<redis::Client, redis::RedisError> {
    redis::Client::open(redis_url)
}

/// Retrieves the existing cached multiplexed connection or establishes a new one.
pub async fn get_connection(
    client: &redis::Client,
    conn_slot: &RwLock<Option<MultiplexedConnection>>,
) -> Result<MultiplexedConnection, redis::RedisError> {
    {
        let guard = conn_slot.read().await;
        if let Some(conn) = guard.as_ref() {
            return Ok(conn.clone());
        }
    }

    let mut guard = conn_slot.write().await;
    if let Some(conn) = guard.as_ref() {
        return Ok(conn.clone());
    }

    let new_conn = client.get_multiplexed_async_connection().await?;
    *guard = Some(new_conn.clone());
    Ok(new_conn)
}

/// Publishes a risk snapshot using the cached multiplexed connection.
pub async fn publish_snapshot(
    client: &redis::Client,
    conn_slot: &RwLock<Option<MultiplexedConnection>>,
    snapshot: &RiskSnapshotGql,
) -> Result<(), redis::RedisError> {
    if let Ok(json) = serde_json::to_string(snapshot) {
        let mut conn = get_connection(client, conn_slot).await?;
        if let Err(e) = conn.publish::<_, _, ()>(SNAPSHOTS_CHANNEL, json).await {
            // Invalidate cached connection on network error so next attempt reconnects cleanly
            *conn_slot.write().await = None;
            return Err(e);
        }
    }
    Ok(())
}

/// Publishes an execution record using the cached multiplexed connection.
pub async fn publish_execution(
    client: &redis::Client,
    conn_slot: &RwLock<Option<MultiplexedConnection>>,
    record: &ExecutionRecordGql,
) -> Result<(), redis::RedisError> {
    if let Ok(json) = serde_json::to_string(record) {
        let mut conn = get_connection(client, conn_slot).await?;
        if let Err(e) = conn.publish::<_, _, ()>(EXECUTIONS_CHANNEL, json).await {
            *conn_slot.write().await = None;
            return Err(e);
        }
    }
    Ok(())
}
