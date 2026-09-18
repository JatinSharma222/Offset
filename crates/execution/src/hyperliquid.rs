use crate::executor::{ExecutionError, Executor};
use crate::record::{
    BookLevel, BookSnapshot, ClearinghouseState, ExecutionRecord, ExecutionStatus,
};
use crate::safety::{check_pre_trade, SafetyConfig};
use async_trait::async_trait;
use chrono::Utc;
use risk_engine::{Money, Ratio, RiskLevel};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

#[cfg(feature = "live")]
use std::str::FromStr;

#[cfg(feature = "live")]
use ethers::signers::{LocalWallet, Signer};
#[cfg(feature = "live")]
use ethers::types::H160;
#[cfg(feature = "live")]
use hyperliquid_rust_sdk::{
    BaseUrl, ExchangeClient, ExchangeDataStatus, ExchangeResponseStatus, InfoClient,
    MarketOrderParams,
};

/// Configuration for Hyperliquid exchange execution.
///
/// Offset uses Hyperliquid's protocol-native Agent Wallet architecture:
/// The agent private key is restricted by the exchange protocol to trading actions only
/// (market/limit orders, cancellations, leverage updates). The agent wallet CANNOT sign
/// withdrawal or transfer transactions, guaranteeing zero custody over user capital.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HyperliquidConfig {
    pub api_url: String,
    pub account_address: String,
    pub agent_private_key: String,
    pub is_testnet: bool,
    pub coin: String,
    pub max_slippage_bps: u32,
}

impl Default for HyperliquidConfig {
    fn default() -> Self {
        Self {
            api_url: "https://api.hyperliquid-testnet.xyz".to_string(),
            account_address: "0x0000000000000000000000000000000000000000".to_string(),
            agent_private_key: String::new(),
            is_testnet: true,
            coin: "SOL".to_string(),
            max_slippage_bps: 50,
        }
    }
}

impl HyperliquidConfig {
    /// Loads Hyperliquid configuration from environment variables.
    pub fn from_env() -> Self {
        let is_testnet = std::env::var("HYPERLIQUID_ENV")
            .map(|v| v.to_lowercase() != "mainnet")
            .unwrap_or(true);
        let default_url = if is_testnet {
            "https://api.hyperliquid-testnet.xyz".to_string()
        } else {
            "https://api.hyperliquid.xyz".to_string()
        };
        let api_url = std::env::var("HYPERLIQUID_API_URL").unwrap_or(default_url);
        let account_address = std::env::var("HYPERLIQUID_ACCOUNT_ADDRESS")
            .unwrap_or_else(|_| "0x0000000000000000000000000000000000000000".to_string());
        let agent_private_key = std::env::var("HYPERLIQUID_AGENT_PRIVATE_KEY").unwrap_or_default();
        let coin = std::env::var("HYPERLIQUID_COIN").unwrap_or_else(|_| "SOL".to_string());
        let max_slippage_bps = std::env::var("HYPERLIQUID_MAX_SLIPPAGE_BPS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(50);

        Self {
            api_url,
            account_address,
            agent_private_key,
            is_testnet,
            coin,
            max_slippage_bps,
        }
    }

    /// Verifies if a valid 32-byte hex private key is configured for live signing.
    pub fn is_live_capable(&self) -> bool {
        let key = self.agent_private_key.trim();
        if key.is_empty() {
            return false;
        }
        let hex_part = key.strip_prefix("0x").unwrap_or(key);
        hex_part.len() == 64 && hex_part.chars().all(|c| c.is_ascii_hexdigit())
    }

    #[cfg(feature = "live")]
    pub fn base_url(&self) -> BaseUrl {
        if self.is_testnet {
            BaseUrl::Testnet
        } else {
            BaseUrl::Mainnet
        }
    }
}

#[cfg(feature = "live")]
struct LiveContext {
    exchange_client: ExchangeClient,
    info_client: InfoClient,
    #[allow(dead_code)]
    wallet_address: H160,
    target_address: H160,
}

/// Production Hyperliquid executor with testnet/mainnet order placement and simulated fallback.
pub struct HyperliquidExecutor {
    pub config: HyperliquidConfig,
    pub safety_config: Arc<RwLock<SafetyConfig>>,
    current_position: Arc<RwLock<Money>>,
    last_target: Arc<RwLock<Option<Money>>>,
    reference_price: Arc<RwLock<Money>>,
    risk_level: Arc<RwLock<RiskLevel>>,
    liquidation_dist: Arc<RwLock<Option<Ratio>>>,
    last_price_update: Arc<RwLock<chrono::DateTime<chrono::Utc>>>,
    #[cfg(feature = "live")]
    live_context: Arc<RwLock<Option<Arc<LiveContext>>>>,
}

impl HyperliquidExecutor {
    pub fn new(config: HyperliquidConfig) -> Self {
        Self {
            config,
            safety_config: Arc::new(RwLock::new(SafetyConfig::default())),
            current_position: Arc::new(RwLock::new(Decimal::ZERO)),
            last_target: Arc::new(RwLock::new(None)),
            reference_price: Arc::new(RwLock::new(Decimal::new(150, 0))),
            risk_level: Arc::new(RwLock::new(RiskLevel::Healthy)),
            liquidation_dist: Arc::new(RwLock::new(None)),
            last_price_update: Arc::new(RwLock::new(Utc::now())),
            #[cfg(feature = "live")]
            live_context: Arc::new(RwLock::new(None)),
        }
    }

