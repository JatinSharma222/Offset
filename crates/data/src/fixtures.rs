use crate::prices::PricePoint;
use risk_engine::{Money, Position, Ratio};
use serde::{Deserialize, Serialize};
use std::env;
use std::path::{Path, PathBuf};

#[derive(Debug, thiserror::Error)]
pub enum DataError {
    #[error("Scenario '{0}' not found")]
    NotFound(String),
    #[error("IO error reading scenario: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON deserialization error: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScenarioMetadata {
    pub id: String,
    pub name: String,
    pub description: String,
    pub source_note: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HistoricalScenario {
    pub id: String,
    pub name: String,
    pub description: String,
    pub source_note: String,
    pub liquidation_threshold: Ratio,
    pub collateral_amount: Money,
    pub debt_value: Money,
    pub prices: Vec<PricePoint>,
}

impl HistoricalScenario {
    pub fn metadata(&self) -> ScenarioMetadata {
        ScenarioMetadata {
            id: self.id.clone(),
            name: self.name.clone(),
            description: self.description.clone(),
            source_note: self.source_note.clone(),
        }
    }

    pub fn initial_position(&self) -> Position {
        let first_price = self
            .prices
            .first()
            .map(|p| p.price)
            .unwrap_or(rust_decimal::Decimal::ZERO);
        crate::positions::create_lending_position(
            "SOL",
            self.collateral_amount,
            first_price,
            self.liquidation_threshold,
            self.debt_value,
        )
    }

    /// Loads a historical scenario by ID from disk or falls back to embedded data.
    pub fn load(id: &str) -> Result<Self, DataError> {
        // 1. Try resolving file path from candidate directories
        let candidates = [
            env::var("FIXTURES_DIR").ok().map(PathBuf::from),
            Some(PathBuf::from("data/fixtures")),
            Some(PathBuf::from("../data/fixtures")),
            Some(PathBuf::from("../../data/fixtures")),
        ];

        let file_name = format!("{}.json", id.replace('-', "_"));
        let alt_file_name = format!("{}.json", id);

        for dir in candidates.iter().flatten() {
            let path1 = dir.join(&file_name);
            if path1.exists() {
                return Self::load_from_file(&path1);
            }
            let path2 = dir.join(&alt_file_name);
            if path2.exists() {
                return Self::load_from_file(&path2);
            }
        }

        // 2. Fall back to embedded scenario definitions
        match id {
            "solend-whale-2022" => Ok(Self::solend_whale_2022()),
            "ftx-collapse-2022" => Ok(Self::ftx_collapse_2022()),
            "sol-whipsaw-2023" => Ok(Self::sol_whipsaw_2023()),
            _ => Err(DataError::NotFound(id.to_string())),
        }
    }

    /// Loads a scenario from an explicit filesystem path.
    pub fn load_from_file(path: &Path) -> Result<Self, DataError> {
        let content = std::fs::read_to_string(path)?;
        let scenario: Self = serde_json::from_str(&content)?;
        Ok(scenario)
    }

    /// Returns metadata for all available built-in historical scenarios.
    pub fn list_all() -> Vec<ScenarioMetadata> {
        vec![
            Self::solend_whale_2022().metadata(),
            Self::ftx_collapse_2022().metadata(),
            Self::sol_whipsaw_2023().metadata(),
        ]
    }

    pub fn solend_whale_2022() -> Self {
        const EMBEDDED: &str = include_str!("../../../data/fixtures/solend_whale_2022.json");
        serde_json::from_str(EMBEDDED).expect("Invalid embedded solend_whale_2022.json")
    }

    pub fn ftx_collapse_2022() -> Self {
        const EMBEDDED: &str = include_str!("../../../data/fixtures/ftx_collapse_2022.json");
        serde_json::from_str(EMBEDDED).expect("Invalid embedded ftx_collapse_2022.json")
    }

    pub fn sol_whipsaw_2023() -> Self {
        const EMBEDDED: &str = include_str!("../../../data/fixtures/sol_whipsaw_2023.json");
        serde_json::from_str(EMBEDDED).expect("Invalid embedded sol_whipsaw_2023.json")
    }
}
