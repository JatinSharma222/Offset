import React, { useMemo, useState, useEffect } from 'react';
import { useQuery, useSubscription, useMutation } from '@apollo/client';
import {
  GET_CURRENT_SNAPSHOT,
  GET_SNAPSHOTS,
  GET_EXECUTIONS,
  GET_ONCHAIN_OBLIGATION,
  SNAPSHOT_STREAM,
  SET_SIMULATED_PRICE,
  SIMULATE_PRICE_SHOCK,
  RESET_SIMULATED_PRICE,
  TRIGGER_SAFETY_REFUSAL,
  SET_OBLIGATION_PARAMETERS,
} from '../graphql/operations';
import { StatCard } from '../components/StatCard';
import { RiskBadge } from '../components/RiskBadge';
import { PriceChart } from '../components/PriceChart';
import { RiskEnginePanel } from '../components/RiskEnginePanel';
import { EventFeed, EventItem } from '../components/EventFeed';
import { GlossaryLabel } from '../components/GlossaryLabel';
import { RiskLevel } from '../theme/risk';
import {
  Zap,
  RotateCcw,
  TrendingDown,
  ShieldAlert,
  Sliders,
  ChevronDown,
  ChevronUp,
  Shield,
  Layers,
} from 'lucide-react';

interface ChartPoint {
  time: number;
  value: number;
}