    pub fn with_safety(config: HyperliquidConfig, safety: SafetyConfig) -> Self {
        let executor = Self::new(config);
        executor.set_safety_sync(safety);
        executor
    }

    pub fn set_safety_sync(&self, safety: SafetyConfig) {
        if let Ok(mut lock) = self.safety_config.try_write() {
            *lock = safety;
        }
    }

    pub async fn set_safety_config(&self, safety: SafetyConfig) {
        *self.safety_config.write().await = safety;
    }

    /// Sets market state with current price, risk level, and liquidation distance.
    pub async fn set_market_state(&self, price: Money, level: RiskLevel, distance: Option<Ratio>) {
        *self.reference_price.write().await = price;
        *self.risk_level.write().await = level;
        *self.liquidation_dist.write().await = distance;
        *self.last_price_update.write().await = Utc::now();
    }

    /// Returns the live agent wallet address if configured and live mode is initialized.
    pub async fn agent_wallet_address(&self) -> Option<String> {
        #[cfg(feature = "live")]
        {
            if let Ok(Some(ctx)) = self.init_live_context().await {
                return Some(format!("{:?}", ctx.wallet_address));
            }
        }
        None
    }

    #[cfg(feature = "live")]
    async fn init_live_context(&self) -> Result<Option<Arc<LiveContext>>, ExecutionError> {
        if !self.config.is_live_capable() {
            return Ok(None);
        }

        let mut client_guard = self.live_context.write().await;
        if let Some(ctx) = client_guard.as_ref() {
            return Ok(Some(Arc::clone(ctx)));
        }

        let clean_key = self.config.agent_private_key.trim();
        let clean_key = clean_key.strip_prefix("0x").unwrap_or(clean_key);
        let wallet: LocalWallet = clean_key.parse().map_err(|e| {
            ExecutionError::Internal(format!("Failed to parse agent wallet private key: {e}"))
        })?;

        let wallet_address = wallet.address();
        let base_url = self.config.base_url();

        let info_client = InfoClient::new(None, Some(base_url)).await.map_err(|e| {
            ExecutionError::Network(format!("Failed to connect Hyperliquid InfoClient: {e}"))
        })?;

        let exchange_client = ExchangeClient::new(None, wallet, Some(base_url), None, None)
            .await
            .map_err(|e| {
                ExecutionError::Network(format!(
                    "Failed to initialize Hyperliquid ExchangeClient: {e}"
                ))
            })?;

        let target_address = self
            .config
            .account_address
            .trim()
            .parse::<H160>()
            .unwrap_or(wallet_address);

        let ctx = Arc::new(LiveContext {
            exchange_client,
            info_client,
            wallet_address,
            target_address,
        });

        *client_guard = Some(Arc::clone(&ctx));
        tracing::info!(
            "Connected to Hyperliquid ({}) with agent wallet {:?}",
            if self.config.is_testnet {
                "Testnet"
            } else {
                "Mainnet"
            },
            wallet_address
        );

        Ok(Some(ctx))
    }

