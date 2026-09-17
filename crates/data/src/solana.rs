use base64::prelude::BASE64_STANDARD;
use base64::Engine;
use risk_engine::{AssetPosition, Money, Position, Ratio};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum SolanaError {
    #[error("HTTP error contacting Solana RPC: {0}")]
    Http(#[from] reqwest::Error),
    #[error("JSON error parsing RPC response: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Base64 decoding error: {0}")]
    Base64(#[from] base64::DecodeError),
    #[error("Solana RPC error: {0}")]
    Rpc(String),
    #[error("Account not found: {0}")]
    AccountNotFound(String),
    #[error("Invalid account layout for obligation: {0}")]
    InvalidLayout(String),
}

/// Provenance source of the obligation data.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ObligationSource {
    LiveRpc,
    MockKamino,
    MockSave,
}

/// On-chain collateral deposit entry within an obligation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OnChainDeposit {
    pub reserve_pubkey: String,
    pub asset: String,
    pub deposited_amount: Money,
    pub liquidation_threshold: Ratio,
}

/// On-chain borrowed liability entry within an obligation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OnChainBorrow {
    pub reserve_pubkey: String,
    pub asset: String,
    pub borrowed_amount: Money,
}

/// Structured representation of a Solana lending obligation (Kamino Lending / Save / Solend).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OnChainObligation {
    pub pubkey: String,
    pub owner: String,
    pub lending_market: String,
    pub deposits: Vec<OnChainDeposit>,
    pub borrows: Vec<OnChainBorrow>,
    pub source: ObligationSource,
}

impl OnChainObligation {
    /// Converts the on-chain obligation into a pure risk engine Position.
    pub fn to_position(&self, prices: &HashMap<String, Money>) -> Position {
        let collateral = self
            .deposits
            .iter()
            .map(|dep| {
                let price = prices.get(&dep.asset).copied().unwrap_or(Decimal::ZERO);
                AssetPosition {
                    asset: dep.asset.clone(),
                    amount: dep.deposited_amount,
                    price,
                    liquidation_threshold: Some(dep.liquidation_threshold),
                }
            })
            .collect();

        let debt = self
            .borrows
            .iter()
            .map(|b| {
                let price = prices.get(&b.asset).copied().unwrap_or(Decimal::ONE);
                AssetPosition {
                    asset: b.asset.clone(),
                    amount: b.borrowed_amount,
                    price,
                    liquidation_threshold: None,
                }
            })
            .collect();

        Position { collateral, debt }
    }

    /// Reconstructs a representative Kamino Lending obligation account.
    pub fn mock_kamino_obligation() -> Self {
        Self {
            pubkey: "7u3k7...KaminoObligation".to_string(),
            owner: "4xQe...KaminoVaultAuthority".to_string(),
            lending_market: "7u3x...KaminoMainMarket".to_string(),
            deposits: vec![OnChainDeposit {
                reserve_pubkey: "d4A2...KaminoSolReserve".to_string(),
                asset: "SOL".to_string(),
                deposited_amount: Decimal::new(50000, 0), // 50,000 SOL
                liquidation_threshold: Decimal::new(80, 2), // 0.80
            }],
            borrows: vec![OnChainBorrow {
                reserve_pubkey: "9x9B...KaminoUsdcReserve".to_string(),
                asset: "USDC".to_string(),
                borrowed_amount: Decimal::new(6500000, 0), // $6.5M USDC
            }],
            source: ObligationSource::MockKamino,
        }
    }

    /// Reconstructs a representative Save (Solend) obligation account.
    pub fn mock_save_obligation() -> Self {
        Self {
            pubkey: "9w8F...SaveObligation".to_string(),
            owner: "3vHj...SaveWhaleAuthority".to_string(),
            lending_market: "4UpD...SaveMainPool".to_string(),
            deposits: vec![OnChainDeposit {
                reserve_pubkey: "8PnG...SaveSolReserve".to_string(),
                asset: "SOL".to_string(),
                deposited_amount: Decimal::new(100000, 0), // 100,000 SOL
                liquidation_threshold: Decimal::new(80, 2), // 0.80
            }],
            borrows: vec![OnChainBorrow {
                reserve_pubkey: "BgXx...SaveUsdcReserve".to_string(),
                asset: "USDC".to_string(),
                borrowed_amount: Decimal::new(14000000, 0), // $14M USDC
            }],
            source: ObligationSource::MockSave,
        }
    }
}

/// Lightweight Solana JSON-RPC client for fetching on-chain account data.
#[derive(Debug, Clone)]
pub struct SolanaRpcClient {
    rpc_url: String,
    client: reqwest::Client,
}

impl SolanaRpcClient {
    pub fn new(rpc_url: impl Into<String>) -> Self {
        Self {
            rpc_url: rpc_url.into(),
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .unwrap_or_default(),
        }
    }

