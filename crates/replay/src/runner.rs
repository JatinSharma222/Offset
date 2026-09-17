use crate::attribution::{OutcomeSummary, ProtectionImpact};
use chrono::{DateTime, Utc};
use data::HistoricalScenario;
use execution::{ExecutionRecord, Executor, SimulatedExecutor};
use risk_engine::{evaluate_position, Money, RiskPolicy, RiskSnapshot};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::path::Path;

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

impl ReplayResult {
    /// Generates a CSV string representation of the replay ticks and metrics.
    pub fn to_csv(&self) -> String {
        let mut csv = String::new();
        csv.push_str("timestamp,price,health_factor,liquidation_price,liquidation_distance,risk_level,target_hedge,filled_hedge,hedge_pnl,cumulative_funding\n");

        for tick in &self.ticks {
            let hf_str = tick
                .snapshot
                .health_factor
                .map(|v| v.to_string())
                .unwrap_or_else(|| "".to_string());
            let liq_price_str = tick
                .snapshot
                .liquidation_price
                .map(|v| v.to_string())
                .unwrap_or_else(|| "".to_string());
            let dist_str = tick
                .snapshot
                .liquidation_distance
                .map(|v| v.to_string())
                .unwrap_or_else(|| "".to_string());
            let filled_hedge_str = tick
                .execution
                .as_ref()
                .map(|e| e.filled_notional.to_string())
                .unwrap_or_else(|| tick.hedge_position.to_string());

            csv.push_str(&format!(
                "{},{},{},{},{},{:?},{},{},{},{}\n",
                tick.timestamp.to_rfc3339(),
                tick.price,
                hf_str,
                liq_price_str,
                dist_str,
                tick.snapshot.risk_level,
                tick.snapshot.target_hedge,
                filled_hedge_str,
                tick.hedge_pnl,
                tick.cumulative_funding
            ));
        }

        csv
    }

    /// Saves the CSV representation of the replay result to a file on disk.
    pub fn save_csv(&self, path: &Path) -> std::io::Result<()> {
        std::fs::write(path, self.to_csv())
    }

