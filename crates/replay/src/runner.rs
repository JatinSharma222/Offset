use crate::attribution::{OutcomeSummary, ProtectionImpact};
use chrono::{DateTime, Utc};
use data::HistoricalScenario;
use execution::{ExecutionRecord, Executor, SimulatedExecutor};
use risk_engine::{evaluate_position, Money, RiskPolicy, RiskSnapshot};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReplayTick {
    pub timestamp: DateTime<Utc>,
    pub price: Money,
    pub snapshot: RiskSnapshot,
    pub execution: Option<ExecutionRecord>,
    pub hedge_position: Money,
    pub hedge_pnl: Money,
    pub cumulative_funding: Money,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReplayResult {
    pub scenario: String,
    pub source_note: String,
    pub ticks: Vec<ReplayTick>,
    pub without_hedge: OutcomeSummary,
    pub with_hedge: OutcomeSummary,
    pub impact: ProtectionImpact,
}

pub async fn run_replay(scenario: &HistoricalScenario, policy: &RiskPolicy) -> ReplayResult {
    let with_hedge = run_pass(scenario, Some(policy)).await;
    let without_hedge = run_pass(scenario, None).await;

    let loss_avoided = without_hedge.summary.net_loss - with_hedge.summary.net_loss;
    let bad_debt_reduction = if without_hedge.summary.bad_debt.is_zero() {
        Decimal::ZERO
    } else {
        (without_hedge.summary.bad_debt - with_hedge.summary.bad_debt)
            / without_hedge.summary.bad_debt
            * Decimal::new(100, 0)
    };

    let impact = ProtectionImpact {
        loss_avoided,
        bad_debt_reduction_pct: bad_debt_reduction,
        liquidations_prevented: 0,
        hedge_cost: with_hedge.summary.funding_cost + with_hedge.summary.slippage_cost,
    };

    ReplayResult {
        scenario: scenario.name.clone(),
        source_note: scenario.source_note.clone(),
        ticks: with_hedge.ticks,
        without_hedge: without_hedge.summary,
        with_hedge: with_hedge.summary,
        impact,
    }
}

struct PassResult {
    ticks: Vec<ReplayTick>,
    summary: OutcomeSummary,
}

async fn run_pass(scenario: &HistoricalScenario, policy_opt: Option<&RiskPolicy>) -> PassResult {
    let executor = SimulatedExecutor::new(
        scenario
            .prices
            .first()
            .map(|p| p.price)
            .unwrap_or(Decimal::ZERO),
    );

    let mut position = scenario.initial_position();
    let zero_policy = RiskPolicy {
        warning: risk_engine::HedgeTier {
            minimum_distance: Decimal::ZERO,
            hedge_ratio: Decimal::ZERO,
        },
        danger: risk_engine::HedgeTier {
            minimum_distance: Decimal::ZERO,
            hedge_ratio: Decimal::ZERO,
        },
        critical: risk_engine::HedgeTier {
            minimum_distance: Decimal::ZERO,
            hedge_ratio: Decimal::ZERO,
        },
    };

    let active_policy = policy_opt.unwrap_or(&zero_policy);

    let mut ticks = Vec::new();
    let mut total_penalties = Decimal::ZERO;
    let mut total_bad_debt = Decimal::ZERO;
    let mut total_funding = Decimal::ZERO;
    let mut total_slippage = Decimal::ZERO;
    let mut last_hedge_notional = Decimal::ZERO;
    let mut last_price = scenario
        .prices
        .first()
        .map(|p| p.price)
        .unwrap_or(Decimal::ZERO);
    let mut hedge_pnl = Decimal::ZERO;

    for pt in &scenario.prices {
        // 1. Update price on position
        if let Some(col) = position.collateral.iter_mut().find(|c| c.asset == "SOL") {
            col.price = pt.price;
        }

        // 2. Evaluate position
        let snapshot = evaluate_position(&position, "SOL", active_policy);

        executor
            .set_market_state(pt.price, snapshot.risk_level, snapshot.liquidation_distance)
            .await;

        // 3. Mark hedge to market if price changed
        if !last_price.is_zero() && !last_hedge_notional.is_zero() {
            // Short position P&L: size * (entry - exit) / entry
            let price_return = (last_price - pt.price) / last_price;
            let step_pnl = last_hedge_notional * price_return;
            hedge_pnl += step_pnl;

            // Hourly funding cost ~ 0.001% (0.1 bps)
            let funding_step = last_hedge_notional * Decimal::new(1, 5);
            total_funding += funding_step;
        }

        // 4. Adjust hedge if target changed significantly
        let mut execution = None;
        let delta = (snapshot.target_hedge - last_hedge_notional).abs();
        if delta >= Decimal::new(100, 0) {
            if let Ok(rec) = executor.adjust_hedge(snapshot.target_hedge).await {
                if let Some(bps) = rec.slippage_bps {
                    let slip_cost = snapshot.target_hedge * (bps / Decimal::new(10_000, 0));
                    total_slippage += slip_cost;
                }
                last_hedge_notional = snapshot.target_hedge;
                execution = Some(rec);
            }
        }

        // 5. Model liquidations when health factor < 1.0
        if let Some(hf) = snapshot.health_factor {
            if hf < Decimal::ONE {
                let close_factor = Decimal::new(20, 2); // 20%
                let penalty = Decimal::new(5, 2); // 5%

                let current_debt = position
                    .debt
                    .iter()
                    .map(|d| d.amount * d.price)
                    .sum::<Money>();
                let liquidated_debt = current_debt * close_factor;
                let penalty_cost = liquidated_debt * penalty;
                total_penalties += penalty_cost;

                // Reduce debt
                if let Some(d) = position.debt.first_mut() {
                    d.amount -= liquidated_debt / d.price;
                    if d.amount < Decimal::ZERO {
                        total_bad_debt += -d.amount * d.price;
                        d.amount = Decimal::ZERO;
                    }
                }
            }
        }

        last_price = pt.price;

        ticks.push(ReplayTick {
            timestamp: pt.timestamp,
            price: pt.price,
            snapshot,
            execution,
            hedge_position: last_hedge_notional,
            hedge_pnl,
            cumulative_funding: total_funding,
        });
    }

    let net_loss = total_penalties + total_bad_debt + total_funding + total_slippage - hedge_pnl;

    PassResult {
        ticks,
        summary: OutcomeSummary {
            liquidation_penalties: total_penalties,
            bad_debt: total_bad_debt,
            hedge_pnl,
            funding_cost: total_funding,
            slippage_cost: total_slippage,
            net_loss,
        },
    }
}