export const DashboardScreen: React.FC = () => {
  // Plain view is the default per 12-UI-REVAMP.md
  const [showTechnical, setShowTechnical] = useState(false);
  const [customPriceInput, setCustomPriceInput] = useState('');
  const [liveChartPoints, setLiveChartPoints] = useState<ChartPoint[]>([]);

  // Protocol Scenario State
  const [selectedProtocol, setSelectedProtocol] = useState<'kamino' | 'solend' | 'solend-whale' | 'custom'>('kamino');
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customCollateral, setCustomCollateral] = useState('50000');
  const [customDebt, setCustomDebt] = useState('6500000');
  const [customLt, setCustomLt] = useState('80');

  // Query initial snapshot & poll
  const { data: snapshotData, refetch: refetchCurrent } = useQuery(GET_CURRENT_SNAPSHOT, {
    pollInterval: 3000,
  });

  // Query historical snapshots from Postgres
  const { data: snapshotsData } = useQuery(GET_SNAPSHOTS, {
    variables: { limit: 100 },
    pollInterval: 10000,
  });

  // Query on-chain Solana obligation data
  const { data: obligationData, refetch: refetchObligation } = useQuery(GET_ONCHAIN_OBLIGATION, {
    pollInterval: 10000,
  });

  // Subscribe to live websocket stream
  const { data: streamData } = useSubscription(SNAPSHOT_STREAM);

  // Query recent execution records for the event feed
  const { data: executionsData, refetch: refetchExecutions } = useQuery(GET_EXECUTIONS, {
    variables: { limit: 5 },
    pollInterval: 3000,
  });

  // Simulation mutations
  const [setSimPriceMutation, { loading: settingPrice }] = useMutation(SET_SIMULATED_PRICE, {
    onCompleted: () => {
      refetchCurrent();
      refetchExecutions();
    },
  });

  const [shockMutation, { loading: shocking }] = useMutation(SIMULATE_PRICE_SHOCK, {
    onCompleted: () => {
      refetchCurrent();
      refetchExecutions();
    },
  });

  const [resetMutation, { loading: resetting }] = useMutation(RESET_SIMULATED_PRICE, {
    onCompleted: () => {
      refetchCurrent();
      refetchExecutions();
    },
  });

  const [triggerRefusalMutation, { loading: triggeringRefusal }] = useMutation(TRIGGER_SAFETY_REFUSAL, {
    onCompleted: () => {
      refetchExecutions();
    },
  });

  const [setObligationParamsMutation, { loading: updatingObligation }] = useMutation(
    SET_OBLIGATION_PARAMETERS,
    {
      onCompleted: () => {
        refetchCurrent();
        refetchObligation();
        refetchExecutions();
      },
    }
  );

  const snap = streamData?.snapshotStream || snapshotData?.currentSnapshot;

  const riskLevel: RiskLevel = snap?.riskLevel || 'HEALTHY';
  const price = snap ? parseFloat(snap.price) : 184.2;
  const liqPrice = snap?.liquidationPrice ? parseFloat(snap.liquidationPrice) : 172.5;
  const distance = snap?.liquidationDistance
    ? parseFloat(snap.liquidationDistance)
    : (price - liqPrice) / price;
  const healthFactor = snap?.healthFactor ? parseFloat(snap.healthFactor) : 1.068;
  const exposure = snap?.exposure ? parseFloat(snap.exposure) : 10_000_000;
  const hedgeRatio = snap?.hedgeRatio ? parseFloat(snap.hedgeRatio) : 0.5;
  const targetHedge = snap?.targetHedge ? parseFloat(snap.targetHedge) : exposure * hedgeRatio;
  const currentHedge = targetHedge;
  const netExposure = Math.max(0, exposure - currentHedge);
  const distancePct = (distance * 100).toFixed(1);

  // Sync historical snapshots into liveChartPoints
  useEffect(() => {
    if (snapshotsData?.snapshots && snapshotsData.snapshots.length > 0) {
      const historical: ChartPoint[] = snapshotsData.snapshots.map((s: any) => ({
        time: Math.floor(new Date(s.timestamp).getTime() / 1000),
        value: parseFloat(s.price),
      }));
      setLiveChartPoints(historical);
    }
  }, [snapshotsData]);

  // Append incoming stream ticks to chart
  useEffect(() => {
    if (streamData?.snapshotStream) {
      const newPoint: ChartPoint = {
        time: Math.floor(new Date(streamData.snapshotStream.timestamp).getTime() / 1000),
        value: parseFloat(streamData.snapshotStream.price),
      };
      setLiveChartPoints((prev) => {
        if (prev.some((p) => p.time === newPoint.time)) return prev;
        return [...prev, newPoint].slice(-150);
      });
    }
  }, [streamData]);

  // Combined chart data fallback if no points yet
  const chartData = useMemo(() => {
    if (liveChartPoints.length > 0) {
      return liveChartPoints;
    }
    const nowSecs = Math.floor(Date.now() / 1000);
    return [
      { time: nowSecs - 21600, value: price * 1.15 },
      { time: nowSecs - 18000, value: price * 1.12 },
      { time: nowSecs - 14400, value: price * 1.08 },
      { time: nowSecs - 10800, value: price * 1.05 },
      { time: nowSecs - 7200, value: price * 1.02 },
      { time: nowSecs - 3600, value: price * 1.01 },
      { time: nowSecs, value: price },
    ];
  }, [liveChartPoints, price]);

  // Plain language headline and narrative sentence generated from RiskSnapshot
  const narrative = useMemo(() => {
    const hedgeFormatted = `$${(currentHedge / 1_000_000).toFixed(1)}M`;

    switch (riskLevel) {
      case 'CRITICAL':
        return {
          headline: `Your collateral is critically close to trouble — ${distancePct}% away.`,
          subtext: `We've scaled protection to ${hedgeFormatted} to prevent catastrophic liquidation loss.`,
          colorClass: 'text-risk-critical',
        };
      case 'DANGER':
        return {
          headline: `Your collateral is in danger — ${distancePct}% away from trouble.`,
          subtext: `We've opened a ${hedgeFormatted} protective position to soften the impact if prices keep falling.`,
          colorClass: 'text-risk-danger',
        };
      case 'WARNING':
        return {
          headline: `Your collateral is getting risky — ${distancePct}% away from trouble.`,
          subtext: `We've opened a ${hedgeFormatted} protective position to soften the impact if prices keep falling.`,
          colorClass: 'text-risk-warning',
        };
      case 'HEALTHY':
      default:
        return {
          headline: `Your collateral is ${distancePct}% away from trouble.`,
          subtext:
            currentHedge > 0
              ? `We've opened a ${hedgeFormatted} protective position to soften the impact if prices keep falling.`
              : `No protection needed right now. An automated hedge will open if prices drop near trouble.`,
          colorClass: 'text-text-primary',
        };
    }
  }, [riskLevel, distancePct, currentHedge]);

  // Derive recent activity from executions and live state
  const recentEvents: EventItem[] = useMemo(() => {
    const events: EventItem[] = [];

    if (executionsData?.executions && executionsData.executions.length > 0) {
      for (const exec of executionsData.executions) {
        const timeStr = new Date(exec.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        events.push({
          time: timeStr,
          type: 'EXECUTION',
          message: `${exec.riskLevel} → Protection adjusted to $${(parseFloat(exec.targetNotional) / 1_000_000).toFixed(2)}M (${exec.status})`,
          highlight: exec.status === 'FILLED' || exec.status === 'Filled',
        });
      }
    } else {
      events.push(
        {
          time: '14:32',
          type: 'EXECUTION',
          message: `${riskLevel} triggered → Protection target $${(targetHedge / 1_000_000).toFixed(2)}M SOL-PERP`,
          highlight: true,
        },
        {
          time: '14:19',
          type: 'RISK',
          message: `How close to trouble: ${(distance * 100).toFixed(1)}%`,
          highlight: distance <= 0.15,
        },
        {
          time: '13:58',
          type: 'STATUS',
          message: `Safety margin evaluated: ${healthFactor.toFixed(3)}`,
        },
        {
          time: '13:00',
          type: 'ORCHESTRATION',
          message: 'Monitoring Solana collateral position',
        }
      );
    }
    return events;
  }, [executionsData, riskLevel, targetHedge, distance, healthFactor]);

  const handleShock = async (dropPct: number) => {
    try {
      await shockMutation({ variables: { dropPercentage: dropPct.toString() } });
    } catch (e) {
      console.error('Failed to trigger price shock:', e);
    }
  };

  const handleSetCustomPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(customPriceInput);
    if (isNaN(parsed) || parsed <= 0) return;
    try {
      await setSimPriceMutation({ variables: { price: parsed.toString() } });
      setCustomPriceInput('');
    } catch (err) {
      console.error('Failed to set custom price:', err);
    }
  };

  const handleResetPrice = async () => {
    try {
      await resetMutation();
    } catch (e) {
      console.error('Failed to reset price to oracle:', e);
    }
  };

  const handleTriggerRefusal = async () => {
    try {
      await triggerRefusalMutation({
        variables: { checkType: 'max_single_order' },
      });
    } catch (e) {
      console.error('Failed to trigger safety refusal:', e);
    }
  };

  const handleSelectProtocol = async (proto: 'kamino' | 'solend' | 'solend-whale') => {
    setSelectedProtocol(proto);
    try {
      await setObligationParamsMutation({
        variables: {
          input: { protocol: proto },
        },
      });
    } catch (e) {
      console.error('Failed to switch obligation scenario:', e);
    }
  };

  const handleApplyCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    const colAmt = parseFloat(customCollateral);
    const debtAmt = parseFloat(customDebt);
    const ltPct = parseFloat(customLt);
    if (isNaN(colAmt) || isNaN(debtAmt) || isNaN(ltPct)) return;

    setSelectedProtocol('custom');
    try {
      await setObligationParamsMutation({
        variables: {
          input: {
            protocol: 'custom',
            collateralAmount: colAmt.toString(),
            debtAmount: debtAmt.toString(),
            liquidationThreshold: (ltPct / 100).toString(),
          },
        },
      });
    } catch (e) {
      console.error('Failed to apply custom obligation parameters:', e);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Controls: On-Chain Banner, Stress-Test Toolbar, and Plain/Technical Toggle */}
      <div className="space-y-3">
        {/* On-Chain Status Bar */}
        <div className="bg-surface-1 border border-surface-2 rounded-lg px-4 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-risk-healthy font-semibold">
              <span className="w-2 h-2 rounded-full bg-risk-healthy animate-pulse" />
              ON-CHAIN SOLANA INGESTION
            </div>
            <span className="text-surface-2">|</span>
            <span className="text-text-muted">
              Obligation: <span className="text-text-primary">{obligationData?.obligation?.pubkey?.slice(0, 8)}...{obligationData?.obligation?.pubkey?.slice(-4)}</span>
            </span>
            <span className="text-surface-2">|</span>
            <span className="text-text-muted">
              Market: <span className="text-brand">{obligationData?.obligation?.lendingMarket || 'Kamino Lending Vault'}</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-text-muted">View:</span>
              <div className="inline-flex rounded border border-surface-2 bg-surface-0 p-0.5">
                <button
                  onClick={() => setShowTechnical(false)}
                  className={`px-3 py-1 rounded text-xs font-semibold uppercase tracking-wider transition-colors ${
                    !showTechnical
                      ? 'bg-brand text-white shadow-sm'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Plain
                </button>
                <button
                  onClick={() => setShowTechnical(true)}
                  className={`px-3 py-1 rounded text-xs font-semibold uppercase tracking-wider transition-colors ${
                    showTechnical
                      ? 'bg-brand text-white shadow-sm'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Technical
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Market Stress-Test Driver */}
        <div className="bg-surface-1 border border-surface-2 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 text-text-muted font-bold">
            <Zap className="w-4 h-4 text-risk-warning" />
            <span>MARKET STRESS-TEST DRIVER:</span>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={() => handleShock(10)}
              disabled={shocking}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-risk-warning border border-amber-500/30 font-semibold transition-colors disabled:opacity-50"
            >
              <TrendingDown className="w-3.5 h-3.5" />
              -10% (Warning)
            </button>

            <button
              onClick={() => handleShock(20)}
              disabled={shocking}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-orange-500/10 hover:bg-orange-500/20 text-risk-danger border border-orange-500/30 font-semibold transition-colors disabled:opacity-50"
            >
              <TrendingDown className="w-3.5 h-3.5" />
              -20% (Danger)
            </button>

            <button
              onClick={() => handleShock(35)}
              disabled={shocking}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-risk-critical border border-red-500/30 font-bold transition-colors disabled:opacity-50"
            >
              <TrendingDown className="w-3.5 h-3.5" />
              -35% (Critical Cliff)
            </button>

            <form onSubmit={handleSetCustomPrice} className="flex items-center gap-1">
              <input
                type="number"
                step="0.01"
                placeholder="$ Price"
                value={customPriceInput}
                onChange={(e) => setCustomPriceInput(e.target.value)}
                className="w-20 px-2 py-1 bg-surface-2 border border-surface-2 rounded text-text-primary text-xs font-mono focus:outline-none focus:border-brand"
              />
              <button
                type="submit"
                disabled={settingPrice || !customPriceInput}
                className="px-2 py-1 rounded bg-surface-2 hover:bg-surface-2/80 text-text-primary border border-surface-2 font-semibold transition-colors disabled:opacity-50"
              >
                Set
              </button>
            </form>

            <button
              onClick={handleResetPrice}
              disabled={resetting}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-2 hover:bg-surface-2/80 text-text-muted hover:text-text-primary border border-surface-2 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Oracle
            </button>

            <button
              onClick={handleTriggerRefusal}
              disabled={triggeringRefusal}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold transition-colors disabled:opacity-50"
              title="Deliberately trigger a pre-trade safety limit refusal"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Safety Refusal
            </button>
          </div>
        </div>
      </div>

      {/* TOP-TO-BOTTOM NARRATIVE: HERO NARRATIVE SECTION */}
      <section className="bg-surface-1 border border-surface-2 rounded-xl p-8 space-y-6 text-left">
        {/* Hero Visual Slot (collateral metaphor, prepared for three.js in Phase 4) */}
        <div className="w-full bg-surface-0 border border-surface-2 rounded-lg p-6 flex flex-col items-center justify-center relative overflow-hidden min-h-[160px]">
          <div className="absolute inset-0 bg-gradient-to-b from-brand/5 via-transparent to-transparent pointer-events-none" />

          {/* Static Visual Representation of the Collateral & Catching Plane Metaphor */}
          <div className="w-full max-w-md flex flex-col items-center gap-3">
            <div className="flex items-center justify-between w-full text-xs font-mono text-text-muted px-2">
              <span className="flex items-center gap-1.5 text-text-primary font-semibold">
                <Layers className="w-4 h-4 text-brand" />
                Collateral Form ({obligationData?.obligation?.lendingMarket || 'Kamino Vault'})
              </span>
              <RiskBadge level={riskLevel} />
            </div>

            {/* Visual Gap Indicator */}
            <div className="w-full h-16 bg-surface-1 border border-surface-2 rounded relative flex items-center justify-center p-2">
              <div
                className="absolute left-4 right-4 h-1.5 rounded transition-all duration-500"
                style={{
                  backgroundColor: riskLevel === 'HEALTHY' ? '#4ADE80' : riskLevel === 'WARNING' ? '#F5B942' : riskLevel === 'DANGER' ? '#F5793A' : '#F0473E',
                  bottom: `${Math.min(Math.max(distance * 100, 15), 75)}%`,
                }}
              />
              {currentHedge > 0 && (
                <div
                  className="absolute left-2 right-2 h-1 bg-brand rounded shadow-[0_0_8px_rgba(62,124,177,0.5)] transition-all duration-500"
                  style={{
                    bottom: `${Math.max(Math.min(distance * 100 - 8, 55), 10)}%`,
                  }}
                  title="Protective Hedge Plane"
                />
              )}
              <span className="text-[11px] font-mono text-text-muted z-10 bg-surface-1/90 px-2.5 py-0.5 rounded border border-surface-2">
                Distance to trouble: <span className="font-bold text-text-primary">{distancePct}%</span>
                {currentHedge > 0 && <span className="text-brand font-semibold"> · Hedge cushion active</span>}
              </span>
            </div>

            <div className="w-full flex justify-between text-[11px] font-mono text-text-muted px-2 border-t border-surface-2 pt-1">
              <span>SOL Price: ${price.toFixed(2)}</span>
              <span className="text-risk-critical">The danger line: ${liqPrice.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Narrative Headline in Fraunces & Plain Explanation */}
        <div className="space-y-3">
          <h1 className={`font-fraunces text-3xl sm:text-4xl lg:text-5xl font-normal tracking-tight leading-tight ${narrative.colorClass}`}>
            &ldquo;{narrative.headline}&rdquo;
          </h1>
          <p className="text-base sm:text-lg text-text-muted leading-relaxed max-w-3xl">
            {narrative.subtext}
          </p>
        </div>

        {/* Disclosure Toggle */}
        <div className="pt-2">
          <button
            onClick={() => setShowTechnical(!showTechnical)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-surface-2 hover:bg-surface-2/80 border border-surface-2 text-sm text-text-primary transition-colors"
          >
            <span>{showTechnical ? 'Hide technical detail' : 'See technical detail'}</span>
            {showTechnical ? (
              <ChevronUp className="w-4 h-4 text-brand" />
            ) : (
              <ChevronDown className="w-4 h-4 text-brand" />
            )}
          </button>
        </div>
      </section>

      {/* DISCLOSED PROGRESSIVELY: TECHNICAL DETAIL TIER */}
      {showTechnical && (
        <section className="space-y-6 pt-2 border-t border-surface-2 animate-fadeIn">
          {/* Scenario-Specific Parameter Customizer */}
          <div className="bg-surface-1 border border-surface-2 rounded-lg p-3.5 space-y-3 text-xs font-mono">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-text-primary font-bold">
                <Sliders className="w-4 h-4 text-brand" />
                <span>SOLANA OBLIGATION SCENARIO:</span>
              </div>

              <div className="flex items-center flex-wrap gap-2">
                <button
                  onClick={() => handleSelectProtocol('kamino')}
                  disabled={updatingObligation}
                  className={`px-3 py-1.5 rounded border transition-colors font-semibold flex items-center gap-1.5 ${
                    selectedProtocol === 'kamino'
                      ? 'bg-brand text-white border-brand shadow-sm'
                      : 'bg-surface-2 text-text-muted border-surface-2 hover:text-text-primary'
                  }`}
                >
                  <span>Kamino Vault</span>
                  <span className="text-[10px] opacity-75">(50k SOL · $6.5M · Cliff $162.50)</span>
                </button>

                <button
                  onClick={() => handleSelectProtocol('solend')}
                  disabled={updatingObligation}
                  className={`px-3 py-1.5 rounded border transition-colors font-semibold flex items-center gap-1.5 ${
                    selectedProtocol === 'solend'
                      ? 'bg-brand text-white border-brand shadow-sm'
                      : 'bg-surface-2 text-text-muted border-surface-2 hover:text-text-primary'
                  }`}
                >
                  <span>Save / Solend</span>
                  <span className="text-[10px] opacity-75">(100k SOL · $14M · Cliff $175.00)</span>
                </button>

                <button
                  onClick={() => handleSelectProtocol('solend-whale')}
                  disabled={updatingObligation}
                  className={`px-3 py-1.5 rounded border transition-colors font-semibold flex items-center gap-1.5 ${
                    selectedProtocol === 'solend-whale'
                      ? 'bg-brand text-white border-brand shadow-sm'
                      : 'bg-surface-2 text-text-muted border-surface-2 hover:text-text-primary'
                  }`}
                >
                  <span>Solend Whale</span>
                  <span className="text-[10px] opacity-75">(5.7M SOL · $108M)</span>
                </button>

                <button
                  onClick={() => setShowCustomForm(!showCustomForm)}
                  className={`px-3 py-1.5 rounded border transition-colors font-semibold ${
                    showCustomForm || selectedProtocol === 'custom'
                      ? 'bg-surface-2 text-brand border-brand/50'
                      : 'bg-surface-2 text-text-muted border-surface-2 hover:text-text-primary'
                  }`}
                >
                  Custom Params {showCustomForm ? '▲' : '▼'}
                </button>
              </div>
            </div>

            {/* Expandable Custom Parameter Form */}
            {showCustomForm && (
              <form onSubmit={handleApplyCustom} className="pt-3 border-t border-surface-2 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-text-muted">Collateral:</span>
                  <input
                    type="number"
                    value={customCollateral}
                    onChange={(e) => setCustomCollateral(e.target.value)}
                    placeholder="SOL Amount"
                    className="w-28 px-2.5 py-1 bg-surface-2 text-text-primary border border-surface-2 rounded focus:outline-none focus:border-brand"
                  />
                  <span className="text-text-muted">SOL</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-text-muted">Debt:</span>
                  <input
                    type="number"
                    value={customDebt}
                    onChange={(e) => setCustomDebt(e.target.value)}
                    placeholder="USDC Debt"
                    className="w-32 px-2.5 py-1 bg-surface-2 text-text-primary border border-surface-2 rounded focus:outline-none focus:border-brand"
                  />
                  <span className="text-text-muted">USDC</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-text-muted">LT:</span>
                  <input
                    type="number"
                    step="1"
                    min="10"
                    max="95"
                    value={customLt}
                    onChange={(e) => setCustomLt(e.target.value)}
                    className="w-16 px-2.5 py-1 bg-surface-2 text-text-primary border border-surface-2 rounded focus:outline-none focus:border-brand"
                  />
                  <span className="text-text-muted">%</span>
                </div>

                <button
                  type="submit"
                  disabled={updatingObligation}
                  className="px-3.5 py-1 bg-brand hover:bg-brand-hover disabled:opacity-50 text-white font-semibold rounded transition-colors"
                >
                  Apply Custom Obligation
                </button>
              </form>
            )}
          </div>

          {/* 4 Stat Cards with Glossary Labels */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard
              label={<GlossaryLabel term="riskLevel" />}
              value={<RiskBadge level={riskLevel} className="text-sm py-1 px-3" />}
              subtitle={
                <span>
                  <GlossaryLabel term="liquidationDistance" plainText="How close to trouble" />: {distancePct}%
                </span>
              }
              change={riskLevel !== 'HEALTHY' ? 'Escalating' : 'Nominal'}
            />

            <StatCard
              label="Collateral Exposure"
              value={`$${(exposure / 1_000_000).toFixed(2)}M`}
              subtitle="SOL collateral"
              change="Long"
            />

            <StatCard
              label={<GlossaryLabel term="targetHedge" />}
              value={`$${(currentHedge / 1_000_000).toFixed(2)}M`}
              subtitle="SOL-PERP on Hyperliquid"
              change={`Short (${(hedgeRatio * 100).toFixed(0)}%)`}
            />

            <StatCard
              label={<GlossaryLabel term="residualExposure" />}
              value={`$${(netExposure / 1_000_000).toFixed(2)}M`}
              subtitle="Unprotected exposure"
              change={`${((1 - hedgeRatio) * 100).toFixed(0)}% exposed`}
            />
          </div>

          {/* Risk Engine Diagnostics & Event Feed Split */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RiskEnginePanel
              price={price}
              liquidationPrice={liqPrice}
              distance={distance}
              healthFactor={healthFactor}
              recommendedHedge={targetHedge}
              currentHedge={currentHedge}
              level={riskLevel}
            />

            <EventFeed events={recentEvents} />
          </div>
        </section>
      )}

      {/* MAIN PRICE CHART: SOL COLLATERAL PRICE & THE DANGER LINE */}
      <section className="bg-surface-1 border border-surface-2 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-text-primary">SOL Collateral Price & The Danger Line</h2>
            <p className="text-xs text-text-muted font-mono mt-0.5">
              Automated protection activates before collateral reaches the danger line
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-mono text-risk-healthy bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-risk-healthy animate-pulse" />
              ORCHESTRATION ACTIVE
            </span>
          </div>
        </div>

        <PriceChart
          data={chartData}
          liquidationPrice={liqPrice}
          warningPrice={liqPrice * 1.15}
          dangerPrice={liqPrice * 1.10}
          criticalPrice={liqPrice * 1.05}
          mode={showTechnical ? 'technical' : 'plain'}
          hedgeActive={currentHedge > 0}
        />
      </section>

      {/* PERMANENT CUSTODY REASSURANCE BANNER PER 12-UI-REVAMP.MD */}
      <section className="bg-surface-1 border border-surface-2 rounded-xl p-6 text-center space-y-2">
        <div className="inline-flex items-center justify-center p-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-risk-healthy mb-1">
          <Shield className="w-5 h-5" />
        </div>
        <h3 className="text-base font-bold text-text-primary tracking-tight">
          We never hold your funds.
        </h3>
        <p className="text-sm text-text-primary/90 font-medium">
          We&apos;re only ever allowed to trade — not withdraw.
        </p>
        <p className="text-xs text-text-muted max-w-xl mx-auto leading-relaxed pt-1">
          Your collateral remains secured in Kamino/Solend. Offset operates strictly via restricted delegated trading keys on Hyperliquid L1, making capital withdrawal structurally impossible.
        </p>
      </section>
    </div>
  );
};