    /// Fetches live clearinghouse state from Hyperliquid or falls back to local accounting.
    pub async fn clearinghouse_state(&self) -> ClearinghouseState {
        #[cfg(feature = "live")]
        {
            if let Ok(Some(ctx)) = self.init_live_context().await {
                if let Ok(state) = ctx.info_client.user_state(ctx.target_address).await {
                    let pos_opt = state
                        .asset_positions
                        .iter()
                        .find(|p| p.position.coin == self.config.coin);
                    if let Some(pos) = pos_opt {
                        let notional = Decimal::from_str(&pos.position.position_value)
                            .unwrap_or(Decimal::ZERO);
                        let entry = pos
                            .position
                            .entry_px
                            .as_ref()
                            .and_then(|px| Decimal::from_str(px).ok());
                        let unpnl = Decimal::from_str(&pos.position.unrealized_pnl)
                            .unwrap_or(Decimal::ZERO);
                        let funding = Decimal::from_str(&pos.position.cum_funding.all_time)
                            .unwrap_or(Decimal::ZERO);
                        return ClearinghouseState {
                            position_notional: notional,
                            entry_price: entry,
                            unrealized_pnl: unpnl,
                            realized_pnl: Decimal::ZERO,
                            total_pnl: unpnl,
                            cumulative_funding: funding,
                            cumulative_slippage: Decimal::ZERO,
                        };
                    }
                }
            }
        }

        let pos = *self.current_position.read().await;
        let ref_px = *self.reference_price.read().await;
        ClearinghouseState {
            position_notional: pos,
            entry_price: if pos.is_zero() { None } else { Some(ref_px) },
            unrealized_pnl: Decimal::ZERO,
            realized_pnl: Decimal::ZERO,
            total_pnl: Decimal::ZERO,
            cumulative_funding: Decimal::ZERO,
            cumulative_slippage: Decimal::ZERO,
        }
    }

    /// Fetches the live mid price for the configured coin from Hyperliquid.
    pub async fn fetch_live_price(&self) -> Result<Money, ExecutionError> {
        #[cfg(feature = "live")]
        {
            if let Some(ctx) = self.init_live_context().await? {
                let mids = ctx.info_client.all_mids().await.map_err(|e| {
                    ExecutionError::Network(format!("Failed to fetch Hyperliquid mids: {e}"))
                })?;
                if let Some(mid_str) = mids.get(&self.config.coin) {
                    if let Ok(dec) = Decimal::from_str(mid_str) {
                        *self.reference_price.write().await = dec;
                        *self.last_price_update.write().await = Utc::now();
                        return Ok(dec);
                    }
                }
            }
        }
        Ok(*self.reference_price.read().await)
    }

    /// Fetches a 5-level L2 orderbook snapshot.
    pub async fn fetch_live_book(&self) -> Result<Option<BookSnapshot>, ExecutionError> {
        #[cfg(feature = "live")]
        {
            if let Some(ctx) = self.init_live_context().await? {
                if let Ok(l2) = ctx.info_client.l2_snapshot(self.config.coin.clone()).await {
                    let bids = l2
                        .levels
                        .first()
                        .map(|lvls| {
                            lvls.iter()
                                .take(5)
                                .filter_map(|l| {
                                    Some(BookLevel {
                                        price: Decimal::from_str(&l.px).ok()?,
                                        size: Decimal::from_str(&l.sz).ok()?,
                                    })
                                })
                                .collect()
                        })
                        .unwrap_or_default();

                    let asks = l2
                        .levels
                        .get(1)
                        .map(|lvls| {
                            lvls.iter()
                                .take(5)
                                .filter_map(|l| {
                                    Some(BookLevel {
                                        price: Decimal::from_str(&l.px).ok()?,
                                        size: Decimal::from_str(&l.sz).ok()?,
                                    })
                                })
                                .collect()
                        })
                        .unwrap_or_default();

                    return Ok(Some(BookSnapshot { bids, asks }));
                }
            }
        }
        Ok(None)
    }

    fn simulated_book(&self, ref_price: Money) -> BookSnapshot {
        let spread_step = ref_price * Decimal::new(1, 4); // 1 bps
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
        BookSnapshot { bids, asks }
    }
}

#[async_trait]
impl Executor for HyperliquidExecutor {
    async fn current_hedge(&self) -> Result<Money, ExecutionError> {
        #[cfg(feature = "live")]
        {
            if let Ok(Some(ctx)) = self.init_live_context().await {
                if let Ok(state) = ctx.info_client.user_state(ctx.target_address).await {
                    if let Some(pos) = state
                        .asset_positions
                        .iter()
                        .find(|p| p.position.coin == self.config.coin)
                    {
                        let is_short = pos.position.szi.starts_with('-');
                        if is_short {
                            if let Ok(val) = Decimal::from_str(&pos.position.position_value) {
                                let val = val.abs();
                                *self.current_position.write().await = val;
                                return Ok(val);
                            }
                        } else {
                            *self.current_position.write().await = Decimal::ZERO;
                            return Ok(Decimal::ZERO);
                        }
                    } else {
                        *self.current_position.write().await = Decimal::ZERO;
                        return Ok(Decimal::ZERO);
                    }
                }
            }
        }

        let pos = *self.current_position.read().await;
        Ok(pos)
    }

