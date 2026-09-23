use crate::config::ServerConfig;
use crate::schema::{ExecutionRecordGql, RiskSnapshotGql};
use data::{LivePriceOracle, SolanaRpcClient};
use execution::{Executor, SafetyConfig};
use risk_engine::{Position, RiskPolicy};
use rust_decimal::Decimal;
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
    pub current_obligation: Arc<RwLock<data::OnChainObligation>>,
    pub latest_snapshot: Arc<RwLock<Option<RiskSnapshotGql>>>,
    pub price_override: Arc<RwLock<Option<Decimal>>>,
    pub price_oracle: Arc<LivePriceOracle>,
    pub solana_client: Arc<SolanaRpcClient>,
    pub snapshot_sender: broadcast::Sender<RiskSnapshotGql>,
    pub execution_sender: broadcast::Sender<ExecutionRecordGql>,
    pub last_target_hedge: Arc<RwLock<Decimal>>,
    /// Consecutive DB write failures. When this exceeds a threshold, the kill switch activates.
    pub db_failure_count: Arc<std::sync::atomic::AtomicU32>,
    /// Reusable multiplexed Redis connection to avoid TCP connection churn on every publish.
    pub redis_conn: Arc<RwLock<Option<redis::aio::MultiplexedConnection>>>,
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
        let price_oracle = Arc::new(LivePriceOracle::new(&config.live_price_feed_url));
        let solana_client = Arc::new(SolanaRpcClient::new(&config.solana_rpc_url));
        let initial_obligation = data::OnChainObligation::mock_kamino_obligation();

        Self {
            db_pool,
            redis_client,
            config,
            policy: Arc::new(RwLock::new(RiskPolicy::default())),
            safety_config: Arc::new(RwLock::new(safety_config)),
            executor,
            current_position: Arc::new(RwLock::new(initial_position)),
            current_obligation: Arc::new(RwLock::new(initial_obligation)),
            latest_snapshot: Arc::new(RwLock::new(None)),
            price_override: Arc::new(RwLock::new(None)),
            price_oracle,
            solana_client,
            snapshot_sender,
            execution_sender,
            last_target_hedge: Arc::new(RwLock::new(Decimal::ZERO)),
            db_failure_count: Arc::new(std::sync::atomic::AtomicU32::new(0)),
            redis_conn: Arc::new(RwLock::new(None)),
        }
    }
}
