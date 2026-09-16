use crate::schema::{
    BookLevelGql, BookSnapshotGql, ExecutionRecordGql, ExecutionStatusGql, RiskLevelGql,
    RiskSnapshotGql, ScenarioGql,
};
use chrono::{DateTime, Utc};
use execution::{ExecutionRecord, ExecutionStatus};
use risk_engine::{RiskPolicy, RiskSnapshot};
use rust_decimal::Decimal;
use sqlx::{postgres::PgPoolOptions, PgPool, Row};
use uuid::Uuid;

pub async fn init_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
}

pub async fn run_migrations(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
}

pub async fn insert_snapshot(
    pool: &PgPool,
    id: Uuid,
    timestamp: DateTime<Utc>,
    price: Decimal,
    snapshot: &RiskSnapshot,
) -> Result<(), sqlx::Error> {
    let risk_level_str = format!("{:?}", snapshot.risk_level);
    sqlx::query(
        r#"
        INSERT INTO risk_snapshots (
            id, timestamp, price, collateral_value, risk_adjusted_collateral,
            debt_value, health_factor, liquidation_price, liquidation_distance,
            risk_level, emergency, exposure, hedge_ratio, target_hedge
        ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12, $13, $14
        )
        "#,
    )
    .bind(id)
    .bind(timestamp)
    .bind(price)
    .bind(snapshot.collateral_value)
    .bind(snapshot.risk_adjusted_collateral)
    .bind(snapshot.debt_value)
    .bind(snapshot.health_factor)
    .bind(snapshot.liquidation_price)
    .bind(snapshot.liquidation_distance)
    .bind(risk_level_str)
    .bind(snapshot.emergency)
    .bind(snapshot.variable_asset_exposure)
    .bind(snapshot.hedge_ratio)
    .bind(snapshot.target_hedge)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_snapshots(
    pool: &PgPool,
    since: Option<DateTime<Utc>>,
    limit: i64,
) -> Result<Vec<RiskSnapshotGql>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT
            id, timestamp, price, collateral_value, risk_adjusted_collateral,
            debt_value, health_factor, liquidation_price, liquidation_distance,
            risk_level, emergency, exposure, hedge_ratio, target_hedge
        FROM risk_snapshots
        WHERE ($1::timestamptz IS NULL OR timestamp >= $1)
        ORDER BY timestamp DESC
        LIMIT $2
        "#,
    )
    .bind(since)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    let snapshots = rows
        .into_iter()
        .map(|row| {
            let id: Uuid = row.get("id");
            let timestamp: DateTime<Utc> = row.get("timestamp");
            let price: Decimal = row.get("price");
            let collateral_value: Decimal = row.get("collateral_value");
            let risk_adjusted_collateral: Decimal = row.get("risk_adjusted_collateral");
            let debt_value: Decimal = row.get("debt_value");
            let health_factor: Option<Decimal> = row.get("health_factor");
            let liquidation_price: Option<Decimal> = row.get("liquidation_price");
            let liquidation_distance: Option<Decimal> = row.get("liquidation_distance");
            let risk_level_str: String = row.get("risk_level");
            let emergency: bool = row.get("emergency");
            let exposure: Decimal = row.get("exposure");
            let hedge_ratio: Decimal = row.get("hedge_ratio");
            let target_hedge: Decimal = row.get("target_hedge");

            RiskSnapshotGql {
                id: id.to_string(),
                timestamp,
                price,
                collateral_value,
                risk_adjusted_collateral,
                debt_value,
                health_factor,
                liquidation_price,
                liquidation_distance,
                risk_level: parse_risk_level(&risk_level_str),
                emergency,
                exposure,
                hedge_ratio,
                target_hedge,
            }
        })
        .collect();

    Ok(snapshots)
}

