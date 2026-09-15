use crate::schema::*;
use async_graphql::{Context, Object, Result};
use chrono::{DateTime, Utc};
use data::HistoricalScenario;
use replay::run_replay;
use risk_engine::{evaluate_position, RiskPolicy};
use rust_decimal::Decimal;
use uuid::Uuid;

pub struct QueryRoot;

#[Object]
impl QueryRoot {
    async fn current_snapshot(&self, _ctx: &Context<'_>) -> Result<Option<RiskSnapshotGql>> {
        let scn = HistoricalScenario::solend_whale_2022();
        let pos = scn.initial_position();
        let policy = RiskPolicy::default();
        let snap = evaluate_position(&pos, "SOL", &policy);
        let first_price = scn.prices.first().map(|p| p.price).unwrap_or(Decimal::ZERO);

        Ok(Some(RiskSnapshotGql {
            id: Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            price: first_price,
            collateral_value: snap.collateral_value,
            risk_adjusted_collateral: snap.risk_adjusted_collateral,
            debt_value: snap.debt_value,
            health_factor: snap.health_factor,
            liquidation_price: snap.liquidation_price,
            liquidation_distance: snap.liquidation_distance,
            risk_level: snap.risk_level.into(),
            emergency: snap.emergency,
            exposure: snap.variable_asset_exposure,
            hedge_ratio: snap.hedge_ratio,
            target_hedge: snap.target_hedge,
        }))
    }

    async fn snapshots(
        &self,
        _ctx: &Context<'_>,
        _since: Option<DateTime<Utc>>,
        _limit: Option<i32>,
    ) -> Result<Vec<RiskSnapshotGql>> {
        Ok(vec![])
    }

    async fn executions(
        &self,
        _ctx: &Context<'_>,
        _limit: Option<i32>,
    ) -> Result<Vec<ExecutionRecordGql>> {
        Ok(vec![])
    }

    async fn policy(&self, _ctx: &Context<'_>) -> Result<RiskPolicyGql> {
        let def = RiskPolicy::default();
        Ok(RiskPolicyGql {
            warning: HedgeTierGql {
                minimum_distance: def.warning.minimum_distance,
                hedge_ratio: def.warning.hedge_ratio,
            },
            danger: HedgeTierGql {
                minimum_distance: def.danger.minimum_distance,
                hedge_ratio: def.danger.hedge_ratio,
            },
            critical: HedgeTierGql {
                minimum_distance: def.critical.minimum_distance,
                hedge_ratio: def.critical.hedge_ratio,
            },
        })
    }

    async fn execution_status(&self, _ctx: &Context<'_>) -> Result<ExecutionStatusInfoGql> {
        Ok(ExecutionStatusInfoGql {
            connected: true,
            trading_permission: true,
            withdraw_permission: false, // Structurally false - Pitch core feature
            account_address: Some("0x1234...5678".to_string()),
            margin_available: Some(Decimal::new(1_000_000, 0)),
            kill_switch_active: false,
        })
    }

    async fn scenarios(&self, _ctx: &Context<'_>) -> Result<Vec<ScenarioGql>> {
        let scn = HistoricalScenario::solend_whale_2022();
        Ok(vec![ScenarioGql {
            id: scn.id,
            name: scn.name,
            description: scn.description,
            source_note: scn.source_note,
        }])
    }

    async fn replay(&self, _ctx: &Context<'_>, scenario_id: String) -> Result<ReplayResultGql> {
        let scn = if scenario_id == "solend-whale-2022" {
            HistoricalScenario::solend_whale_2022()
        } else {
            return Err(async_graphql::Error::new(format!(
                "Scenario '{}' not found",
                scenario_id
            )));
        };

        let policy = RiskPolicy::default();
        let res = run_replay(&scn, &policy).await;

        let ticks = res
            .ticks
            .into_iter()
            .map(|t| ReplayTickGql {
                timestamp: t.timestamp,
                price: t.price,
                snapshot: RiskSnapshotGql {
                    id: Uuid::new_v4().to_string(),
                    timestamp: t.timestamp,
                    price: t.price,
                    collateral_value: t.snapshot.collateral_value,
                    risk_adjusted_collateral: t.snapshot.risk_adjusted_collateral,
                    debt_value: t.snapshot.debt_value,
                    health_factor: t.snapshot.health_factor,
                    liquidation_price: t.snapshot.liquidation_price,
                    liquidation_distance: t.snapshot.liquidation_distance,
                    risk_level: t.snapshot.risk_level.into(),
                    emergency: t.snapshot.emergency,
                    exposure: t.snapshot.variable_asset_exposure,
                    hedge_ratio: t.snapshot.hedge_ratio,
                    target_hedge: t.snapshot.target_hedge,
                },
                execution: t.execution.map(|e| ExecutionRecordGql {
                    id: e.id.to_string(),
                    timestamp: e.timestamp,
                    risk_level: e.risk_level.into(),
                    liquidation_distance: e.liquidation_distance,
                    target_notional: e.target_notional,
                    filled_notional: e.filled_notional,
                    avg_fill_price: e.avg_fill_price,
                    reference_price: e.reference_price,
                    slippage_bps: e.slippage_bps,
                    residual_exposure: e.residual_exposure,
                    status: match e.status {
                        execution::ExecutionStatus::Filled => ExecutionStatusGql::Filled,
                        execution::ExecutionStatus::PartiallyFilled => {
                            ExecutionStatusGql::PartiallyFilled
                        }
                        execution::ExecutionStatus::Refused(_) => ExecutionStatusGql::Refused,
                        execution::ExecutionStatus::Failed(_) => ExecutionStatusGql::Failed,
                    },
                    note: e.note,
                    book_snapshot: e.book_snapshot.map(|b| BookSnapshotGql {
                        bids: b
                            .bids
                            .into_iter()
                            .map(|l| BookLevelGql {
                                price: l.price,
                                size: l.size,
                            })
                            .collect(),
                        asks: b
                            .asks
                            .into_iter()
                            .map(|l| BookLevelGql {
                                price: l.price,
                                size: l.size,
                            })
                            .collect(),
                    }),
                }),
                hedge_position: t.hedge_position,
                hedge_pnl: t.hedge_pnl,
                cumulative_funding: t.cumulative_funding,
            })
            .collect();

        Ok(ReplayResultGql {
            scenario: res.scenario,
            source_note: res.source_note,
            ticks,
            without_hedge: OutcomeSummaryGql {
                liquidation_penalties: res.without_hedge.liquidation_penalties,
                bad_debt: res.without_hedge.bad_debt,
                hedge_pnl: res.without_hedge.hedge_pnl,
                funding_cost: res.without_hedge.funding_cost,
                slippage_cost: res.without_hedge.slippage_cost,
                net_loss: res.without_hedge.net_loss,
            },
            with_hedge: OutcomeSummaryGql {
                liquidation_penalties: res.with_hedge.liquidation_penalties,
                bad_debt: res.with_hedge.bad_debt,
                hedge_pnl: res.with_hedge.hedge_pnl,
                funding_cost: res.with_hedge.funding_cost,
                slippage_cost: res.with_hedge.slippage_cost,
                net_loss: res.with_hedge.net_loss,
            },
            impact: ProtectionImpactGql {
                loss_avoided: res.impact.loss_avoided,
                bad_debt_reduction_pct: res.impact.bad_debt_reduction_pct,
                liquidations_prevented: res.impact.liquidations_prevented as i32,
                hedge_cost: res.impact.hedge_cost,
            },
        })
    }
}