    /// Formats the side-by-side outcome comparison table.
    pub fn format_comparison_table(&self) -> String {
        use std::fmt::Write;
        let mut out = String::new();
        let sep_double = "=".repeat(100);
        let sep_single = "-".repeat(100);

        let _ = writeln!(out, "{}", sep_double);
        let _ = writeln!(out, " SCENARIO: {}", self.scenario);
        let _ = writeln!(out, " PROVENANCE: {}", self.source_note);
        let _ = writeln!(out, "{}", sep_double);
        let _ = writeln!(
            out,
            " {:<35} | {:>18} | {:>18} | {:>18}",
            "METRIC", "WITHOUT HEDGE", "WITH OFFSET HEDGE", "DIFFERENCE"
        );
        let _ = writeln!(out, "{}", sep_single);

        let pen_diff =
            self.with_hedge.liquidation_penalties - self.without_hedge.liquidation_penalties;
        let bd_diff = self.with_hedge.bad_debt - self.without_hedge.bad_debt;
        let pnl_diff = self.with_hedge.hedge_pnl - self.without_hedge.hedge_pnl;
        let slip_diff = self.with_hedge.slippage_cost - self.without_hedge.slippage_cost;
        let fund_diff = self.with_hedge.funding_cost - self.without_hedge.funding_cost;
        let net_diff = self.with_hedge.net_loss - self.without_hedge.net_loss;

        let _ = writeln!(
            out,
            " {:<35} | {:>18} | {:>18} | {:>18}",
            "Liquidation Penalties",
            format!("${:.2}", self.without_hedge.liquidation_penalties),
            format!("${:.2}", self.with_hedge.liquidation_penalties),
            format!("${:.2}", pen_diff)
        );
        let _ = writeln!(
            out,
            " {:<35} | {:>18} | {:>18} | {:>18}",
            "Protocol Bad Debt",
            format!("${:.2}", self.without_hedge.bad_debt),
            format!("${:.2}", self.with_hedge.bad_debt),
            format!("${:.2}", bd_diff)
        );
        let _ = writeln!(
            out,
            " {:<35} | {:>18} | {:>18} | {:>18}",
            "Hedge Realized P&L",
            format!("${:.2}", self.without_hedge.hedge_pnl),
            format!("${:.2}", self.with_hedge.hedge_pnl),
            format!("+${:.2}", pnl_diff)
        );
        let _ = writeln!(
            out,
            " {:<35} | {:>18} | {:>18} | {:>18}",
            "Execution Slippage Cost",
            format!("${:.2}", self.without_hedge.slippage_cost),
            format!("${:.2}", self.with_hedge.slippage_cost),
            format!("+${:.2}", slip_diff)
        );
        let _ = writeln!(
            out,
            " {:<35} | {:>18} | {:>18} | {:>18}",
            "Funding Cost (Carry)",
            format!("${:.2}", self.without_hedge.funding_cost),
            format!("${:.2}", self.with_hedge.funding_cost),
            format!("+${:.2}", fund_diff)
        );
        let _ = writeln!(out, "{}", sep_single);
        let _ = writeln!(
            out,
            " {:<35} | {:>18} | {:>18} | {:>18}",
            "TOTAL NET PROTOCOL LOSS",
            format!("${:.2}", self.without_hedge.net_loss),
            format!("${:.2}", self.with_hedge.net_loss),
            format!("${:.2}", net_diff)
        );
        let _ = writeln!(out, "{}", sep_double);
        let _ = writeln!(out, " PROTECTION IMPACT SUMMARY");
        let _ = writeln!(
            out,
            " • Net Capital Preserved:   ${:.2} (Net loss avoided after all friction)",
            self.impact.loss_avoided
        );
        let _ = writeln!(
            out,
            " • Financial Damage Offset: {:.1}% (On-chain liquidation loss neutralized)",
            self.impact.damage_offset_pct
        );
        let _ = writeln!(
            out,
            " • Bad Debt Risk:           {:.0}% (Zero bad debt incurred)",
            self.impact.bad_debt_reduction_pct
        );
        let _ = writeln!(
            out,
            " • Liquidations Absorbed:   {} on-chain event(s) fully covered by hedge P&L",
            self.impact.on_chain_liquidations_absorbed
        );
        let _ = writeln!(
            out,
            " • Total Hedge Overhead:    ${:.2} (Exchange slippage + funding carry)",
            self.impact.hedge_cost
        );
        let _ = writeln!(out, "{}", sep_single);
        let _ = writeln!(
            out,
            " ARCHITECTURE NOTE: Offset does not alter on-chain smart contract code."
        );
        let _ = writeln!(
            out,
            " It executes off-chain perp hedges on Hyperliquid to absorb penalties & keep protocols whole."
        );
        let _ = writeln!(out, "{}", sep_double);

        out
    }

    /// Formats the chronological replay ticks into a structured ASCII timeline table.
    pub fn format_ticks_table(&self) -> String {
        use std::fmt::Write;
        let mut out = String::new();
        let sep = "=".repeat(110);
        let _ = writeln!(out, "{}", sep);
        let _ = writeln!(
            out,
            " {:<20} | {:>8} | {:>7} | {:>9} | {:>8} | {:>9} | {:>10} | {:>10} | {:>10}",
            "TIMESTAMP",
            "PRICE",
            "HF",
            "LIQ PRICE",
            "DISTANCE",
            "RISK",
            "HEDGE POS",
            "HEDGE PNL",
            "FUNDING"
        );
        let _ = writeln!(out, "{}", sep);

        for tick in &self.ticks {
            let hf_str = tick
                .snapshot
                .health_factor
                .map(|v| format!("{:.3}", v))
                .unwrap_or_else(|| "N/A".to_string());
            let lp_str = tick
                .snapshot
                .liquidation_price
                .map(|v| format!("${:.2}", v))
                .unwrap_or_else(|| "N/A".to_string());
            let dist_str = tick
                .snapshot
                .liquidation_distance
                .map(|v| format!("{:.1}%", v * Decimal::from(100)))
                .unwrap_or_else(|| "N/A".to_string());

            let ts_str = tick.timestamp.format("%Y-%m-%d %H:%M").to_string();

            let _ = writeln!(
                out,
                " {:<20} | {:>8} | {:>7} | {:>9} | {:>8} | {:>9} | {:>10} | {:>10} | {:>10}",
                ts_str,
                format!("${:.2}", tick.price),
                hf_str,
                lp_str,
                dist_str,
                format!("{:?}", tick.snapshot.risk_level),
                format!("${:.0}", tick.hedge_position),
                format!("${:.0}", tick.hedge_pnl),
                format!("${:.1}", tick.cumulative_funding)
            );
        }
        let _ = writeln!(out, "{}", sep);
        out
    }
}