pub async fn get_latest_snapshot(pool: &PgPool) -> Result<Option<RiskSnapshotGql>, sqlx::Error> {
    let row_opt = sqlx::query(
        r#"
        SELECT
            id, timestamp, price, collateral_value, risk_adjusted_collateral,
            debt_value, health_factor, liquidation_price, liquidation_distance,
            risk_level, emergency, exposure, hedge_ratio, target_hedge
        FROM risk_snapshots
        ORDER BY timestamp DESC
        LIMIT 1
        "#,
    )
    .fetch_optional(pool)
    .await?;

    Ok(row_opt.map(|row| {
        let id: Uuid = row.get("id");
        let timestamp: DateTime<Utc> = row.get("timestamp");
        let price: Decimal = row.get("price");
        let collateral_value: Decimal = row.get("collateral_value");
        let risk_adjusted_collateral: Decimal = row.get("risk_adjusted_collateral");
        let debt_value: Decimal = row.get("debt_value");
        let health_factor: Option<Decimal> = row.get("health_factor");
        let liquidation_price: Option<Decimal> = row.get("liquidation_price");
        let liquidation_distance: Option<Decimal> = row.get("liquidation_distance");
        let risk_level_str: String = row.get("risk_level");
        let emergency: bool = row.get("emergency");
        let exposure: Decimal = row.get("exposure");
        let hedge_ratio: Decimal = row.get("hedge_ratio");
        let target_hedge: Decimal = row.get("target_hedge");

        RiskSnapshotGql {
            id: id.to_string(),
            timestamp,
            price,
            collateral_value,
            risk_adjusted_collateral,
            debt_value,
            health_factor,
            liquidation_price,
            liquidation_distance,
            risk_level: parse_risk_level(&risk_level_str),
            emergency,
            exposure,
            hedge_ratio,
            target_hedge,
        }
    }))
}

pub async fn insert_execution(pool: &PgPool, rec: &ExecutionRecord) -> Result<(), sqlx::Error> {
    let risk_level_str = format!("{:?}", rec.risk_level);
    let status_str = match &rec.status {
        ExecutionStatus::Filled => "Filled".to_string(),
        ExecutionStatus::PartiallyFilled => "PartiallyFilled".to_string(),
        ExecutionStatus::Refused(_) => "Refused".to_string(),
        ExecutionStatus::Failed(_) => "Failed".to_string(),
    };
    let note = rec.note.clone().or_else(|| match &rec.status {
        ExecutionStatus::Refused(violation) => Some(format!("{:?}", violation)),
        ExecutionStatus::Failed(err) => Some(err.clone()),
        _ => None,
    });

    let book_snapshot_json = rec
        .book_snapshot
        .as_ref()
        .and_then(|b| serde_json::to_value(b).ok());

    sqlx::query(
        r#"
        INSERT INTO execution_records (
            id, timestamp, risk_level, liquidation_distance, target_notional,
            filled_notional, avg_fill_price, reference_price, slippage_bps,
            residual_exposure, status, note, cloid, book_snapshot
        ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12, $13, $14
        )
        "#,
    )
    .bind(rec.id)
    .bind(rec.timestamp)
    .bind(risk_level_str)
    .bind(rec.liquidation_distance)
    .bind(rec.target_notional)
    .bind(rec.filled_notional)
    .bind(rec.avg_fill_price)
    .bind(rec.reference_price)
    .bind(rec.slippage_bps)
    .bind(rec.residual_exposure)
    .bind(status_str)
    .bind(note)
    .bind(rec.cloid.as_deref())
    .bind(book_snapshot_json)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_executions(
    pool: &PgPool,
    limit: i64,
) -> Result<Vec<ExecutionRecordGql>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT
            id, timestamp, risk_level, liquidation_distance, target_notional,
            filled_notional, avg_fill_price, reference_price, slippage_bps,
            residual_exposure, status, note, book_snapshot
        FROM execution_records
        ORDER BY timestamp DESC
        LIMIT $1
        "#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;

    let records = rows
        .into_iter()
        .map(|row| {
            let id: Uuid = row.get("id");
            let timestamp: DateTime<Utc> = row.get("timestamp");
            let risk_level_str: String = row.get("risk_level");
            let liquidation_distance: Option<Decimal> = row.get("liquidation_distance");
            let target_notional: Decimal = row.get("target_notional");
            let filled_notional: Decimal = row.get("filled_notional");
            let avg_fill_price: Option<Decimal> = row.get("avg_fill_price");
            let reference_price: Decimal = row.get("reference_price");
            let slippage_bps: Option<Decimal> = row.get("slippage_bps");
            let residual_exposure: Decimal = row.get("residual_exposure");
            let status_str: String = row.get("status");
            let note: Option<String> = row.get("note");
            let book_val: Option<serde_json::Value> = row.get("book_snapshot");

            let book_snapshot = book_val.and_then(|val| {
                let book: execution::BookSnapshot = serde_json::from_value(val).ok()?;
                Some(BookSnapshotGql {
                    bids: book
                        .bids
                        .into_iter()
                        .map(|l| BookLevelGql {
                            price: l.price,
                            size: l.size,
                        })
                        .collect(),
                    asks: book
                        .asks
                        .into_iter()
                        .map(|l| BookLevelGql {
                            price: l.price,
                            size: l.size,
                        })
                        .collect(),
                })
            });

            ExecutionRecordGql {
                id: id.to_string(),
                timestamp,
                risk_level: parse_risk_level(&risk_level_str),
                liquidation_distance,
                target_notional,
                filled_notional,
                avg_fill_price,
                reference_price,
                slippage_bps,
                residual_exposure,
                status: parse_execution_status(&status_str),
                note,
                book_snapshot,
            }
        })
        .collect();

    Ok(records)
}

