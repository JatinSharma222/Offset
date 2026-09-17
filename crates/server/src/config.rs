use execution::SafetyConfig;
use rust_decimal::Decimal;
use std::env;
use std::str::FromStr;

#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub database_url: String,
    pub redis_url: String,
    pub server_port: u16,
    pub loop_interval_secs: u64,
    pub min_hedge_adjustment_usd: Decimal,
    pub solana_rpc_url: String,
    pub solana_obligation_pubkey: String,
    pub safety: SafetyConfig,
}

impl ServerConfig {
    pub fn from_env() -> Self {
        let database_url = env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://Offset:Offset@localhost:5432/Offset".to_string());
        let redis_url =
            env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
        let server_port = env::var("SERVER_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(8080);
        let loop_interval_secs = env::var("LOOP_INTERVAL_SECS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(5);
        let min_hedge_adjustment_usd = env::var("MIN_HEDGE_ADJUSTMENT_USD")
            .ok()
            .and_then(|v| Decimal::from_str(&v).ok())
            .unwrap_or(Decimal::new(100, 0));

        let solana_rpc_url = env::var("SOLANA_RPC_URL")
            .unwrap_or_else(|_| "https://api.mainnet-beta.solana.com".to_string());
        let solana_obligation_pubkey = env::var("SOLANA_OBLIGATION_PUBKEY")
            .unwrap_or_else(|_| "7u3k7...KaminoObligation".to_string());

        let max_total_notional = env::var("MAX_TOTAL_NOTIONAL_USD")
            .ok()
            .and_then(|v| Decimal::from_str(&v).ok())
            .unwrap_or(Decimal::new(10_000_000, 0));
        let max_single_order = env::var("MAX_SINGLE_ORDER_USD")
            .ok()
            .and_then(|v| Decimal::from_str(&v).ok())
            .unwrap_or(Decimal::new(1_000_000, 0));
        let max_price_staleness_secs = env::var("MAX_PRICE_STALENESS_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(30);
        let kill_switch = env::var("KILL_SWITCH")
            .map(|v| v.eq_ignore_ascii_case("true") || v == "1")
            .unwrap_or(false);

        let safety = SafetyConfig {
            max_total_notional,
            max_single_order,
            max_price_staleness_secs,
            kill_switch,
        };

        Self {
            database_url,
            redis_url,
            server_port,
            loop_interval_secs,
            min_hedge_adjustment_usd,
            solana_rpc_url,
            solana_obligation_pubkey,
            safety,
        }
    }
}
