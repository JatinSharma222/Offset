use crate::db;
use crate::schema::*;
use crate::state::AppState;
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
    async fn current_snapshot(&self, ctx: &Context<'_>) -> Result<Option<RiskSnapshotGql>> {
        let state = ctx.data::<AppState>()?;

        // 1. Check in-memory snapshot first
        if let Some(snap) = state.latest_snapshot.read().await.clone() {
            return Ok(Some(snap));
        }

        // 2. Check DB if pool is available
        if let Some(pool) = &state.db_pool {
            if let Ok(Some(db_snap)) = db::get_latest_snapshot(pool).await {
                return Ok(Some(db_snap));
            }
        }

        // 3. Fallback: evaluate current position directly
        let pos = state.current_position.read().await.clone();
        let policy = state.policy.read().await.clone();
        let snap = evaluate_position(&pos, "SOL", &policy);
        let sol_price = pos
            .collateral
            .iter()
            .find(|c| c.asset == "SOL")
            .map(|c| c.price)
            .unwrap_or(Decimal::ZERO);

        Ok(Some(RiskSnapshotGql {
            id: Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            price: sol_price,
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
        ctx: &Context<'_>,
        since: Option<DateTime<Utc>>,
        limit: Option<i32>,
    ) -> Result<Vec<RiskSnapshotGql>> {
        let state = ctx.data::<AppState>()?;
        let limit = limit.unwrap_or(500) as i64;

        if let Some(pool) = &state.db_pool {
            match db::get_snapshots(pool, since, limit).await {
                Ok(snapshots) => return Ok(snapshots),
                Err(e) => tracing::warn!("Failed to query snapshots from database: {:?}", e),
            }
        }

        if let Some(snap) = state.latest_snapshot.read().await.clone() {
            Ok(vec![snap])
        } else {
            Ok(vec![])
        }
    }

    async fn executions(
        &self,
        ctx: &Context<'_>,
        limit: Option<i32>,
    ) -> Result<Vec<ExecutionRecordGql>> {
        let state = ctx.data::<AppState>()?;
        let limit = limit.unwrap_or(100) as i64;

        if let Some(pool) = &state.db_pool {
            match db::get_executions(pool, limit).await {
                Ok(records) => return Ok(records),
                Err(e) => tracing::warn!("Failed to query executions from database: {:?}", e),
            }
        }

        Ok(vec![])
    }

    async fn policy(&self, ctx: &Context<'_>) -> Result<RiskPolicyGql> {
        let state = ctx.data::<AppState>()?;
        let pol = state.policy.read().await.clone();

        Ok(RiskPolicyGql {
            warning: HedgeTierGql {
                minimum_distance: pol.warning.minimum_distance,
                hedge_ratio: pol.warning.hedge_ratio,
            },
            danger: HedgeTierGql {
                minimum_distance: pol.danger.minimum_distance,
                hedge_ratio: pol.danger.hedge_ratio,
            },
            critical: HedgeTierGql {
                minimum_distance: pol.critical.minimum_distance,
                hedge_ratio: pol.critical.hedge_ratio,
            },
        })
    }

    async fn execution_status(&self, ctx: &Context<'_>) -> Result<ExecutionStatusInfoGql> {
        let state = ctx.data::<AppState>()?;
        let safety = state.safety_config.read().await.clone();

        Ok(ExecutionStatusInfoGql {
            connected: true,
            trading_permission: true,
            withdraw_permission: false, // Structurally false - Pitch core feature
            account_address: Some("0x84Ae...01Cd (Offset Agent Wallet)".to_string()),
            margin_available: Some(Decimal::new(1_000_000, 0)),
            kill_switch_active: safety.kill_switch,
        })
    }

    async fn scenarios(&self, ctx: &Context<'_>) -> Result<Vec<ScenarioGql>> {
        let state = ctx.data::<AppState>()?;

        if let Some(pool) = &state.db_pool {
            if let Ok(scenarios) = db::get_scenarios(pool).await {
                if !scenarios.is_empty() {
                    return Ok(scenarios);
                }
            }
        }

        let all = HistoricalScenario::list_all();
        Ok(all
            .into_iter()
            .map(|s| ScenarioGql {
                id: s.id,
                name: s.name,
                description: s.description,
                source_note: s.source_note,
            })
            .collect())
    }

    async fn replay(&self, ctx: &Context<'_>, scenario_id: String) -> Result<ReplayResultGql> {
        let state = ctx.data::<AppState>()?;
        let scn = HistoricalScenario::load(&scenario_id).map_err(|e| {
            async_graphql::Error::new(format!("Scenario '{}' error: {}", scenario_id, e))
        })?;

        let policy: RiskPolicy = state.policy.read().await.clone();
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
                damage_offset_pct: res.impact.damage_offset_pct,
                bad_debt_reduction_pct: res.impact.bad_debt_reduction_pct,
                liquidations_prevented: res.impact.liquidations_prevented as i32,
                on_chain_liquidations_absorbed: res.impact.on_chain_liquidations_absorbed as i32,
                hedge_cost: res.impact.hedge_cost,
            },
        })
    }

    async fn obligation(
        &self,
        ctx: &Context<'_>,
        pubkey: Option<String>,
    ) -> Result<OnChainObligationGql> {
        let state = ctx.data::<AppState>()?;
        let target_pubkey = pubkey.unwrap_or_else(|| state.config.solana_obligation_pubkey.clone());
        let client = data::SolanaRpcClient::new(&state.config.solana_rpc_url);
        let obl = client.fetch_obligation_with_fallback(&target_pubkey).await;

        Ok(OnChainObligationGql {
            pubkey: obl.pubkey,
            owner: obl.owner,
            lending_market: obl.lending_market,
            deposits: obl
                .deposits
                .into_iter()
                .map(|d| OnChainDepositGql {
                    reserve_pubkey: d.reserve_pubkey,
                    asset: d.asset,
                    deposited_amount: d.deposited_amount,
                    liquidation_threshold: d.liquidation_threshold,
                })
                .collect(),
            borrows: obl
                .borrows
                .into_iter()
                .map(|b| OnChainBorrowGql {
                    reserve_pubkey: b.reserve_pubkey,
                    asset: b.asset,
                    borrowed_amount: b.borrowed_amount,
                })
                .collect(),
            source: format!("{:?}", obl.source),
        })
    }
}
