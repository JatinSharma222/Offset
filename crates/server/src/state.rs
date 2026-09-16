use crate::config::ServerConfig;
use crate::schema::{ExecutionRecordGql, RiskSnapshotGql};
use execution::{Executor, SafetyConfig};
use risk_engine::{Position, RiskPolicy};
use sqlx::PgPool;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

#[derive(Clone)]
pub struct AppState {
    pub db_pool: Option<PgPool>,
    pub redis_client: Option<redis::Client>,
    pub config: ServerConfig,
    pub policy: Arc<RwLock<RiskPolicy>>,
    pub safety_config: Arc<RwLock<SafetyConfig>>,
    pub executor: Arc<dyn Executor>,
    pub current_position: Arc<RwLock<Position>>,
    pub latest_snapshot: Arc<RwLock<Option<RiskSnapshotGql>>>,
    pub snapshot_sender: broadcast::Sender<RiskSnapshotGql>,
    pub execution_sender: broadcast::Sender<ExecutionRecordGql>,
}

impl AppState {
    pub fn new(
        config: ServerConfig,
        db_pool: Option<PgPool>,
        redis_client: Option<redis::Client>,
        executor: Arc<dyn Executor>,
        initial_position: Position,
    ) -> Self {
        let (snapshot_sender, _) = broadcast::channel(100);
        let (execution_sender, _) = broadcast::channel(100);

        let safety_config = config.safety.clone();
        Self {
            db_pool,
            redis_client,
            config,
            policy: Arc::new(RwLock::new(RiskPolicy::default())),
            safety_config: Arc::new(RwLock::new(safety_config)),
            executor,
            current_position: Arc::new(RwLock::new(initial_position)),
            latest_snapshot: Arc::new(RwLock::new(None)),
            snapshot_sender,
            execution_sender,
        }
    }
}