pub async fn save_policy(pool: &PgPool, policy: &RiskPolicy) -> Result<(), sqlx::Error> {
    let json_val =
        serde_json::to_value(policy).map_err(|e| sqlx::Error::Protocol(e.to_string()))?;
    sqlx::query("INSERT INTO risk_policies (policy) VALUES ($1)")
        .bind(json_val)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_latest_policy(pool: &PgPool) -> Result<Option<RiskPolicy>, sqlx::Error> {
    let row_opt = sqlx::query("SELECT policy FROM risk_policies ORDER BY updated_at DESC LIMIT 1")
        .fetch_optional(pool)
        .await?;

    if let Some(row) = row_opt {
        let json_val: serde_json::Value = row.get("policy");
        let policy: RiskPolicy =
            serde_json::from_value(json_val).map_err(|e| sqlx::Error::Protocol(e.to_string()))?;
        Ok(Some(policy))
    } else {
        Ok(None)
    }
}

pub async fn get_scenarios(pool: &PgPool) -> Result<Vec<ScenarioGql>, sqlx::Error> {
    let rows = sqlx::query("SELECT id, name, description, source_note FROM scenarios")
        .fetch_all(pool)
        .await?;

    Ok(rows
        .into_iter()
        .map(|row| ScenarioGql {
            id: row.get("id"),
            name: row.get("name"),
            description: row.get("description"),
            source_note: row.get("source_note"),
        })
        .collect())
}

pub async fn upsert_scenario(
    pool: &PgPool,
    scenario: &data::HistoricalScenario,
) -> Result<(), sqlx::Error> {
    let json_val =
        serde_json::to_value(scenario).map_err(|e| sqlx::Error::Protocol(e.to_string()))?;
    sqlx::query(
        r#"
        INSERT INTO scenarios (id, name, description, source_note, data)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            source_note = EXCLUDED.source_note,
            data = EXCLUDED.data
        "#,
    )
    .bind(&scenario.id)
    .bind(&scenario.name)
    .bind(&scenario.description)
    .bind(&scenario.source_note)
    .bind(json_val)
    .execute(pool)
    .await?;

    Ok(())
}

fn parse_risk_level(s: &str) -> RiskLevelGql {
    match s.to_uppercase().as_str() {
        "WARNING" => RiskLevelGql::Warning,
        "DANGER" => RiskLevelGql::Danger,
        "CRITICAL" => RiskLevelGql::Critical,
        _ => RiskLevelGql::Healthy,
    }
}

fn parse_execution_status(s: &str) -> ExecutionStatusGql {
    match s.to_uppercase().as_str() {
        "PARTIALLYFILLED" | "PARTIALLY_FILLED" => ExecutionStatusGql::PartiallyFilled,
        "REFUSED" => ExecutionStatusGql::Refused,
        "FAILED" => ExecutionStatusGql::Failed,
        _ => ExecutionStatusGql::Filled,
    }
}