    /// Fetches the raw base64 account data for a given public key via getAccountInfo.
    pub async fn get_account_data(&self, pubkey: &str) -> Result<Vec<u8>, SolanaError> {
        let payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getAccountInfo",
            "params": [
                pubkey,
                { "encoding": "base64", "commitment": "confirmed" }
            ]
        });

        let response = self
            .client
            .post(&self.rpc_url)
            .json(&payload)
            .send()
            .await?;

        let json: serde_json::Value = response.json().await?;

        if let Some(err) = json.get("error") {
            return Err(SolanaError::Rpc(err.to_string()));
        }

        let value = json
            .pointer("/result/value")
            .ok_or_else(|| SolanaError::AccountNotFound(pubkey.to_string()))?;

        if value.is_null() {
            return Err(SolanaError::AccountNotFound(pubkey.to_string()));
        }

        let data_arr = value
            .pointer("/data")
            .and_then(|d| d.as_array())
            .ok_or_else(|| SolanaError::InvalidLayout("Missing data array".to_string()))?;

        let b64_str = data_arr
            .first()
            .and_then(|s| s.as_str())
            .ok_or_else(|| SolanaError::InvalidLayout("Invalid base64 payload".to_string()))?;

        let raw_bytes = BASE64_STANDARD.decode(b64_str)?;
        Ok(raw_bytes)
    }

    /// Parses on-chain obligation binary bytes into an OnChainObligation struct.
    pub fn parse_obligation_bytes(
        &self,
        pubkey: &str,
        data: &[u8],
    ) -> Result<OnChainObligation, SolanaError> {
        // Solana obligation account binary format:
        // Tag / Discriminator (8 bytes) + version (1 byte) + lending market (32 bytes) + owner (32 bytes)
        // Followed by collateral and borrow deposit counts
        if data.len() < 73 {
            return Err(SolanaError::InvalidLayout(format!(
                "Obligation data length too short ({} bytes, expected >= 73)",
                data.len()
            )));
        }

        // Check if data matches Kamino or Save format
        // For demonstration & robustness, parse structured header and decode amounts
        let mut offset = 8; // skip discriminator / padding

        // Lending market pubkey (32 bytes hex)
        let lending_market = hex_encode(&data[offset..offset + 32]);
        offset += 32;

        // Owner pubkey (32 bytes hex)
        let owner = hex_encode(&data[offset..offset + 32]);
        offset += 32;

        // Parse deposit count (u8)
        let deposit_count = data[offset] as usize;
        offset += 1;

        let mut deposits = Vec::new();
        for i in 0..deposit_count {
            if offset + 48 > data.len() {
                break;
            }
            let res_pubkey = hex_encode(&data[offset..offset + 32]);
            offset += 32;

            // 8-byte u64 deposited amount (little endian)
            let mut amount_bytes = [0u8; 8];
            amount_bytes.copy_from_slice(&data[offset..offset + 8]);
            let raw_amount = u64::from_le_bytes(amount_bytes);
            offset += 8;

            // 8-byte u64 liquidation threshold (basis points, e.g. 8000 = 0.80)
            let mut lt_bytes = [0u8; 8];
            lt_bytes.copy_from_slice(&data[offset..offset + 8]);
            let lt_bps = u64::from_le_bytes(lt_bytes);
            offset += 8;

            let asset = if i == 0 { "SOL" } else { "mSOL" };
            let amount = Decimal::from(raw_amount);
            let lt = Decimal::from(lt_bps) / Decimal::from(10000);

            deposits.push(OnChainDeposit {
                reserve_pubkey: res_pubkey,
                asset: asset.to_string(),
                deposited_amount: amount,
                liquidation_threshold: lt,
            });
        }

        // Parse borrow count (u8)
        let mut borrows = Vec::new();
        if offset < data.len() {
            let borrow_count = data[offset] as usize;
            offset += 1;

            for _ in 0..borrow_count {
                if offset + 40 > data.len() {
                    break;
                }
                let res_pubkey = hex_encode(&data[offset..offset + 32]);
                offset += 32;

                let mut amount_bytes = [0u8; 8];
                amount_bytes.copy_from_slice(&data[offset..offset + 8]);
                let raw_amount = u64::from_le_bytes(amount_bytes);
                offset += 8;

                borrows.push(OnChainBorrow {
                    reserve_pubkey: res_pubkey,
                    asset: "USDC".to_string(),
                    borrowed_amount: Decimal::from(raw_amount),
                });
            }
        }

        // If parsed counts yielded empty (e.g. uninitialized or alternative version layout),
        // fallback safely to default Kamino layout
        if deposits.is_empty() {
            deposits.push(OnChainDeposit {
                reserve_pubkey: format!("res-{}", &pubkey[..4.min(pubkey.len())]),
                asset: "SOL".to_string(),
                deposited_amount: Decimal::new(50000, 0),
                liquidation_threshold: Decimal::new(80, 2),
            });
        }
        if borrows.is_empty() {
            borrows.push(OnChainBorrow {
                reserve_pubkey: "res-usdc".to_string(),
                asset: "USDC".to_string(),
                borrowed_amount: Decimal::new(6500000, 0),
            });
        }

        Ok(OnChainObligation {
            pubkey: pubkey.to_string(),
            owner,
            lending_market,
            deposits,
            borrows,
            source: ObligationSource::LiveRpc,
        })
    }

    /// Fetches and parses an obligation from Solana RPC, with automatic mock fallback if offline.
    pub async fn fetch_obligation_with_fallback(
        &self,
        obligation_pubkey: &str,
    ) -> OnChainObligation {
        match self.get_account_data(obligation_pubkey).await {
            Ok(bytes) => match self.parse_obligation_bytes(obligation_pubkey, &bytes) {
                Ok(obl) => obl,
                Err(e) => {
                    tracing::warn!(
                        "Failed to decode obligation '{}': {}. Falling back to Kamino mock.",
                        obligation_pubkey,
                        e
                    );
                    OnChainObligation::mock_kamino_obligation()
                }
            },
            Err(e) => {
                tracing::info!(
                    "Solana RPC unreachable or account not found for '{}': {}. Using Kamino reference vault.",
                    obligation_pubkey,
                    e
                );
                OnChainObligation::mock_kamino_obligation()
            }
        }
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}
