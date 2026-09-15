use std::env;

pub const SNAPSHOTS_CHANNEL: &str = "Offset:snapshots";
pub const EXECUTIONS_CHANNEL: &str = "Offset:executions";

pub fn get_redis_url() -> String {
    env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string())
}