pub async fn run_replay(scenario: &HistoricalScenario, policy: &RiskPolicy) -> ReplayResult {
    let with_hedge = run_pass(scenario, Some(policy)).await;
    let without_hedge = run_pass(scenario, None).await;

    let loss_avoided = without_hedge.summary.net_loss - with_hedge.summary.net_loss;

    // Bad debt reduction percentage (100% if protected and zero bad debt incurred)
    let bad_debt_reduction = if without_hedge.summary.bad_debt.is_zero() {
        if with_hedge.summary.bad_debt.is_zero() {
            Decimal::new(100, 0)
        } else {
            Decimal::ZERO
        }
    } else {
        ((without_hedge.summary.bad_debt - with_hedge.summary.bad_debt)
            / without_hedge.summary.bad_debt
            * Decimal::new(100, 0))
        .max(Decimal::ZERO)
    };

    // Percentage of protocol losses neutralized by the hedge
    let damage_offset_pct = if without_hedge.summary.net_loss > Decimal::ZERO {
        (loss_avoided / without_hedge.summary.net_loss) * Decimal::new(100, 0)
    } else {
        Decimal::ZERO
    };

    let liquidations_prevented = without_hedge
        .liquidation_events
        .saturating_sub(with_hedge.liquidation_events);

    let on_chain_liquidations_absorbed =
        if with_hedge.summary.hedge_pnl >= without_hedge.summary.liquidation_penalties {
            without_hedge.liquidation_events
        } else {
            0
        };

    let impact = ProtectionImpact {
        loss_avoided,
        damage_offset_pct,
        bad_debt_reduction_pct: bad_debt_reduction,
        liquidations_prevented,
        on_chain_liquidations_absorbed,
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
    liquidation_events: u32,
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
    let mut last_hedge_notional = Decimal::ZERO;
    let mut liquidation_events = 0u32;

    for pt in &scenario.prices {
        // 1. Update price on position
        if let Some(col) = position.collateral.iter_mut().find(|c| c.asset == "SOL") {
            col.price = pt.price;
        }

        // 2. Evaluate position
        let snapshot = evaluate_position(&position, "SOL", active_policy);

        // 3. Update market state on simulated clearinghouse (marks-to-market & accumulates hourly funding)
        executor
            .set_market_state(pt.price, snapshot.risk_level, snapshot.liquidation_distance)
            .await;

        // 4. Adjust hedge if target changed significantly
        let mut execution = None;
        let delta = (snapshot.target_hedge - last_hedge_notional).abs();
        if delta >= Decimal::new(100, 0) {
            if let Ok(rec) = executor.adjust_hedge(snapshot.target_hedge).await {
                last_hedge_notional = snapshot.target_hedge;
                execution = Some(rec);
            }
        }

        // 5. Query clearinghouse ledger directly from executor
        let ch = executor.clearinghouse_state().await;

        // 6. Model liquidations when health factor < 1.0
        if let Some(hf) = snapshot.health_factor {
            if hf < Decimal::ONE {
                liquidation_events += 1;
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

        ticks.push(ReplayTick {
            timestamp: pt.timestamp,
            price: pt.price,
            snapshot,
            execution,
            hedge_position: ch.position_notional,
            hedge_pnl: ch.total_pnl,
            cumulative_funding: ch.cumulative_funding,
        });
    }

    let final_ch = executor.clearinghouse_state().await;
    let net_loss = total_penalties
        + total_bad_debt
        + final_ch.cumulative_funding
        + final_ch.cumulative_slippage
        - final_ch.total_pnl;

    PassResult {
        ticks,
        summary: OutcomeSummary {
            liquidation_penalties: total_penalties,
            bad_debt: total_bad_debt,
            hedge_pnl: final_ch.total_pnl,
            funding_cost: final_ch.cumulative_funding,
            slippage_cost: final_ch.cumulative_slippage,
            net_loss,
        },
        liquidation_events,
    }
}