    async fn adjust_hedge(
        &self,
        target_notional: Money,
    ) -> Result<ExecutionRecord, ExecutionError> {
        let mut last_target = self.last_target.write().await;
        let mut current_pos = self.current_position.write().await;
        let ref_price = *self.reference_price.read().await;
        let r_level = *self.risk_level.read().await;
        let dist = *self.liquidation_dist.read().await;

        // Idempotency: identical target produces an immediate, zero-slippage no-op
        if let Some(prev) = *last_target {
            if prev == target_notional {
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
                    cloid: None,
                    note: Some("adjust_hedge no-op: target unchanged".to_string()),
                });
            }
        }

        let delta = target_notional - *current_pos;
        let order_size = delta.abs();

        // Safety verification: check pre-trade constraints
        let safety = self.safety_config.read().await.clone();
        let price_age = (Utc::now() - *self.last_price_update.read().await)
            .num_seconds()
            .max(0) as u64;

        let margin_available = Money::new(100_000_000, 0);
        let margin_required = target_notional * Decimal::new(1, 1); // 10% maintenance margin

        if let Err(violation) = check_pre_trade(
            target_notional,
            order_size,
            price_age,
            margin_available,
            margin_required,
            &safety,
        ) {
            tracing::warn!("Pre-trade safety check refused order: {:?}", violation);
            return Ok(ExecutionRecord {
                id: Uuid::new_v4(),
                timestamp: Utc::now(),
                risk_level: r_level,
                liquidation_distance: dist,
                target_notional,
                filled_notional: *current_pos,
                avg_fill_price: None,
                reference_price: ref_price,
                slippage_bps: None,
                residual_exposure: delta,
                status: ExecutionStatus::Refused(violation.clone()),
                book_snapshot: None,
                cloid: None,
                note: Some(format!("Refused by safety check: {:?}", violation)),
            });
        }

        #[cfg(feature = "live")]
        let live_ctx = self.init_live_context().await?;

