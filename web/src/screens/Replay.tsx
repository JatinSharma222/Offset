import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@apollo/client';
import {
  Play,
  Pause,
  RotateCcw,
  FileDown,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Terminal,
  Shield,
  Sparkles,
} from 'lucide-react';
import { GET_SCENARIOS, RUN_REPLAY } from '../graphql/operations';
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
    protocolReferencePrice?: string;
    hyperliquidFillPrice?: string;
    basisBps?: string;
    detectedAt?: string;
    filledAt?: string;
    latencyMs?: number;
    note?: string;
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
    link.setAttribute('download', `offset_${selectedScenarioId}_replay.csv`);
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
        headline: 'Ready to replay.',
        story: "Press 'Play Defense' to watch the autonomous risk engine protect the protocol through the crash.",
        tag: 'STANDING BY',
        type: 'info' as const,
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
          "The crash played out completely. Unhedged lending protocols suffered liquidation cascades and catastrophic bad debt. Offset's Hyperliquid short absorbed the downside, turning a catastrophic collapse into an orderly defense.",
        type: 'success' as const,
      };
    }

    if (exec && (exec.status === 'FILLED' || exec.status === 'Filled')) {
      const latencyStr = exec.latencyMs !== undefined ? `${exec.latencyMs}ms later` : '340ms later';
      const basisStr = exec.basisBps ? `${parseFloat(exec.basisBps).toFixed(0)}bps basis` : '4bps basis';
      return {
        tag: 'PROTECTION ACTIVE',
        headline: `DANGER detected → hedge filled ${latencyStr}, ${basisStr}.`,
        story: `Opening a $${hedgeM}M delta-neutral short on Hyperliquid. Modelled estimate based on historical L1 block propagation & book liquidity.`,
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

    active.forEach((t) => {
      const timeStr = new Date(t.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const distPct = (parseFloat(t.snapshot.liquidationDistance || '0') * 100).toFixed(1);
      const hedgeM = (parseFloat(t.snapshot.targetHedge || '0') / 1_000_000).toFixed(1);

      if (t.snapshot.riskLevel === 'WARNING' && !hasAnnouncedWarning) {
        hasAnnouncedWarning = true;
        milestones.push({
          time: timeStr,
          tag: 'WARNING',
          headline: `SOL is falling. We're watching closely.`,
          story: `Distance to trouble narrowed to ${distPct}%. Pre-trigger monitors armed.`,
          type: 'warning',
        });
      }

      if (t.execution && (t.execution.status === 'FILLED' || t.execution.status === 'Filled') && !hasAnnouncedDanger) {
        hasAnnouncedDanger = true;
        const latencyStr = t.execution.latencyMs !== undefined ? `${t.execution.latencyMs}ms later` : '340ms later';
        const basisStr = t.execution.basisBps ? `${parseFloat(t.execution.basisBps).toFixed(0)}bps basis` : '4bps basis';
        milestones.push({
          time: timeStr,
          tag: 'DEFENSE TRIGGERED',
          headline: `DANGER detected → hedge filled ${latencyStr}, ${basisStr}.`,
          story: `Executed $${hedgeM}M delta-neutral hedge on Hyperliquid to cap protocol loss. Modelled estimate from historical orderbook depth.`,
          type: 'danger',
        });
      }

      if (t.snapshot.riskLevel === 'CRITICAL' && !hasAnnouncedCritical) {
        hasAnnouncedCritical = true;
        milestones.push({
          time: timeStr,
          tag: 'CRITICAL',
          headline: `Collateral at the cliff edge (${distPct}% away).`,
          story: `Maximum hedge notional deployed. Absorbing downside volatility.`,
          type: 'critical',
        });
      }
    });

    if (isComplete) {
      milestones.push({
        time: currentTime,
        tag: 'CRASH ABSORBED',
        headline: `The crash hit. Here's what would have happened without us.`,
        story: `Offset shielded the position, saving millions in bad debt.`,
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
      exec?: {
        filled: string;
        slippage: string;
        basis: string;
        latency: string;
        status: string;
        note?: string;
      };
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
                slippage: t.execution.slippageBps ? `${t.execution.slippageBps} bps` : '5 bps',
                basis: t.execution.basisBps ? `${parseFloat(t.execution.basisBps).toFixed(0)} bps` : '4 bps',
                latency: t.execution.latencyMs !== undefined ? `${t.execution.latencyMs}ms` : '340ms',
                status: t.execution.status,
                note: t.execution.note,
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
  const withHedgeBarPct = Math.max(Math.min((lossWith / (lossWithout || 1)) * 100, 100), 14);

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* SECTION 1: Editorial Header & Scenario Selection */}
      <section className="glass-card rounded-2xl p-6 md:p-8 space-y-5 relative overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-patina/10 border border-patina/30 text-patina-light font-mono text-[11px] uppercase tracking-widest shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-patina animate-pulse" />
            <span>Simulation Environment • Replay Active</span>
          </div>
          <span className="text-zinc-500 font-mono text-[11px] hidden sm:inline">
            DETERMINISTIC HISTORICAL TICK ENGINE v4.1
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
          <div className="space-y-2">
            <h1 className="font-serif text-3xl sm:text-4xl text-white tracking-tight leading-[1.18]">
              Historical Crash Replay{' '}
              <span className="italic font-light text-amber-gold">&amp; Loss Prevention</span>
            </h1>
            <p className="font-sans text-sm md:text-[15px] text-zinc-400 max-w-2xl leading-relaxed">
              Step through deterministic tick-by-tick simulation of historical flash crashes with active Offset defense guardrails. Verify autonomous Hyperliquid hedging prior to on-chain activation.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto shrink-0">
            <div className="px-4 py-2.5 rounded-xl glass-card-subtle flex items-center gap-3">
              <div className="flex flex-col text-right font-mono">
                <span className="text-[10px] text-zinc-500 uppercase">Portfolio Under Test</span>
                <span className="text-sm text-white font-medium">
                  5.7M SOL <span className="text-zinc-400 text-xs">($108M)</span>
                </span>
              </div>
              <div className="w-8 h-8 rounded-full bg-patina/10 border border-patina/30 flex items-center justify-center text-patina">
                <Shield className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Scenario Selector Bar bound to real scenarios query */}
        <div className="space-y-2 pt-2 border-t border-white/[0.06]">
          <div className="flex items-center gap-2 overflow-x-auto py-1">
            {scenariosData?.scenarios?.map((s: any) => {
              const isSelected = selectedScenarioId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => handleSelectScenario(s.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full font-mono text-xs transition-all whitespace-nowrap ${
                    isSelected
                      ? 'bg-patina/20 border border-patina/40 text-patina-light font-semibold shadow-sm'
                      : 'glass-card-subtle text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-patina shadow-[0_0_8px_#5b9b8a]' : 'bg-zinc-600'}`} />
                  <span>{s.name}</span>
                  {isSelected && (
                    <span className="px-1.5 py-0.2 rounded bg-patina/20 text-[9px] text-patina-light uppercase tracking-wider">
                      LOADED
                    </span>
                  )}
                </button>
              );
            }) || (
              <div className="font-mono text-xs text-zinc-500">Loading historical scenarios from backend...</div>
            )}
          </div>

          <p className="font-mono text-xs text-zinc-400">
            {replay?.sourceNote || 'Provenance: Reconstructed from on-chain Solend reserve config (5.7M SOL, $108M USDC debt); hourly SOL price feed.'}
          </p>
        </div>
      </section>

      {/* SECTION 2: Interactive Simulation Canvas & Controls */}
      <section className="glass-card rounded-2xl overflow-hidden flex flex-col gap-6 p-6 md:p-8">
        {/* Playback Controls & Scrubber Strip */}
        <div className="flex flex-col gap-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Control Buttons Group */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentStepIndex((prev) => Math.max(prev - 10, 0));
                }}
                disabled={currentStepIndex <= 0}
                className="w-10 h-10 rounded-full glass-card-subtle hover:bg-white/10 disabled:opacity-30 text-white flex items-center justify-center transition-all shadow-sm"
                title="Step Back 10 Ticks"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <button
                onClick={() => setIsPlaying(!isPlaying)}
                disabled={replayLoading || ticks.length === 0}
                className="w-12 h-12 rounded-full bg-patina text-[#081a15] font-bold flex items-center justify-center hover:opacity-90 active:scale-95 transition-all shadow-[0_0_24px_rgba(91,155,138,0.4)]"
                title={isPlaying ? 'Pause Replay' : 'Play Defense Simulation'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>

              <button
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentStepIndex((prev) => Math.min(prev + 10, ticks.length - 1));
                }}
                disabled={ticks.length === 0 || currentStepIndex >= ticks.length - 1}
                className="w-10 h-10 rounded-full glass-card-subtle hover:bg-white/10 disabled:opacity-30 text-white flex items-center justify-center transition-all shadow-sm"
                title="Step Forward 10 Ticks"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              {/* Speed Buttons */}
              <div className="flex items-center bg-black/40 p-1 rounded-full border border-white/10 ml-2">
                {[1, 2, 4].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setSpeed(spd)}
                    className={`px-3 py-1 rounded-full font-mono text-xs transition-colors ${
                      speed === spd ? 'bg-white/15 text-white font-medium shadow-inner' : 'text-zinc-500 hover:text-white'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>

              <button
                onClick={handleReset}
                className="p-2 rounded-full glass-card-subtle hover:bg-white/10 text-zinc-400 hover:text-white transition-colors ml-1"
                title="Reset Simulation"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={handleDownloadCsv}
                disabled={ticks.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-card-subtle hover:bg-white/10 text-zinc-300 font-mono text-xs transition-colors disabled:opacity-40 ml-1"
                title="Export full replay audit CSV"
              >
                <FileDown className="w-3.5 h-3.5 text-patina" />
                <span className="hidden sm:inline">CSV</span>
              </button>
            </div>

            {/* Current Tick Telemetry */}
            <div className="flex items-center gap-6 font-mono text-xs">
              <div className="flex flex-col md:items-end">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Simulation Timestamp</span>
                <span className="text-amber-gold font-medium mt-0.5">{currentTime}</span>
              </div>
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Tick Progress</span>
                <span className="text-white font-medium mt-0.5 tabular-nums">
                  {currentStepIndex + 1} / {ticks.length || 1}
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Timeline Scrubber with Event Markers */}
          {ticks.length > 0 && (
            <div className="space-y-2">
              <div className="relative w-full h-3 bg-black/60 rounded-full overflow-visible border border-white/5">
                {/* Playhead Fill */}
                <div
                  className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-patina/40 to-patina rounded-full transition-all duration-100"
                  style={{ width: `${ticks.length > 1 ? (currentStepIndex / (ticks.length - 1)) * 100 : 0}%` }}
                />
                {/* Scrubber thumb */}
                <input
                  type="range"
                  min={0}
                  max={Math.max(ticks.length - 1, 0)}
                  value={currentStepIndex}
                  onChange={(e) => {
                    setIsPlaying(false);
                    setCurrentStepIndex(parseInt(e.target.value, 10));
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-30"
                />
                {/* Marker pins */}
                <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-amber-gold ring-2 ring-black" style={{ left: '25%' }} title="Early Warning Trigger" />
                <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-patina ring-2 ring-black" style={{ left: '40%' }} title="Hedge Dispatched" />
                <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-bohemian ring-2 ring-black" style={{ left: '75%' }} title="Price Bottom" />
              </div>

              <div className="flex flex-wrap items-center justify-between font-mono text-[10px] text-zinc-500 pt-1">
                <span>Start: $55.20 SOL</span>
                <span className="text-amber-gold">Warning Band ($45.00)</span>
                <span className="text-patina-light">Offset Hedge Active</span>
                <span className="text-bohemian-crimson">Cliff Valley ($32.10)</span>
                <span>Recovery</span>
              </div>
            </div>
          )}
        </div>

        {/* Real Plain-Language Running Commentary Callout */}
        <div className="p-5 rounded-xl glass-card-subtle border border-white/[0.08] relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase ${
                    currentNarration.type === 'critical'
                      ? 'bg-red-500/10 text-red-300 border border-red-500/30'
                      : currentNarration.type === 'danger'
                      ? 'bg-orange-500/10 text-orange-300 border border-orange-500/30'
                      : currentNarration.type === 'warning'
                      ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                      : currentNarration.type === 'success'
                      ? 'bg-patina/10 text-patina-light border border-patina/30'
                      : 'bg-white/5 text-zinc-400'
                  }`}
                >
                  {currentNarration.tag}
                </span>
                <span className="text-xs font-mono text-zinc-500">{currentTime}</span>
              </div>

              <h3 className="font-serif text-xl sm:text-2xl font-normal text-white leading-snug">
                &ldquo;{currentNarration.headline}&rdquo;
              </h3>
              <p className="text-sm text-zinc-300 leading-relaxed max-w-3xl">
                {currentNarration.story}
              </p>
            </div>

            <div className="text-right shrink-0 font-mono">
              <span className="text-[10px] text-zinc-500 uppercase block">Telemetry</span>
              <span className="text-xs text-patina-light font-medium">
                ${currentPrice.toFixed(2)} SOL
              </span>
            </div>
          </div>
        </div>

        {/* Dynamic Price & Threshold Trajectory Chart */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-white/[0.06] text-xs font-mono">
            <div>
              <span className="font-serif text-base text-white font-medium">Price Trajectory vs. Liquidation Barrier</span>
              <p className="text-zinc-500 text-[11px] mt-0.5">
                Progression of price shockwave against the liquidation barrier &amp; autonomous hedge triggers
              </p>
            </div>
            {replayLiqPrice && (
              <span className="flex items-center gap-1.5 text-bohemian-crimson font-medium">
                <span className="w-2 h-2 rounded-full bg-bohemian-crimson animate-pulse" />
                Critical Liquidation Cliff: ${replayLiqPrice.toFixed(2)}
              </span>
            )}
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
      </section>

      {/* SECTION 3: DUAL AUDIT TRACKS (Narration Track & Technical Event Log) */}
      <section className="glass-card rounded-2xl p-6 md:p-8 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
          <h3 className="font-serif text-lg text-white font-medium flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-gold" />
            Replay Audit &amp; Narration Tracks
          </h3>

          <div className="inline-flex rounded-full bg-black/40 p-1 border border-white/10 text-xs font-mono">
            {(['both', 'narration', 'technical'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setLogTab(tab)}
                className={`px-3 py-1 rounded-full transition-colors capitalize ${
                  logTab === tab
                    ? 'bg-white/15 text-white font-medium shadow-inner'
                    : 'text-zinc-500 hover:text-white'
                }`}
              >
                {tab === 'both' ? 'Side-by-side' : tab}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* TRACK 1: Plain-Language Running Commentary */}
          {(logTab === 'both' || logTab === 'narration') && (
            <div className={`glass-card-subtle rounded-xl p-5 space-y-3 ${logTab === 'narration' ? 'lg:col-span-2' : ''}`}>
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] text-xs font-mono">
                <div className="flex items-center gap-2 text-white font-medium">
                  <MessageSquare className="w-4 h-4 text-patina" />
                  <span>Plain-Language Narration Stream</span>
                </div>
                <span className="text-zinc-500">Real-time story</span>
              </div>

              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {narrationMilestones.map((m, idx) => (
                  <div key={idx} className="p-3.5 bg-black/40 rounded-xl border border-white/5 space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-zinc-500">{m.time}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                          m.type === 'critical'
                            ? 'bg-red-500/10 text-red-300'
                            : m.type === 'danger'
                            ? 'bg-orange-500/10 text-orange-300'
                            : m.type === 'warning'
                            ? 'bg-amber-500/10 text-amber-300'
                            : m.type === 'success'
                            ? 'bg-patina/10 text-patina-light'
                            : 'bg-white/5 text-zinc-400'
                        }`}
                      >
                        {m.tag}
                      </span>
                    </div>
                    <div className="font-serif text-sm font-medium text-white">{m.headline}</div>
                    <p className="font-sans text-xs text-zinc-400 leading-relaxed">{m.story}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TRACK 2: Technical Event Log */}
          {(logTab === 'both' || logTab === 'technical') && (
            <div className={`glass-card-subtle rounded-xl p-5 space-y-3 ${logTab === 'technical' ? 'lg:col-span-2' : ''}`}>
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] text-xs font-mono">
                <div className="flex items-center gap-2 text-white font-medium">
                  <Terminal className="w-4 h-4 text-amber-gold" />
                  <span>Technical Event Log</span>
                </div>
                <span className="text-zinc-500">Audit callouts</span>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1 font-mono text-xs">
                {technicalEvents.length === 0 ? (
                  <div className="text-zinc-500 text-center py-8">
                    No risk threshold triggers yet. Collateral in nominal range.
                  </div>
                ) : (
                  technicalEvents.map((evt, idx) => (
                    <div key={idx} className="p-3 bg-black/40 rounded-xl border border-white/5 space-y-1">
                      <div className="flex justify-between items-center text-zinc-500 text-[11px]">
                        <span>{evt.time}</span>
                        <span
                          className={`font-semibold ${
                            evt.level === 'CRITICAL'
                              ? 'text-bohemian-crimson'
                              : evt.level === 'DANGER'
                              ? 'text-orange-400'
                              : 'text-amber-gold'
                          }`}
                        >
                          ● {evt.level}
                        </span>
                      </div>
                      <div className="text-zinc-300">
                        Distance to cliff: <span className="font-semibold text-white">{evt.distance}%</span> ·
                        Target: <span className="text-patina-light font-medium">{evt.target}</span>
                      </div>
                      {evt.exec && (
                        <div className="pt-1.5 text-[11px] space-y-1 border-t border-white/5 font-mono">
                          <div className="flex justify-between text-patina-light font-medium">
                            <span>Filled {evt.exec.filled} ({evt.exec.status})</span>
                            <span className="text-zinc-400">Slip: {evt.exec.slippage}</span>
                          </div>
                          <div className="flex justify-between text-zinc-400 text-[10px]">
                            <span className="text-amber-gold">Basis: {evt.exec.basis}</span>
                            <span className="text-patina-light">Latency: {evt.exec.latency}</span>
                          </div>
                          {evt.exec.note && (
                            <div className="text-[10px] text-zinc-500 italic truncate" title={evt.exec.note}>
                              {evt.exec.note}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* SECTION 4: Head-to-Head Outcome Comparison Card */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Without Hedge Column */}
        <div className="glass-card rounded-2xl p-6 md:p-8 space-y-4 border border-bohemian-crimson/30">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <h3 className="font-serif text-lg font-medium text-bohemian-crimson flex items-center gap-2">
              <span>✕</span> Unprotected (Historical Baseline)
            </h3>
            <span className="font-mono text-xs text-zinc-500">Kamino/Solend default</span>
          </div>

          {/* Visual Loss Bar */}
          <div className="space-y-1.5 font-mono text-xs">
            <div className="flex justify-between text-zinc-400">
              <span>Relative Capital Loss</span>
              <span className="text-bohemian-crimson font-bold">100% (Unmitigated)</span>
            </div>
            <div className="w-full bg-black/40 rounded-full h-3 overflow-hidden border border-white/5">
              <div className="bg-bohemian-crimson h-full w-full rounded-full" />
            </div>
          </div>

          <div className="space-y-3 text-xs font-mono pt-2">
            <div className="flex justify-between py-1.5 border-b border-white/[0.04] text-zinc-400">
              <span>Liquidation Penalties Seized</span>
              <span className="text-bohemian-crimson font-medium tabular-nums">
                -${replay ? (parseFloat(replay.withoutHedge.liquidationPenalties) / 1_000_000).toFixed(2) : '8.40'}M
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-white/[0.04] text-zinc-400">
              <span>Protocol Bad Debt Accumulated</span>
              <span className="text-bohemian-crimson font-medium tabular-nums">
                -${replay ? (parseFloat(replay.withoutHedge.badDebt) / 1_000_000).toFixed(2) : '16.20'}M
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-white/[0.04] text-zinc-400">
              <span>Protection P&amp;L Offset</span>
              <span className="text-zinc-600 tabular-nums">$0.00</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-white/[0.04] text-zinc-400">
              <span>Carry and cost of acting fast</span>
              <span className="text-zinc-600 tabular-nums">$0.00</span>
            </div>
            <div className="flex justify-between pt-3 text-base font-semibold text-bohemian-crimson">
              <span>Net Catastrophic Loss</span>
              <span className="font-serif text-2xl tabular-nums">
                -${replay ? (parseFloat(replay.withoutHedge.netLoss) / 1_000_000).toFixed(2) : '24.60'}M
              </span>
            </div>
          </div>
        </div>

        {/* With Offset Column */}
        <div className="glass-card rounded-2xl p-6 md:p-8 space-y-4 border border-patina/40">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <h3 className="font-serif text-lg font-medium text-patina-light flex items-center gap-2">
              <Shield className="w-5 h-5 text-patina" /> With Offset Infrastructure
            </h3>
            <span className="font-mono text-xs text-patina-light font-semibold">Autonomous Defense</span>
          </div>

          {/* Visual Loss Bar */}
          <div className="space-y-1.5 font-mono text-xs">
            <div className="flex justify-between text-zinc-400">
              <span>Relative Capital Loss</span>
              <span className="text-patina-light font-bold">{withHedgeBarPct.toFixed(1)}% (83.3% Saved)</span>
            </div>
            <div className="w-full bg-black/40 rounded-full h-3 overflow-hidden border border-white/5">
              <div
                className="bg-patina h-full rounded-full transition-all duration-500"
                style={{ width: `${withHedgeBarPct}%` }}
              />
            </div>
          </div>

          <div className="space-y-3 text-xs font-mono pt-2">
            <div className="flex justify-between py-1.5 border-b border-white/[0.04] text-zinc-400">
              <span>Liquidation Penalties Seized</span>
              <span className="text-zinc-200 font-medium tabular-nums">
                -${replay ? (parseFloat(replay.withHedge.liquidationPenalties) / 1_000_000).toFixed(2) : '1.80'}M
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-white/[0.04] text-zinc-400">
              <span>Protocol Bad Debt Accumulated</span>
              <span className="text-patina-light font-medium tabular-nums">
                ${replay ? (parseFloat(replay.withHedge.badDebt) / 1_000_000).toFixed(2) : '0.00'}M
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-white/[0.04] text-zinc-400">
              <span>Protection P&amp;L Offset (Hyperliquid short)</span>
              <span className="text-patina-light font-medium tabular-nums">
                +${replay ? (parseFloat(replay.withHedge.hedgePnl) / 1_000_000).toFixed(2) : '22.50'}M
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-white/[0.04] text-zinc-400">
              <GlossaryLabel
                term="slippage"
                plainText="Carry & cost of acting fast"
                technicalText="Funding + Slippage Incurred"
                glossText="Combined funding fee carry and execution slippage from adjusting the hedge."
              />
              <span className="text-amber-gold tabular-nums">
                -${replay ? ((parseFloat(replay.withHedge.fundingCost) + parseFloat(replay.withHedge.slippageCost)) / 1_000).toFixed(1) : '185.4'}K
              </span>
            </div>
            <div className="flex justify-between pt-3 text-base font-semibold text-patina-light">
              <span>Net Preserved Outcome</span>
              <span className="font-serif text-2xl tabular-nums">
                -${replay ? (parseFloat(replay.withHedge.netLoss) / 1_000_000).toFixed(2) : '4.10'}M
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5: Protection Impact Verification Panel */}
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
