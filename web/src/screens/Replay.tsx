import React, { useState, useEffect } from 'react';
import { Play, RotateCcw, AlertTriangle, ShieldCheck } from 'lucide-react';
import { RiskBadge } from '../components/RiskBadge';
import { ImpactPanel } from '../components/ImpactPanel';
import { RiskLevel } from '../theme/risk';

interface ReplayStep {
  hour: number;
  time: string;
  price: number;
  riskLevel: RiskLevel;
  distance: number;
  targetHedge: number;
  eventText?: string;
  hedgeAction?: string;
}

export const ReplayScreen: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const scenarioData: ReplayStep[] = [
    { hour: 0, time: '2022-05-20 00:00', price: 55, riskLevel: 'HEALTHY', distance: 0.38, targetHedge: 0 },
    { hour: 1, time: '2022-05-20 02:00', price: 52, riskLevel: 'HEALTHY', distance: 0.34, targetHedge: 0 },
    { hour: 2, time: '2022-05-20 04:00', price: 48, riskLevel: 'HEALTHY', distance: 0.28, targetHedge: 0 },
    { hour: 3, time: '2022-05-20 06:00', price: 44, riskLevel: 'HEALTHY', distance: 0.21, targetHedge: 0 },
    { hour: 4, time: '2022-05-20 08:00', price: 41, riskLevel: 'WARNING', distance: 0.15, targetHedge: 25_000_000, eventText: 'WARNING: Distance reached 15.0%', hedgeAction: 'OPENED 25% SHORT ($25M SOL-PERP)' },
    { hour: 5, time: '2022-05-20 10:00', price: 38, riskLevel: 'DANGER', distance: 0.08, targetHedge: 50_000_000, eventText: 'DANGER: Distance reached 8.0%', hedgeAction: 'INCREASED SHORT TO 50% ($50M SOL-PERP)' },
    { hour: 6, time: '2022-05-20 12:00', price: 35, riskLevel: 'CRITICAL', distance: 0.03, targetHedge: 75_000_000, eventText: 'CRITICAL: Distance fell to 3.0%', hedgeAction: 'INCREASED SHORT TO 75% ($75M SOL-PERP)' },
    { hour: 7, time: '2022-05-20 14:00', price: 32, riskLevel: 'CRITICAL', distance: -0.06, targetHedge: 75_000_000, eventText: 'CASCADE HIT: Liquidation boundary breached' },
    { hour: 8, time: '2022-05-20 16:00', price: 28, riskLevel: 'CRITICAL', distance: -0.21, targetHedge: 75_000_000, eventText: 'MARKET GAP: Short gains offset cascade losses' },
    { hour: 9, time: '2022-05-20 18:00', price: 25, riskLevel: 'CRITICAL', distance: -0.36, targetHedge: 75_000_000, eventText: 'RECOVERY: Hedge fully covered protocol deficit' },
  ];

  useEffect(() => {
    let timer: any;
    if (isPlaying) {
      timer = setInterval(() => {
        setCurrentStepIndex((prev) => {
          if (prev < scenarioData.length - 1) {
            return prev + 1;
          } else {
            setIsPlaying(false);
            return prev;
          }
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isPlaying]);

  const current = scenarioData[currentStepIndex];
  const isComplete = currentStepIndex === scenarioData.length - 1;

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentStepIndex(0);
  };

  return (
    <div className="space-y-6">
      {/* Header & Source Note */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[#232733] gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Historical Crash Replay
            </h2>
            <span className="px-2.5 py-0.5 rounded text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 font-mono">
              Solend Whale — May 2022
            </span>
          </div>
          <p className="text-xs text-neutral-400 font-mono mt-1">
            Provenance: Reconstructed from Solend on-chain reserve config (5.7M SOL, $108M USDC debt); hourly SOL price feed.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded transition-colors"
          >
            <Play className="w-4 h-4 fill-white" />
            {isPlaying ? 'Pause' : isComplete ? 'Replay Finished' : 'Play Defense'}
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-3 py-2 bg-[#181b22] hover:bg-[#232733] text-neutral-300 text-sm rounded border border-[#232733] transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>
      </div>

      {/* Animation Status HUD */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-[#12141a] border border-[#232733] p-5 rounded-lg">
        <div>
          <span className="text-xs text-neutral-400 font-mono uppercase">Simulation Time</span>
          <div className="text-lg font-bold font-mono text-white mt-1 tabular-nums">
            {current.time}
          </div>
        </div>

        <div>
          <span className="text-xs text-neutral-400 font-mono uppercase">SOL Price</span>
          <div className="text-lg font-bold font-mono text-white mt-1 tabular-nums">
            ${current.price.toFixed(2)}
          </div>
        </div>

        <div>
          <span className="text-xs text-neutral-400 font-mono uppercase">Risk Tier</span>
          <div className="mt-1">
            <RiskBadge level={current.riskLevel} />
          </div>
        </div>

        <div>
          <span className="text-xs text-neutral-400 font-mono uppercase">Active Hedge Size</span>
          <div className="text-lg font-bold font-mono text-indigo-400 mt-1 tabular-nums">
            ${(current.targetHedge / 1_000_000).toFixed(1)}M
          </div>
        </div>
      </div>

      {/* Realtime Event Callout Banner */}
      {current.eventText && (
        <div className="p-4 rounded-lg border bg-[#151922] border-indigo-800/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <div>
              <div className="text-sm font-bold text-white font-mono">{current.eventText}</div>
              {current.hedgeAction && (
                <div className="text-xs text-emerald-400 font-mono mt-0.5 font-semibold">
                  ⚡ {current.hedgeAction}
                </div>
              )}
            </div>
          </div>
          <span className="text-xs font-mono text-neutral-500">Step {currentStepIndex + 1} / {scenarioData.length}</span>
        </div>
      )}

      {/* Head-to-Head Comparison Card (Shown on completion or ongoing) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Without Hedge Column */}
        <div className="bg-[#12141a] border border-red-900/30 rounded-lg p-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#232733]">
            <h3 className="text-sm font-bold uppercase tracking-wider text-red-400 flex items-center gap-2">
              <span>✕</span> Unprotected (Historical Baseline)
            </h3>
            <span className="text-xs font-mono text-neutral-500">Kamino/Solend default</span>
          </div>

          <div className="mt-4 space-y-3 text-xs font-mono">
            <div className="flex justify-between py-1 border-b border-[#1a1d26] text-neutral-400">
              <span>Liquidation Penalties Seized</span>
              <span className="text-red-400 font-bold tabular-nums">-$8.4M</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1a1d26] text-neutral-400">
              <span>Protocol Bad Debt Accumulated</span>
              <span className="text-red-400 font-bold tabular-nums">-$16.2M</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1a1d26] text-neutral-400">
              <span>Hedge P&L Offset</span>
              <span className="text-neutral-500 tabular-nums">$0.00</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1a1d26] text-neutral-400">
              <span>Funding + Slippage Costs</span>
              <span className="text-neutral-500 tabular-nums">$0.00</span>
            </div>
            <div className="flex justify-between pt-2 text-sm font-bold text-red-400">
              <span>Net Catastrophic Loss</span>
              <span className="tabular-nums">-$24.6M</span>
            </div>
          </div>
        </div>

        {/* With Offset Column */}
        <div className="bg-[#12141a] border border-emerald-900/30 rounded-lg p-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#232733]">
            <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> With Offset Infrastructure
            </h3>
            <span className="text-xs font-mono text-emerald-400/80 font-semibold">Autonomous Defense</span>
          </div>

          <div className="mt-4 space-y-3 text-xs font-mono">
            <div className="flex justify-between py-1 border-b border-[#1a1d26] text-neutral-400">
              <span>Liquidation Penalties Seized</span>
              <span className="text-neutral-300 font-bold tabular-nums">-$1.8M</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1a1d26] text-neutral-400">
              <span>Protocol Bad Debt Accumulated</span>
              <span className="text-emerald-400 font-bold tabular-nums">$0.00</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1a1d26] text-neutral-400">
              <span>Hedge P&L Offset (Hyperliquid Short)</span>
              <span className="text-emerald-400 font-bold tabular-nums">+$22.5M</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1a1d26] text-neutral-400">
              <span>Funding + Slippage Incurred</span>
              <span className="text-amber-400 tabular-nums">-$185.4K</span>
            </div>
            <div className="flex justify-between pt-2 text-sm font-bold text-emerald-400">
              <span>Net Preserved Outcome</span>
              <span className="tabular-nums">-$4.1M</span>
            </div>
          </div>
        </div>
      </div>

      {/* Impact verification banner */}
      <ImpactPanel
        lossAvoided={20_500_000}
        badDebtReductionPct={100}
        liquidationsPrevented={4}
        hedgeCost={185_400}
      />
    </div>
  );
};