        #[cfg(feature = "live")]
        if let Some(ctx) = live_ctx {
            // Live Hyperliquid L1 execution path
            let mut execution_ref_px = ref_price;
            if let Ok(mids) = ctx.info_client.all_mids().await {
                if let Some(mid_str) = mids.get(&self.config.coin) {
                    if let Ok(mid_dec) = Decimal::from_str(mid_str) {
                        execution_ref_px = mid_dec;
                        *self.reference_price.write().await = mid_dec;
                        *self.last_price_update.write().await = Utc::now();
                    }
                }
            }

            let live_book = match ctx.info_client.l2_snapshot(self.config.coin.clone()).await {
                Ok(l2) => {
                    let bids = l2
                        .levels
                        .first()
                        .map(|lvls| {
                            lvls.iter()
                                .take(5)
                                .filter_map(|l| {
                                    Some(BookLevel {
                                        price: Decimal::from_str(&l.px).ok()?,
                                        size: Decimal::from_str(&l.sz).ok()?,
                                    })
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    let asks = l2
                        .levels
                        .get(1)
                        .map(|lvls| {
                            lvls.iter()
                                .take(5)
                                .filter_map(|l| {
                                    Some(BookLevel {
                                        price: Decimal::from_str(&l.px).ok()?,
                                        size: Decimal::from_str(&l.sz).ok()?,
                                    })
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    Some(BookSnapshot { bids, asks })
                }
                Err(_) => Some(self.simulated_book(execution_ref_px)),
            };

            let sz_sol = if !execution_ref_px.is_zero() {
                order_size / execution_ref_px
            } else {
                Decimal::ZERO
            };
            let sz_f64 = sz_sol.to_string().parse::<f64>().unwrap_or(0.0);

            // Offset holds a short hedge against collateral depreciation:
            // delta > 0 => increase short hedge => sell (is_buy = false)
            // delta < 0 => reduce/close short hedge => buy back (is_buy = true)
            let is_buy = delta < Decimal::ZERO;

            let order_uuid = Uuid::new_v4();
            let cloid_str = format!("offset-{}", order_uuid.simple());
            let slippage_rate = (Decimal::from(self.config.max_slippage_bps)
                / Decimal::new(10_000, 0))
            .to_string()
            .parse::<f64>()
            .unwrap_or(0.005);

            tracing::info!(
                "Hyperliquid order: {} sz={:.4} {} (notional=${}) via agent wallet",
                if is_buy { "BUY" } else { "SELL" },
                sz_f64,
                self.config.coin,
                order_size
            );

            let order_params = MarketOrderParams {
                asset: &self.config.coin,
                is_buy,
                sz: sz_f64,
                px: None,
                slippage: Some(slippage_rate),
                cloid: Some(order_uuid),
                wallet: None,
            };

            let dispatch_result = ctx.exchange_client.market_open(order_params).await;

            match dispatch_result {
                Ok(ExchangeResponseStatus::Ok(resp)) => {
                    let mut filled_px = execution_ref_px;
                    let mut filled_sz = sz_sol;
                    let mut exec_status = ExecutionStatus::Filled;
                    let mut note = format!(
                        "Hyperliquid testnet order placed via agent wallet ({})",
                        cloid_str
                    );

                    if let Some(statuses) = resp.data {
                        if let Some(first) = statuses.statuses.first() {
                            match first {
                                ExchangeDataStatus::Filled(filled) => {
                                    if let Ok(px) = Decimal::from_str(&filled.avg_px) {
                                        filled_px = px;
                                    }
                                    if let Ok(sz) = Decimal::from_str(&filled.total_sz) {
                                        filled_sz = sz;
                                    }
                                    note = format!(
                                        "Hyperliquid fill oid={}, sz={}, avg_px={}",
                                        filled.oid, filled.total_sz, filled.avg_px
                                    );
                                }
                                ExchangeDataStatus::Resting(resting) => {
                                    note = format!("Hyperliquid order resting oid={}", resting.oid);
                                }
                                ExchangeDataStatus::WaitingForFill => {
                                    exec_status = ExecutionStatus::PartiallyFilled;
                                    note = "Hyperliquid order waiting for fill".to_string();
                                }
                                ExchangeDataStatus::Error(err) => {
                                    exec_status = ExecutionStatus::Failed(err.clone());
                                    note = format!("Hyperliquid order rejected: {}", err);
                                }
                                ExchangeDataStatus::Success => {
                                    note = "Hyperliquid order accepted".to_string();
                                }
                                ExchangeDataStatus::WaitingForTrigger => {
                                    exec_status = ExecutionStatus::PartiallyFilled;
                                    note = "Hyperliquid trigger order waiting".to_string();
                                }
                            }
                        }
                    }

                    let filled_notional = filled_sz * filled_px;
                    let slippage_bps = if !execution_ref_px.is_zero() {
                        Some(
                            ((filled_px - execution_ref_px).abs() / execution_ref_px
                                * Decimal::new(10_000, 0))
                            .round_dp(2),
                        )
                    } else {
                        Some(Decimal::ZERO)
                    };

                    if exec_status == ExecutionStatus::Filled
                        || exec_status == ExecutionStatus::PartiallyFilled
                    {
                        *current_pos = target_notional;
                        *last_target = Some(target_notional);
                    }

                    return Ok(ExecutionRecord {
                        id: Uuid::new_v4(),
                        timestamp: Utc::now(),
                        risk_level: r_level,
                        liquidation_distance: dist,
                        target_notional,
                        filled_notional,
                        avg_fill_price: Some(filled_px),
                        reference_price: execution_ref_px,
                        slippage_bps,
                        residual_exposure: target_notional - filled_notional,
                        status: exec_status,
                        book_snapshot: live_book,
                        cloid: Some(cloid_str),
                        note: Some(note),
                    });
                }
                Ok(ExchangeResponseStatus::Err(err_msg)) => {
                    tracing::warn!("Hyperliquid L1 rejected order: {}", err_msg);
                    return Ok(ExecutionRecord {
                        id: Uuid::new_v4(),
                        timestamp: Utc::now(),
                        risk_level: r_level,
                        liquidation_distance: dist,
                        target_notional,
                        filled_notional: *current_pos,
                        avg_fill_price: None,
                        reference_price: execution_ref_px,
                        slippage_bps: None,
                        residual_exposure: delta,
                        status: ExecutionStatus::Failed(err_msg.clone()),
                        book_snapshot: live_book,
                        cloid: Some(cloid_str),
                        note: Some(format!("Hyperliquid L1 error: {}", err_msg)),
                    });
                }
                Err(e) => {
                    tracing::error!("Hyperliquid network/transport error: {:?}", e);
                    return Err(ExecutionError::Network(format!(
                        "Hyperliquid communication failure: {e}"
                    )));
                }
            }
        }

        // Fallback simulated execution path (offline tests or unconfigured credentials)
        let book = self.simulated_book(ref_price);
        *current_pos = target_notional;
        *last_target = Some(target_notional);
        let cloid_str = format!("sim-hl-{}", Uuid::new_v4().simple());

        Ok(ExecutionRecord {
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
            book_snapshot: Some(book),
            cloid: Some(cloid_str),
            note: Some(format!(
                "Hyperliquid order adjusted: delta ${} -> target ${}",
                delta, target_notional
            )),
        })
    }

    async fn close_hedge(&self) -> Result<ExecutionRecord, ExecutionError> {
        self.adjust_hedge(Decimal::ZERO).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_default_and_env() {
        let config = HyperliquidConfig::default();
        assert!(config.is_testnet);
        assert_eq!(config.coin, "SOL");
        assert_eq!(config.max_slippage_bps, 50);
        assert!(!config.is_live_capable());
    }

    #[test]
    fn test_is_live_capable_validation() {
        let config_empty = HyperliquidConfig {
            agent_private_key: "".to_string(),
            ..Default::default()
        };
        assert!(!config_empty.is_live_capable());

        let config_invalid = HyperliquidConfig {
            agent_private_key: "invalid_key".to_string(),
            ..Default::default()
        };
        assert!(!config_invalid.is_live_capable());

        // 64-character valid hex private key
        let config_valid = HyperliquidConfig {
            agent_private_key: "e908f86dbb4d55ac876378565aafeabc187f6690f046459397b17d9b9a19688e"
                .to_string(),
            ..Default::default()
        };
        assert!(config_valid.is_live_capable());

        // With 0x prefix
        let config_prefix = HyperliquidConfig {
            agent_private_key: "0xe908f86dbb4d55ac876378565aafeabc187f6690f046459397b17d9b9a19688e"
                .to_string(),
            ..Default::default()
        };
        assert!(config_prefix.is_live_capable());
    }

    #[tokio::test]
    async fn test_simulated_fallback_adjust_and_close() {
        let executor = HyperliquidExecutor::new(HyperliquidConfig::default());
        executor
            .set_market_state(Decimal::new(150, 0), RiskLevel::Danger, None)
            .await;

        let initial_hedge = executor.current_hedge().await.unwrap();
        assert_eq!(initial_hedge, Decimal::ZERO);

        let rec1 = executor
            .adjust_hedge(Decimal::new(50_000, 0))
            .await
            .unwrap();
        assert_eq!(rec1.target_notional, Decimal::new(50_000, 0));
        assert_eq!(rec1.filled_notional, Decimal::new(50_000, 0));
        assert_eq!(rec1.status, ExecutionStatus::Filled);
        assert!(rec1.book_snapshot.is_some());

        // Idempotency: second identical adjustment is a no-op
        let rec2 = executor
            .adjust_hedge(Decimal::new(50_000, 0))
            .await
            .unwrap();
        assert_eq!(rec2.status, ExecutionStatus::Filled);
        assert_eq!(
            rec2.note.as_deref(),
            Some("adjust_hedge no-op: target unchanged")
        );

        // Close hedge
        let close_rec = executor.close_hedge().await.unwrap();
        assert_eq!(close_rec.target_notional, Decimal::ZERO);
        assert_eq!(executor.current_hedge().await.unwrap(), Decimal::ZERO);
    }

    #[tokio::test]
    async fn test_safety_refusal() {
        let safety = SafetyConfig {
            kill_switch: true,
            ..Default::default()
        };

        let executor = HyperliquidExecutor::with_safety(HyperliquidConfig::default(), safety);
        let rec = executor
            .adjust_hedge(Decimal::new(10_000, 0))
            .await
            .unwrap();

        match rec.status {
            ExecutionStatus::Refused(crate::record::SafetyViolation::KillSwitchActive) => {}
            other => panic!("Expected KillSwitchActive refusal, got {:?}", other),
        }
    }
}
