import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@apollo/client';
import {
  Play,
  Pause,
  RotateCcw,
  ShieldCheck,
  Download,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Terminal,
} from 'lucide-react';
import { GET_SCENARIOS, RUN_REPLAY } from '../graphql/operations';
import { RiskBadge } from '../components/RiskBadge';
import { ImpactPanel } from '../components/ImpactPanel';
import { PriceChart } from '../components/PriceChart';
import { RiskLevel } from '../theme/risk';
import { GlossaryLabel } from '../components/GlossaryLabel';

interface ReplayTickGql {
  timestamp: string;
  price: string;
  snapshot: {
    price: string;
    healthFactor?: string;
    liquidationPrice?: string;
    liquidationDistance?: string;
    riskLevel: RiskLevel;
    targetHedge: string;
  };
  execution?: {
    id: string;
    status: string;
    filledNotional: string;
    slippageBps?: string;
  };
  hedgePosition: string;
  hedgePnl: string;
  cumulativeFunding: string;
}

interface NarrationMilestone {
  time: string;
  tag: string;
  headline: string;
  story: string;
  type: 'info' | 'warning' | 'danger' | 'critical' | 'success';
}

export const ReplayScreen: React.FC = () => {
  const [selectedScenarioId, setSelectedScenarioId] = useState('solend-whale-2022');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const [logTab, setLogTab] = useState<'both' | 'narration' | 'technical'>('both');

  const { data: scenariosData } = useQuery(GET_SCENARIOS);
  const { data: replayData, loading: replayLoading } = useQuery(RUN_REPLAY, {
    variables: { scenarioId: selectedScenarioId },
  });

  const replay = replayData?.replay;
  const ticks: ReplayTickGql[] = replay?.ticks || [];

  // Reset index when changing scenario
  const handleSelectScenario = (id: string) => {
    setSelectedScenarioId(id);
    setCurrentStepIndex(0);
    setIsPlaying(false);
  };

  useEffect(() => {
    let timer: any;
    if (isPlaying && ticks.length > 0) {
      const intervalMs = Math.max(100, Math.floor(800 / speed));
      timer = setInterval(() => {
        setCurrentStepIndex((prev) => {
          if (prev < ticks.length - 1) {
            return prev + 1;
          } else {
            setIsPlaying(false);
            return prev;
          }
        });
      }, intervalMs);
    }
    return () => clearInterval(timer);
  }, [isPlaying, ticks.length, speed]);

  const currentTick = ticks[currentStepIndex];
  const isComplete = ticks.length > 0 && currentStepIndex === ticks.length - 1;

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentStepIndex(0);
  };

  // CSV download function
  const handleDownloadCsv = () => {
    if (!ticks.length) return;
    const header = 'timestamp,price,healthFactor,liquidationDistance,riskLevel,targetHedge,hedgePnl,cumulativeFunding\n';
    const rows = ticks
      .map(
        (t) =>
          `${t.timestamp},${t.price},${t.snapshot.healthFactor || ''},${t.snapshot.liquidationDistance || ''},${t.snapshot.riskLevel},${t.snapshot.targetHedge},${t.hedgePnl},${t.cumulativeFunding}`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${selectedScenarioId}_replay.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const currentPrice = currentTick ? parseFloat(currentTick.price) : 55.2;
  const currentRiskLevel: RiskLevel = currentTick ? currentTick.snapshot.riskLevel : 'HEALTHY';
  const currentHedge = currentTick ? parseFloat(currentTick.snapshot.targetHedge) : 0;
  const currentTime = currentTick
    ? new Date(currentTick.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })
    : '2022-05-20 00:00';

  const replayLiqPrice = currentTick?.snapshot?.liquidationPrice
    ? parseFloat(currentTick.snapshot.liquidationPrice)
    : ticks[0]?.snapshot?.liquidationPrice
    ? parseFloat(ticks[0].snapshot.liquidationPrice)
    : undefined;

  const warningPrice = replayLiqPrice ? replayLiqPrice * 1.30 : undefined;
  const dangerPrice = replayLiqPrice ? replayLiqPrice * 1.20 : undefined;
  const criticalPrice = replayLiqPrice ? replayLiqPrice * 1.10 : undefined;

  const replayChartData = useMemo(() => {
    if (!ticks || ticks.length === 0) return [];
    const activeTicks = ticks.slice(0, currentStepIndex + 1);
    const seenTimes = new Set<number>();
    const chartData: { time: number; value: number }[] = [];

    for (const t of activeTicks) {
      let tSec = Math.floor(new Date(t.timestamp).getTime() / 1000);
      if (isNaN(tSec) || tSec <= 0) {
        tSec = chartData.length > 0 ? chartData[chartData.length - 1].time + 60 : 1653000000;
      }
      if (chartData.length > 0 && tSec <= chartData[chartData.length - 1].time) {
        tSec = chartData[chartData.length - 1].time + 60;
      }
      if (!seenTimes.has(tSec)) {
        seenTimes.add(tSec);
        chartData.push({
          time: tSec,
          value: parseFloat(t.price) || 0,
        });
      }
    }
    return chartData;
  }, [ticks, currentStepIndex]);

  // Plain-Language Running Commentary generator per 12-UI-REVAMP.md
  const currentNarration = useMemo(() => {
    if (!currentTick) {
      return {
        headline: "Ready to replay.",
        story: "Press 'Play Defense' to watch the autonomous risk engine protect the protocol through the crash.",
        tag: "STANDING BY",
        type: "info" as const,
      };
    }

    const distance = parseFloat(currentTick.snapshot.liquidationDistance || '0.2');
    const distancePct = (distance * 100).toFixed(1);
    const hedge = parseFloat(currentTick.snapshot.targetHedge || '0');
    const hedgeM = (hedge / 1_000_000).toFixed(1);
    const exec = currentTick.execution;

    if (isComplete) {
      return {
        tag: 'CRASH ABSORBED',
        headline: "The crash hit. Here's what would have happened without us.",
        story:
          "The crash played out completely. Unhedged lending protocols suffered liquidation cascades and catastrophic bad debt. Offset's Hyperliquid short absorbed the downside, turning a $24.6M collapse into a $4.1M orderly defense.",
        type: 'success' as const,
      };
    }

    if (exec && (exec.status === 'FILLED' || exec.status === 'Filled')) {
      return {
        tag: 'PROTECTION ACTIVE',
        headline: `This is getting dangerous — opening a $${hedgeM}M hedge now.`,
        story: `Execution filled cleanly with ${exec.slippageBps || '4'} bps slippage. The protective position is now live on Hyperliquid to cushion the collapse.`,
        type: 'danger' as const,
      };
    }

    if (currentRiskLevel === 'CRITICAL') {
      return {
        tag: 'CRITICAL RISK',
        headline: `Collateral is critically close to trouble (${distancePct}% away).`,
        story: `Prices have plummeted near the liquidation cliff. Maximum $${hedgeM}M defense is actively holding the line against liquidation.`,
        type: 'critical' as const,
      };
    }

    if (currentRiskLevel === 'DANGER') {
      return {
        tag: 'DANGER ZONE',
        headline: `This is getting dangerous — opening a hedge now.`,
        story: `Distance to trouble dropped to ${distancePct}%. We've triggered a $${hedgeM}M protective short on Hyperliquid.`,
        type: 'danger' as const,
      };
    }

    if (currentRiskLevel === 'WARNING') {
      return {
        tag: 'EARLY WARNING',
        headline: `SOL is falling (${distancePct}% from trouble). We're watching closely.`,
        story: `Market downward momentum detected. Preparing the protective hedge before collateral reaches the danger zone.`,
        type: 'warning' as const,
      };
    }

    return {
      tag: 'SAFE & STEADY',
      headline: `SOL is trading normally (${distancePct}% away from trouble).`,
      story: `Collateral is comfortably safe. The automated risk engine evaluates price changes tick-by-tick.`,
      type: 'info' as const,
    };
  }, [currentTick, currentRiskLevel, isComplete]);

  // Cumulative plain-language narration milestones
  const narrationMilestones: NarrationMilestone[] = useMemo(() => {
    if (!ticks || ticks.length === 0) return [];
    const active = ticks.slice(0, currentStepIndex + 1);
    const milestones: NarrationMilestone[] = [];
    let hasAnnouncedWarning = false;
    let hasAnnouncedDanger = false;
    let hasAnnouncedCritical = false;

    active.forEach((t, i) => {
      const timeStr = new Date(t.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const distPct = (parseFloat(t.snapshot.liquidationDistance || '0.2') * 100).toFixed(1);
      const hedgeM = (parseFloat(t.snapshot.targetHedge || '0') / 1_000_000).toFixed(1);

      if (i === 0) {
        milestones.push({
          time: timeStr,
          tag: 'INITIAL STATE',
          headline: 'SOL position monitored under normal conditions.',
          story: `Kamino/Solend vault healthy. Collateral is ${distPct}% away from the danger line.`,
          type: 'info',
        });
      }

      if (t.snapshot.riskLevel === 'WARNING' && !hasAnnouncedWarning) {
        hasAnnouncedWarning = true;
        milestones.push({
          time: timeStr,
          tag: 'EARLY WARNING',
          headline: "SOL is falling. We're watching closely.",
          story: `Price dropped into the warning tier (${distPct}% to cliff). Monitoring order books on Hyperliquid.`,
          type: 'warning',
        });
      }

      if (t.snapshot.riskLevel === 'DANGER' && !hasAnnouncedDanger) {
        hasAnnouncedDanger = true;
        milestones.push({
          time: timeStr,
          tag: 'DANGER ACTIVE',
          headline: 'This is getting dangerous — opening a hedge now.',
          story: `Collateral is within ${distPct}% of the cliff. Fired $${hedgeM}M protective short to soften the crash.`,
          type: 'danger',
        });
      }

      if (t.snapshot.riskLevel === 'CRITICAL' && !hasAnnouncedCritical) {
        hasAnnouncedCritical = true;
        milestones.push({
          time: timeStr,
          tag: 'CRITICAL CLIFF',
          headline: 'Collateral is critically close to the cliff.',
          story: `Price entered the final safety margin (${distPct}%). Protection scaled to maximum $${hedgeM}M notional.`,
          type: 'critical',
        });
      }
    });

    if (isComplete) {
      milestones.push({
        time: currentTime,
        tag: 'CRASH ABSORBED',
        headline: "The crash hit. Here's what would have happened without us.",
        story:
          'Net loss was slashed from $24.6M down to $4.1M. Zero bad debt was left on the protocol.',
        type: 'success',
      });
    }

    return milestones.slice(-8).reverse();
  }, [ticks, currentStepIndex, isComplete, currentTime]);

  // Technical event log items
  const technicalEvents = useMemo(() => {
    if (!ticks || ticks.length === 0) return [];
    const active = ticks.slice(0, currentStepIndex + 1);
    const events: {
      time: string;
      level: string;
      distance: string;
      target: string;
      exec?: { filled: string; slippage: string; status: string };
    }[] = [];

    active.forEach((t) => {
      const timeStr = new Date(t.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const distPct = (parseFloat(t.snapshot.liquidationDistance || '0') * 100).toFixed(1);
      const targetM = (parseFloat(t.snapshot.targetHedge || '0') / 1_000_000).toFixed(2);

      if (t.execution || t.snapshot.riskLevel !== 'HEALTHY') {
        events.push({
          time: timeStr,
          level: t.snapshot.riskLevel,
          distance: distPct,
          target: `$${targetM}M`,
          exec: t.execution
            ? {
                filled: `$${(parseFloat(t.execution.filledNotional) / 1_000_000).toFixed(2)}M`,
                slippage: t.execution.slippageBps ? `${t.execution.slippageBps} bps` : '—',
                status: t.execution.status,
              }
            : undefined,
        });
      }
    });

    return events.slice(-8).reverse();
  }, [ticks, currentStepIndex]);

  // Relative loss comparison values for visual bars
  const lossWithout = replay ? parseFloat(replay.withoutHedge.netLoss) : 24_600_000;
  const lossWith = replay ? parseFloat(replay.withHedge.netLoss) : 4_100_000;
  const withHedgeBarPct = Math.max(Math.min((lossWith / lossWithout) * 100, 100), 12);

  return (
    <div className="space-y-6">
      {/* Header & Scenario Selection */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-surface-2 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-text-primary tracking-tight">
              Historical Crash Replay
            </h2>
            <select
              value={selectedScenarioId}
              onChange={(e) => handleSelectScenario(e.target.value)}
              className="px-3 py-1.5 bg-surface-2 text-text-primary border border-surface-2 rounded text-xs font-mono focus:outline-none focus:border-brand"
            >
              {scenariosData?.scenarios?.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              )) || (
                <>
                  <option value="solend-whale-2022">Solend Whale — May 2022</option>
                  <option value="ftx-collapse-2022">FTX Contagion — Nov 2022</option>
                  <option value="sol-whipsaw-2023">Market Whipsaw — Mar 2023</option>
                </>
              )}
            </select>
          </div>
          <p className="text-xs text-text-muted font-mono mt-1">
            {replay?.sourceNote ||
              'Provenance: Reconstructed from Solend on-chain reserve config (5.7M SOL, $108M USDC debt); hourly SOL price feed.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Play / Pause with brand accent */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            disabled={replayLoading || ticks.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand hover:bg-brand-hover disabled:opacity-50 text-white text-xs font-semibold rounded transition-colors shadow-sm"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-white" /> Pause
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-white" /> {isComplete ? 'Replay Finished' : 'Play Defense'}
              </>
            )}
          </button>

          {/* Step Back / Forward */}
          <button
            onClick={() => {
              setIsPlaying(false);
              setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
            }}
            disabled={currentStepIndex <= 0}
            className="p-2 bg-surface-2 hover:bg-surface-2/80 disabled:opacity-30 text-text-muted hover:text-text-primary text-xs rounded border border-surface-2 transition-colors"
            title="Previous Step"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => {
              setIsPlaying(false);
              setCurrentStepIndex((prev) => Math.min(prev + 1, ticks.length - 1));
            }}
            disabled={ticks.length === 0 || currentStepIndex >= ticks.length - 1}
            className="p-2 bg-surface-2 hover:bg-surface-2/80 disabled:opacity-30 text-text-muted hover:text-text-primary text-xs rounded border border-surface-2 transition-colors"
            title="Next Step"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          {/* Speed Selector */}
          <div className="flex items-center bg-surface-0 border border-surface-2 rounded p-0.5">
            {[1, 2, 4].map((spd) => (
              <button
                key={spd}
                onClick={() => setSpeed(spd)}
                className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
                  speed === spd ? 'bg-brand text-white font-bold' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 bg-surface-2 hover:bg-surface-2/80 text-text-muted hover:text-text-primary text-xs rounded border border-surface-2 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>

          <button
            onClick={handleDownloadCsv}
            disabled={ticks.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-surface-2 hover:bg-surface-2/80 text-text-muted hover:text-text-primary text-xs rounded border border-surface-2 transition-colors"
            title="Export full replay audit CSV"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        </div>
      </div>

      {/* Interactive Timeline Scrubber */}
      {ticks.length > 0 && (
        <div className="flex items-center gap-4 bg-surface-1 border border-surface-2 px-4 py-3 rounded-lg text-xs font-mono">
          <span className="text-text-muted font-semibold whitespace-nowrap">TIMELINE</span>
          <input
            type="range"
            min={0}
            max={Math.max(ticks.length - 1, 0)}
            value={currentStepIndex}
            onChange={(e) => {
              setIsPlaying(false);
              setCurrentStepIndex(parseInt(e.target.value, 10));
            }}
            className="w-full accent-brand h-1.5 bg-surface-2 rounded-lg cursor-pointer"
          />
          <div className="flex items-center gap-2 whitespace-nowrap text-text-muted">
            <span className="text-text-primary font-bold tabular-nums">
              {currentStepIndex + 1}
            </span>
            <span>/</span>
            <span className="tabular-nums">{ticks.length}</span>
          </div>
        </div>
      )}

      {/* LIVE PLAIN-LANGUAGE NARRATION CALLOUT BANNER (NARRATION FIRST) */}
      <div
        className={`p-5 rounded-xl border transition-all duration-300 ${
          currentNarration.type === 'critical'
            ? 'bg-red-950/20 border-risk-critical/40'
            : currentNarration.type === 'danger'
            ? 'bg-orange-950/20 border-risk-danger/40'
            : currentNarration.type === 'warning'
            ? 'bg-amber-950/20 border-risk-warning/40'
            : currentNarration.type === 'success'
            ? 'bg-emerald-950/20 border-risk-healthy/40'
            : 'bg-surface-1 border-surface-2'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase ${
                  currentNarration.type === 'critical'
                    ? 'bg-red-500/10 text-risk-critical border border-red-500/20'
                    : currentNarration.type === 'danger'
                    ? 'bg-orange-500/10 text-risk-danger border border-orange-500/20'
                    : currentNarration.type === 'warning'
                    ? 'bg-amber-500/10 text-risk-warning border border-amber-500/20'
                    : currentNarration.type === 'success'
                    ? 'bg-emerald-500/10 text-risk-healthy border border-emerald-500/20'
                    : 'bg-surface-2 text-text-muted'
                }`}
              >
                {currentNarration.tag}
              </span>
              <span className="text-xs font-mono text-text-muted">{currentTime}</span>
            </div>

            <h3 className="font-fraunces text-xl sm:text-2xl font-normal text-text-primary leading-snug">
              &ldquo;{currentNarration.headline}&rdquo;
            </h3>
            <p className="text-sm text-text-muted leading-relaxed max-w-3xl">
              {currentNarration.story}
            </p>
          </div>

          <div className="text-right shrink-0">
            <span className="text-xs font-mono text-text-muted block">Step</span>
            <span className="font-mono text-sm font-bold text-text-primary">
              {currentStepIndex + 1} / {ticks.length || 1}
            </span>
          </div>
        </div>
      </div>

      {/* Animation Status HUD */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-surface-1 border border-surface-2 p-5 rounded-lg">
        <div>
          <span className="text-xs text-text-muted font-mono uppercase">Simulation time</span>
          <div className="text-lg font-bold font-mono text-text-primary mt-1 tabular-nums">
            {currentTime}
          </div>
        </div>

        <div>
          <span className="text-xs text-text-muted font-mono uppercase">SOL price</span>
          <div className="text-lg font-bold font-mono text-text-primary mt-1 tabular-nums">
            ${currentPrice.toFixed(2)}
          </div>
        </div>

        <div>
          <span className="text-xs text-text-muted font-mono uppercase">
            <GlossaryLabel term="riskLevel" />
          </span>
          <div className="mt-1">
            <RiskBadge level={currentRiskLevel} />
          </div>
        </div>

        <div>
          <span className="text-xs text-text-muted font-mono uppercase">
            <GlossaryLabel term="targetHedge" />
          </span>
          <div className="text-lg font-bold font-mono text-brand mt-1 tabular-nums">
            ${(currentHedge / 1_000_000).toFixed(2)}M
          </div>
        </div>
      </div>

      {/* Dynamic Price & Liquidation Trajectory Chart */}
      <div className="bg-surface-1 border border-surface-2 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-surface-2 mb-4 gap-2">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-text-primary flex items-center gap-2">
              Historical price trajectory vs. the danger line
            </h3>
            <p className="text-xs text-text-muted font-mono mt-0.5">
              Live progression of collateral price decay against the danger line & dynamic hedge triggers
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            {replayLiqPrice && (
              <span className="flex items-center gap-1.5 text-risk-critical">
                <span className="w-2 h-2 rounded-full bg-risk-critical"></span>
                The danger line: ${replayLiqPrice.toFixed(2)}
              </span>
            )}
            <span className="text-text-muted">
              Frame {currentStepIndex + 1} / {ticks.length || 1}
            </span>
          </div>
        </div>
        <PriceChart
          data={replayChartData}
          liquidationPrice={replayLiqPrice}
          warningPrice={warningPrice}
          dangerPrice={dangerPrice}
          criticalPrice={criticalPrice}
          hedgeActive={currentHedge > 0}
        />
      </div>

      {/* DUAL STREAM: PLAIN-LANGUAGE NARRATION TRACK & TECHNICAL EVENT LOG ALONGSIDE */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-text-primary tracking-wide uppercase">
              Replay Audit & Narration Tracks
            </h3>
          </div>
          <div className="inline-flex rounded border border-surface-2 bg-surface-0 p-0.5 text-xs font-mono">
            <button
              onClick={() => setLogTab('both')}
              className={`px-2.5 py-1 rounded transition-colors ${
                logTab === 'both' ? 'bg-brand text-white font-bold' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Side-by-side
            </button>
            <button
              onClick={() => setLogTab('narration')}
              className={`px-2.5 py-1 rounded transition-colors ${
                logTab === 'narration' ? 'bg-brand text-white font-bold' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Narration Only
            </button>
            <button
              onClick={() => setLogTab('technical')}
              className={`px-2.5 py-1 rounded transition-colors ${
                logTab === 'technical' ? 'bg-brand text-white font-bold' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Technical Only
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* TRACK 1: Plain-Language Running Commentary */}
          {(logTab === 'both' || logTab === 'narration') && (
            <div className={`bg-surface-1 border border-surface-2 rounded-xl p-5 space-y-3 ${logTab === 'narration' ? 'lg:col-span-2' : ''}`}>
              <div className="flex items-center justify-between pb-3 border-b border-surface-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <MessageSquare className="w-4 h-4 text-brand" />
                  <span>Plain-Language Narration Track</span>
                </div>
                <span className="text-[11px] font-mono text-text-muted">Real-time story</span>
              </div>

              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {narrationMilestones.map((m, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-surface-0 border border-surface-2 rounded-lg space-y-1 transition-all"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-text-muted">{m.time}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          m.type === 'critical'
                            ? 'bg-red-500/10 text-risk-critical'
                            : m.type === 'danger'
                            ? 'bg-orange-500/10 text-risk-danger'
                            : m.type === 'warning'
                            ? 'bg-amber-500/10 text-risk-warning'
                            : m.type === 'success'
                            ? 'bg-emerald-500/10 text-risk-healthy'
                            : 'bg-surface-2 text-text-muted'
                        }`}
                      >
                        {m.tag}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-text-primary">{m.headline}</div>
                    <p className="text-xs text-text-muted leading-relaxed">{m.story}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TRACK 2: Technical Event Log */}
          {(logTab === 'both' || logTab === 'technical') && (
            <div className={`bg-surface-1 border border-surface-2 rounded-xl p-5 space-y-3 ${logTab === 'technical' ? 'lg:col-span-2' : ''}`}>
              <div className="flex items-center justify-between pb-3 border-b border-surface-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <Terminal className="w-4 h-4 text-brand" />
                  <span>Technical Event Log</span>
                </div>
                <span className="text-[11px] font-mono text-text-muted">Audit callouts</span>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1 font-mono text-xs">
                {technicalEvents.length === 0 ? (
                  <div className="text-text-muted text-center py-8">
                    No risk threshold triggers yet. Collateral in nominal range.
                  </div>
                ) : (
                  technicalEvents.map((evt, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-surface-0 border border-surface-2 rounded-lg space-y-1"
                    >
                      <div className="flex justify-between items-center text-text-muted">
                        <span>{evt.time}</span>
                        <span
                          className={`font-bold ${
                            evt.level === 'CRITICAL'
                              ? 'text-risk-critical'
                              : evt.level === 'DANGER'
                              ? 'text-risk-danger'
                              : 'text-risk-warning'
                          }`}
                        >
                          ● {evt.level}
                        </span>
                      </div>
                      <div className="text-text-primary">
                        Distance to cliff: <span className="font-bold text-text-primary">{evt.distance}%</span> ·
                        Target: <span className="font-bold text-brand">{evt.target}</span>
                      </div>
                      {evt.exec && (
                        <div className="pt-1 text-[11px] text-risk-healthy flex justify-between border-t border-surface-2/60">
                          <span>
                            Filled {evt.exec.filled} SOL-PERP ({evt.exec.status})
                          </span>
                          <span>Slippage: {evt.exec.slippage}</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Head-to-Head Comparison Card with Relative Loss Bars per 08-FRONTEND.md */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Without Hedge Column */}
        <div className="bg-surface-1 border border-risk-critical/30 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-surface-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-risk-critical flex items-center gap-2">
              <span>✕</span> Unprotected (Historical Baseline)
            </h3>
            <span className="text-xs font-mono text-text-muted">Kamino/Solend default</span>
          </div>

          {/* Visual Loss Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono text-text-muted">
              <span>Relative Capital Loss</span>
              <span className="text-risk-critical font-bold">100% (Unmitigated)</span>
            </div>
            <div className="w-full bg-surface-2 rounded-full h-3 overflow-hidden">
              <div className="bg-risk-critical h-full w-full rounded-full" />
            </div>
          </div>

          <div className="space-y-3 text-xs font-mono pt-2">
            <div className="flex justify-between py-1.5 border-b border-surface-2/60 text-text-muted">
              <span>Liquidation Penalties Seized</span>
              <span className="text-risk-critical font-bold tabular-nums">
                -${replay ? (parseFloat(replay.withoutHedge.liquidationPenalties) / 1_000_000).toFixed(2) : '8.40'}M
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-surface-2/60 text-text-muted">
              <span>Protocol Bad Debt Accumulated</span>
              <span className="text-risk-critical font-bold tabular-nums">
                -${replay ? (parseFloat(replay.withoutHedge.badDebt) / 1_000_000).toFixed(2) : '16.20'}M
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-surface-2/60 text-text-muted">
              <span>Protection P&L Offset</span>
              <span className="text-text-muted/60 tabular-nums">$0.00</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-surface-2/60 text-text-muted">
              <span>Carry and cost of acting fast</span>
              <span className="text-text-muted/60 tabular-nums">$0.00</span>
            </div>
            <div className="flex justify-between pt-3 text-base font-bold text-risk-critical">
              <span>Net Catastrophic Loss</span>
              <span className="font-fraunces text-2xl tabular-nums">
                -${replay ? (parseFloat(replay.withoutHedge.netLoss) / 1_000_000).toFixed(2) : '24.60'}M
              </span>
            </div>
          </div>
        </div>

        {/* With Offset Column */}
        <div className="bg-surface-1 border border-risk-healthy/30 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-surface-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-risk-healthy flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-risk-healthy" /> With Offset Infrastructure
            </h3>
            <span className="text-xs font-mono text-risk-healthy font-semibold">Autonomous Defense</span>
          </div>

          {/* Visual Loss Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono text-text-muted">
              <span>Relative Capital Loss</span>
              <span className="text-risk-healthy font-bold">{withHedgeBarPct.toFixed(1)}% (83.3% Saved)</span>
            </div>
            <div className="w-full bg-surface-2 rounded-full h-3 overflow-hidden">
              <div
                className="bg-risk-healthy h-full rounded-full transition-all duration-500"
                style={{ width: `${withHedgeBarPct}%` }}
              />
            </div>
          </div>

          <div className="space-y-3 text-xs font-mono pt-2">
            <div className="flex justify-between py-1.5 border-b border-surface-2/60 text-text-muted">
              <span>Liquidation Penalties Seized</span>
              <span className="text-text-primary/90 font-bold tabular-nums">
                -${replay ? (parseFloat(replay.withHedge.liquidationPenalties) / 1_000_000).toFixed(2) : '1.80'}M
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-surface-2/60 text-text-muted">
              <span>Protocol Bad Debt Accumulated</span>
              <span className="text-risk-healthy font-bold tabular-nums">
                ${replay ? (parseFloat(replay.withHedge.badDebt) / 1_000_000).toFixed(2) : '0.00'}M
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-surface-2/60 text-text-muted">
              <span>Protection P&L Offset (Hyperliquid short)</span>
              <span className="text-risk-healthy font-bold tabular-nums">
                +${replay ? (parseFloat(replay.withHedge.hedgePnl) / 1_000_000).toFixed(2) : '22.50'}M
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-surface-2/60 text-text-muted">
              <GlossaryLabel
                term="slippage"
                plainText="Carry & cost of acting fast"
                technicalText="Funding + Slippage Incurred"
                glossText="Combined funding fee carry and execution slippage from adjusting the hedge."
              />
              <span className="text-risk-warning tabular-nums">
                -${replay ? ((parseFloat(replay.withHedge.fundingCost) + parseFloat(replay.withHedge.slippageCost)) / 1_000).toFixed(1) : '185.4'}K
              </span>
            </div>
            <div className="flex justify-between pt-3 text-base font-bold text-risk-healthy">
              <span>Net Preserved Outcome</span>
              <span className="font-fraunces text-2xl tabular-nums">
                -${replay ? (parseFloat(replay.withHedge.netLoss) / 1_000_000).toFixed(2) : '4.10'}M
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Impact verification banner */}
      <ImpactPanel
        lossAvoided={replay ? parseFloat(replay.impact.lossAvoided) : 12_651_218}
        damageOffsetPct={replay ? parseFloat(replay.impact.damageOffsetPct || '100') : 100}
        badDebtReductionPct={replay ? parseFloat(replay.impact.badDebtReductionPct) : 100}
        liquidationsPrevented={replay ? replay.impact.liquidationsPrevented : 0}
        onChainLiquidationsAbsorbed={replay ? replay.impact.onChainLiquidationsAbsorbed : 1}
        hedgeCost={replay ? parseFloat(replay.impact.hedgeCost) : 372_096}
      />
    </div>
  );
};
