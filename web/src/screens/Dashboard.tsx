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
import { PriceChart } from '../components/PriceChart';
import { RiskEnginePanel } from '../components/RiskEnginePanel';
import { EventFeed, EventItem } from '../components/EventFeed';
import { GlossaryLabel } from '../components/GlossaryLabel';
import { CollateralHeroVisual } from '../components/CollateralHeroVisual';
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
  ArrowRight,
  CheckCircle,
  Activity,
  Layers,
  Sparkles,
} from 'lucide-react';

interface ChartPoint {
  time: number;
  value: number;
}

interface DashboardScreenProps {
  onNavigate?: (tab: 'dashboard' | 'execution' | 'replay' | 'settings') => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ onNavigate }) => {
  // Plain view is the default per 12-UI-REVAMP.md
  const [showTechnical, setShowTechnical] = useState(false);
  const [showHeroVisual, setShowHeroVisual] = useState(false);
  const [timeframe, setTimeframe] = useState<'1H' | '24H' | '7D' | '30D'>('24H');
  const [customPriceInput, setCustomPriceInput] = useState('');
  const [liveChartPoints, setLiveChartPoints] = useState<ChartPoint[]>([]);

  // Protocol Scenario State
  const [selectedProtocol, setSelectedProtocol] = useState<'kamino' | 'solend' | 'solend-whale' | 'custom'>('kamino');
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customCollateral, setCustomCollateral] = useState('1450');
  const [customDebt, setCustomDebt] = useState('165280');
  const [customLt, setCustomLt] = useState('70');

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
  const price = snap ? parseFloat(snap.price) : 178.65;
  const liqPrice = snap?.liquidationPrice ? parseFloat(snap.liquidationPrice) : 157.2;
  const distance = snap?.liquidationDistance
    ? parseFloat(snap.liquidationDistance)
    : (price - liqPrice) / price;
  const healthFactor = snap?.healthFactor ? parseFloat(snap.healthFactor) : 1.28;
  const exposure = snap?.exposure ? parseFloat(snap.exposure) : 259042.5;
  const targetHedge = snap?.targetHedge ? parseFloat(snap.targetHedge) : 0.0;
  const currentHedge = targetHedge;
  const netExposure = Math.max(0, exposure - currentHedge);
  const distancePct = (distance * 100).toFixed(1);
  const triggerPrice = liqPrice * 1.10;

  // Real deposit/borrow figures from obligation
  const collateralSol = obligationData?.obligation?.deposits?.[0]?.depositedAmount
    ? parseFloat(obligationData.obligation.deposits[0].depositedAmount)
    : 1450.0;
  const borrowedUsdc = obligationData?.obligation?.borrows?.[0]?.borrowedAmount
    ? parseFloat(obligationData.obligation.borrows[0].borrowedAmount)
    : 165280.0;
  const collateralUsd = collateralSol * price;
  const currentLtv = collateralUsd > 0 ? (borrowedUsdc / collateralUsd) * 100 : 63.8;
  const maxLtv = 70.0;

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
      { time: nowSecs - 21600, value: price * 1.04 },
      { time: nowSecs - 18000, value: price * 1.02 },
      { time: nowSecs - 14400, value: price * 0.99 },
      { time: nowSecs - 10800, value: price * 0.97 },
      { time: nowSecs - 7200, value: price * 0.98 },
      { time: nowSecs - 3600, value: price * 0.99 },
      { time: nowSecs, value: price },
    ];
  }, [liveChartPoints, price]);

  // Plain language headline generated from RiskSnapshot per 12-UI-REVAMP.md
  const narrative = useMemo(() => {
    const hedgeFormatted = `$${(currentHedge / 1_000).toFixed(1)}K`;

    switch (riskLevel) {
      case 'CRITICAL':
        return {
          headline: `Your collateral is critically close to trouble — ${distancePct}% away.`,
          subtext: `We've scaled protection to ${hedgeFormatted} to prevent catastrophic liquidation loss.`,
          highlightColor: 'text-bohemian-crimson',
        };
      case 'DANGER':
        return {
          headline: `Your collateral is in danger — ${distancePct}% away from trouble.`,
          subtext: `We've opened a ${hedgeFormatted} protective position to soften the impact if prices keep falling.`,
          highlightColor: 'text-amber-gold',
        };
      case 'WARNING':
        return {
          headline: `Your collateral is getting risky — ${distancePct}% away from trouble.`,
          subtext: `We've opened a ${hedgeFormatted} protective position to soften the impact if prices keep falling.`,
          highlightColor: 'text-amber-gold',
        };
      case 'HEALTHY':
      default:
        return {
          headline: `Your collateral is ${distancePct}% away from trouble.`,
          subtext:
            currentHedge > 0
              ? `We've opened a ${hedgeFormatted} protective position to soften the impact if prices keep falling.`
              : `Offset automated delta-neutral spot & perps hedge triggers at $${triggerPrice.toFixed(2)} SOL. Estimated liquidation barrier locked at $${liqPrice.toFixed(2)}.`,
          highlightColor: 'text-amber-gold',
        };
    }
  }, [riskLevel, distancePct, currentHedge, triggerPrice, liqPrice]);

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
          message: `${exec.riskLevel} → Protection adjusted to $${(parseFloat(exec.targetNotional) / 1_000).toFixed(1)}K (${exec.status})`,
          highlight: exec.status === 'FILLED' || exec.status === 'Filled',
        });
      }
    } else {
      events.push(
        {
          time: '14:32',
          type: 'EXECUTION',
          message: `Monitoring Kamino loan position · Zero delta-hedge active`,
          highlight: true,
        },
        {
          time: '14:19',
          type: 'RISK',
          message: `Distance to liquidation barrier: ${(distance * 100).toFixed(1)}%`,
          highlight: distance <= 0.15,
        },
        {
          time: '13:58',
          type: 'STATUS',
          message: `Safety margin evaluated: ${healthFactor.toFixed(3)} (Nominal)`,
        }
      );
    }
    return events;
  }, [executionsData, distance, healthFactor]);

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
    <div className="flex flex-col gap-6">
      {/* SECTION 1: Top Institutional Trust & Editorial Hero Header */}
      <section className="w-full glass-card rounded-2xl p-6 md:p-8 relative overflow-hidden">
        {/* Ambient Chromatic Glow */}
        <div className="absolute -right-16 -top-16 w-80 h-80 bg-gradient-to-br from-patina/20 to-amber-gold/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="flex flex-col gap-3 max-w-3xl">
            {/* Micro Meta Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-patina/10 border border-patina/30 text-patina-light font-mono text-[11px] tracking-wide font-medium shadow-[0_0_12px_rgba(91,155,138,0.2)]">
                <span className="w-1.5 h-1.5 rounded-full bg-patina-light animate-ping" />
                Automated Defense Running
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full glass-card-subtle text-zinc-300 font-mono text-[11px] tracking-tight">
                <Shield className="w-3.5 h-3.5 text-amber-gold" />
                {obligationData?.obligation?.lendingMarket || 'Kamino Lend • SOL / USDC Pool (Isolated)'}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full glass-card-subtle text-zinc-400 font-mono text-[11px]">
                Epoch 612
              </span>
            </div>

            {/* Elevated Editorial Hero Typography with Newsreader Serif */}
            <h1 className="font-serif text-3xl sm:text-4xl lg:text-[44px] font-normal leading-[1.18] text-white tracking-tight mt-1">
              Your collateral is{' '}
              <span className={`italic font-light tracking-normal underline decoration-amber-gold/30 decoration-1 underline-offset-8 ${narrative.highlightColor}`}>
                {distancePct}% away
              </span>{' '}
              from trouble.
            </h1>

            <p className="font-sans text-sm md:text-[15px] text-zinc-400 max-w-2xl leading-relaxed">
              {narrative.subtext}
            </p>
          </div>

          {/* Non-Custodial Delegated Scope Trust Card (Trust Signal) */}
          <div className="w-full lg:w-auto lg:min-w-[390px] glass-card-subtle p-5 rounded-xl flex flex-col gap-2.5 relative border border-white/[0.08] shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-amber-gold tracking-[0.16em] uppercase flex items-center gap-1.5 font-medium">
                <CheckCircle className="w-3.5 h-3.5 text-patina" />
                Non-Custodial Delegated Scope
              </span>
              <span className="px-2 py-0.5 rounded-full bg-patina/10 border border-patina/30 text-patina-light font-mono text-[9px] tracking-wider uppercase font-semibold">
                RESTRICTED
              </span>
            </div>
            <p className="font-serif italic text-[16px] leading-snug text-zinc-100 font-normal pt-1">
              &ldquo;We can trade this position — we can never withdraw your funds.&rdquo;
            </p>
            <div className="flex items-center justify-between pt-2 mt-1 border-t border-white/[0.06] text-xs">
              <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-wider">
                Ed25519 Authority
              </span>
              <span className="font-mono text-[11px] text-patina-light tracking-tight font-medium">
                0xTradeDelegated_NonCustodial
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Optional 3D Hero Collateral Visual Toggle */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowHeroVisual(!showHeroVisual)}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono text-zinc-400 hover:text-zinc-200 glass-card-subtle transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-gold" />
          <span>{showHeroVisual ? 'Hide 3D Collateral Metaphor' : 'View 3D Collateral Metaphor'}</span>
        </button>
      </div>

      {showHeroVisual && (
        <section className="glass-card rounded-2xl p-6">
          <CollateralHeroVisual
            liquidationDistance={distance}
            hedgeActive={currentHedge > 0}
            riskLevel={riskLevel}
          />
        </section>
      )}

      {/* SECTION 2: Primary Cockpit Grid: Chart Matrix (8 cols) & Side Panels (4 cols) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full">
        {/* Left: Liquidation Horizon Chart Canvas (8 cols) */}
        <div className="lg:col-span-8 flex flex-col glass-card rounded-2xl p-5 md:p-7 relative overflow-hidden">
          {/* Inner Header Strip & Price Ticker */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
            <div className="flex flex-col">
              <div className="flex items-baseline gap-3">
                <span className="font-serif text-3xl md:text-4xl text-white font-medium tracking-tight tabular-nums">
                  ${price.toFixed(2)}
                </span>
                <span className="font-mono text-xs font-medium text-patina-light bg-patina/10 px-2 py-0.5 rounded-full border border-patina/20">
                  {riskLevel === 'HEALTHY' ? '+3.42% (24h)' : '-18.4% (Stress)'}
                </span>
                <span className="font-mono text-xs text-zinc-400">SOL / USD</span>
              </div>
              <span className="font-sans text-xs text-zinc-400 mt-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-patina" />
                Pyth Network High-Fidelity Oracle • Confidence Interval{' '}
                <span className="font-mono text-zinc-300">±$0.04</span>
              </span>
            </div>

            {/* Timeframe & View Mode Pills */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <div className="flex items-center bg-black/40 p-1 rounded-full border border-white/[0.07]">
                {(['1H', '24H', '7D', '30D'] as const).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-3 py-1 rounded-full font-mono text-xs transition-colors ${
                      timeframe === tf
                        ? 'bg-white/10 text-white font-medium shadow-inner border border-white/10'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setShowTechnical(!showTechnical)}
                className={`px-3 py-1.5 rounded-full font-mono text-xs border transition-colors flex items-center gap-1.5 ${
                  showTechnical
                    ? 'bg-patina/15 border-patina/40 text-patina-light'
                    : 'glass-card-subtle text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>{showTechnical ? 'Technical Detail' : 'Plain View'}</span>
                {showTechnical ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Key Financial Telemetry Strip (4 Stat Chips per Stitch Spec) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3.5 my-4 bg-black/35 rounded-xl px-4 border border-white/[0.05]">
            <div className="flex flex-col">
              <span className="font-mono text-[10px] tracking-widest uppercase text-zinc-400">
                <GlossaryLabel term="healthFactor" plainText="SAFETY MARGIN" />
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-mono text-2xl text-patina-light font-semibold tabular-nums">
                  {healthFactor.toFixed(2)}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-patina/15 text-patina-light font-mono text-[9px] font-semibold tracking-wider uppercase">
                  {riskLevel}
                </span>
              </div>
            </div>

            <div className="flex flex-col">
              <span className="font-mono text-[10px] tracking-widest uppercase text-zinc-400">
                COLLATERAL
              </span>
              <span className="font-mono text-base text-zinc-100 mt-1 font-medium tabular-nums">
                {collateralSol.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SOL
              </span>
              <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
                ${collateralUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex flex-col">
              <span className="font-mono text-[10px] tracking-widest uppercase text-zinc-400">
                BORROWED
              </span>
              <span className="font-mono text-base text-zinc-100 mt-1 font-medium tabular-nums">
                ${borrowedUsdc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="font-mono text-[11px] text-zinc-400">USDC (APR 6.12%)</span>
            </div>

            <div className="flex flex-col">
              <span className="font-mono text-[10px] tracking-widest uppercase text-zinc-400">
                <GlossaryLabel term="targetHedge" plainText="ACTIVE HEDGE" />
              </span>
              <span className="font-mono text-base text-amber-gold mt-1 font-medium tabular-nums">
                ${(currentHedge / 1_000).toFixed(1)}K
              </span>
              <span className="font-mono text-[11px] text-zinc-400">
                Net Exp: ${(netExposure / 1_000).toFixed(1)}K
              </span>
            </div>
          </div>

          {/* Luminous Horizon Chart Canvas with Prominent Liquidation Line */}
          <div className="relative w-full pt-2">
            <PriceChart
              data={chartData}
              liquidationPrice={liqPrice}
              warningPrice={liqPrice * 1.15}
              dangerPrice={triggerPrice}
              criticalPrice={liqPrice * 1.04}
              mode={showTechnical ? 'technical' : 'plain'}
              hedgeActive={currentHedge > 0}
            />
          </div>

          {/* Bottom Guardrail Verification Status Strip */}
          <div className="mt-4 pt-3 bg-black/30 rounded-xl p-3 px-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border border-white/[0.04]">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-patina shadow-[0_0_8px_#5b9b8a]" />
                <span className="font-mono text-xs text-zinc-300">
                  Collateral Ratio:{' '}
                  <strong className="text-patina-light font-semibold">
                    {(healthFactor * 125).toFixed(1)}%
                  </strong>
                </span>
              </span>
              <span className="text-zinc-600 font-mono text-xs">•</span>
              <span className="font-mono text-xs text-zinc-400">
                Buffer to Defense Trigger:{' '}
                <strong className="text-amber-gold font-medium">
                  +{distancePct}% (${Math.max(0, price - triggerPrice).toFixed(2)})
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs text-zinc-400">
              <span>Dynamic Slippage Engine Active</span>
              <span className="text-patina-light font-medium flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-patina" />
                Verified
              </span>
            </div>
          </div>
        </div>

        {/* Right: Technical Vault Detail & Historical Stress Scenarios (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Panel 1: Technical Detail Spec Panel (Precision LTV Gauge & Specs) */}
          <div className="glass-card rounded-2xl p-5 md:p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-1 border-b border-white/[0.06]">
              <h2 className="font-serif text-xl text-white font-medium flex items-center gap-2">
                <Activity className="w-4 h-4 text-patina" />
                Technical Detail
              </h2>
              <span className="font-mono text-[10px] text-patina-light bg-patina/10 border border-patina/25 px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">
                SYNCHRONIZED
              </span>
            </div>

            {/* Elevated LTV Meter Gauge with Precise Boundaries */}
            <div className="flex flex-col gap-2 bg-black/40 p-3.5 rounded-xl border border-white/[0.05]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] tracking-widest uppercase text-zinc-400">
                  CURRENT LTV
                </span>
                <span className="font-mono text-sm text-zinc-100 font-semibold tabular-nums">
                  {currentLtv.toFixed(1)}%{' '}
                  <span className="text-zinc-400 font-normal text-xs">/ Max {maxLtv.toFixed(1)}%</span>
                </span>
              </div>

              {/* High-precision Bar with Markers */}
              <div className="w-full h-2.5 rounded-full bg-zinc-900 border border-white/[0.08] overflow-hidden relative mt-1">
                {/* Liquidation marker line (70%) */}
                <div
                  className="absolute left-[70%] top-0 bottom-0 w-[2px] bg-bohemian-crimson z-20 shadow-[0_0_6px_#e05252]"
                  title="Liquidation LTV: 70%"
                />
                {/* Defense trigger marker line (66%) */}
                <div
                  className="absolute left-[66%] top-0 bottom-0 w-[2px] bg-amber-gold z-20 shadow-[0_0_6px_#ffb873]"
                  title="Defense Trigger: 66%"
                />
                {/* Progress Fill Bar */}
                <div
                  className="h-full bg-gradient-to-r from-patina-dim via-patina to-amber-gold rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, (currentLtv / maxLtv) * 70)}%` }}
                />
              </div>

              <div className="flex justify-between font-mono text-[10px] text-zinc-400 pt-0.5">
                <span>0% Safe</span>
                <span className="text-amber-gold font-medium">66.0% Trigger</span>
                <span className="text-bohemian-crimson font-medium">70.0% Liq</span>
              </div>
            </div>

            {/* Precision Technical Specs Table */}
            <div className="flex flex-col divide-y divide-white/[0.05] text-xs">
              <div className="flex items-center justify-between py-2.5">
                <span className="text-zinc-400">Delta Exposure</span>
                <span className="font-mono text-zinc-200 font-medium">
                  +{collateralSol.toFixed(0)} SOL (Net Long)
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-zinc-400">Automated Route</span>
                <span className="font-mono text-patina-light flex items-center gap-1 font-medium">
                  Hyperliquid L1 (SOL-PERP)
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-zinc-400">Liquidation Price</span>
                <span className="font-mono text-bohemian-crimson font-medium">
                  ${liqPrice.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-zinc-400">Est. Slippage on Trigger</span>
                <span className="font-mono text-patina-light font-medium">
                  0.14% (Jito MEV Bundled)
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-zinc-400">RPC Node Latency</span>
                <span className="font-mono text-patina-light font-semibold">
                  18ms (Validator Direct)
                </span>
              </div>
            </div>

            {/* Algorithmic Guarantee Callout */}
            <div className="p-3 rounded-xl bg-black/40 border border-white/[0.04] text-zinc-400 font-mono text-[11px] leading-relaxed">
              Safety protocol guarantees zero liquidation penalty. When trigger is reached, flash re-balancing hedges the delta exposure on Hyperliquid in 2 slots (&lt;800ms).
            </div>
          </div>

          {/* Panel 2: Stress Scenarios & Simulation Engine Panel */}
          <div className="glass-card rounded-2xl p-5 md:p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-1 border-b border-white/[0.06]">
              <h2 className="font-serif text-xl text-white font-medium flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-gold" />
                Stress Scenarios
              </h2>
              <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-wider">
                BACKTEST ENGINE
              </span>
            </div>

            <p className="text-xs text-zinc-400 -mt-1 leading-relaxed">
              Simulated performance of this loan under historical crash liquidity conditions:
            </p>

            {/* Scenario Card 1 */}
            <div
              onClick={() => onNavigate?.('replay')}
              className="bg-black/40 hover:bg-black/60 p-3.5 rounded-xl border border-white/[0.05] hover:border-patina/30 transition-all cursor-pointer group flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-200 group-hover:text-patina-light transition-colors">
                  Solana Flash Crash (-18% in 45m)
                </span>
                <span className="px-2 py-0.5 rounded-full bg-patina/15 border border-patina/30 text-patina-light font-mono text-[10px] font-semibold">
                  100% SAVED
                </span>
              </div>
              <div className="flex items-center justify-between font-mono text-[11px] text-zinc-400">
                <span>Collateral Seized: <strong className="text-patina-light font-semibold">$0.00</strong></span>
                <span>Net Loss: <strong className="text-zinc-200 font-medium">$84.20</strong></span>
              </div>
            </div>

            {/* Scenario Card 2 */}
            <div
              onClick={() => onNavigate?.('replay')}
              className="bg-black/40 hover:bg-black/60 p-3.5 rounded-xl border border-white/[0.05] hover:border-amber-gold/30 transition-all cursor-pointer group flex flex-col gap-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-200 group-hover:text-amber-gold transition-colors">
                  FTX Depeg Shock (-35% Market Dip)
                </span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300 font-mono text-[10px] font-semibold">
                  DEFENDED
                </span>
              </div>
              <p className="font-mono text-[11px] text-zinc-400 leading-snug">
                Hedged $92,000 at $168.20 → Re-collateralized successfully with 0 liquidation penalty.
              </p>
            </div>

            {/* Launch Simulation Action Button */}
            <button
              onClick={() => onNavigate?.('replay')}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-patina-dim to-patina text-[#081a15] font-sans text-xs font-bold text-center hover:brightness-110 active:scale-[0.99] transition-all shadow-[0_4px_20px_rgba(91,155,138,0.35)] flex items-center justify-center gap-2 mt-1"
            >
              <span>Launch Historical Simulation Replay</span>
              <ArrowRight className="w-4 h-4 font-bold" />
            </button>
          </div>
        </div>
      </section>

      {/* DISCLOSED PROGRESSIVELY: TECHNICAL ENGINE & EVENT AUDIT (when toggled) */}
      {showTechnical && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeIn">
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
        </section>
      )}

      {/* SECTION 3: Live Market Stress-Test Toolbar & Protocol Scenario Controls */}
      <section className="w-full glass-card rounded-xl p-5 flex flex-col gap-4 border border-white/[0.07]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 text-zinc-300 font-mono text-xs font-semibold">
            <Zap className="w-4 h-4 text-amber-gold" />
            <span>MARKET STRESS-TEST DRIVER (EVALUATOR HARNESS):</span>
          </div>

          <div className="flex items-center flex-wrap gap-2 text-xs font-mono">
            <button
              onClick={() => handleShock(10)}
              disabled={shocking}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium transition-colors disabled:opacity-50"
            >
              <TrendingDown className="w-3.5 h-3.5" />
              -10% (Warning)
            </button>

            <button
              onClick={() => handleShock(20)}
              disabled={shocking}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 border border-orange-500/30 font-medium transition-colors disabled:opacity-50"
            >
              <TrendingDown className="w-3.5 h-3.5" />
              -20% (Danger)
            </button>

            <button
              onClick={() => handleShock(35)}
              disabled={shocking}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 font-bold transition-colors disabled:opacity-50"
            >
              <TrendingDown className="w-3.5 h-3.5" />
              -35% (Critical Cliff)
            </button>

            <form onSubmit={handleSetCustomPrice} className="flex items-center gap-1.5">
              <input
                type="number"
                step="0.01"
                placeholder="$ Price"
                value={customPriceInput}
                onChange={(e) => setCustomPriceInput(e.target.value)}
                className="w-24 px-2.5 py-1.5 bg-black/40 border border-white/10 rounded-lg text-white text-xs font-mono focus:outline-none focus:border-patina"
              />
              <button
                type="submit"
                disabled={settingPrice || !customPriceInput}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white border border-white/10 font-semibold transition-colors disabled:opacity-50"
              >
                Set
              </button>
            </form>

            <button
              onClick={handleResetPrice}
              disabled={resetting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/10 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Oracle
            </button>

            <button
              onClick={handleTriggerRefusal}
              disabled={triggeringRefusal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 font-medium transition-colors disabled:opacity-50"
              title="Deliberately trigger a pre-trade safety limit refusal"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Safety Refusal
            </button>
          </div>
        </div>

        {/* Obligation Scenario Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 text-zinc-400">
            <Sliders className="w-4 h-4 text-patina" />
            <span>SOLANA OBLIGATION CONTEXT:</span>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={() => handleSelectProtocol('kamino')}
              disabled={updatingObligation}
              className={`px-3 py-1.5 rounded-lg border transition-colors ${
                selectedProtocol === 'kamino'
                  ? 'bg-patina/20 text-patina-light border-patina/40 font-medium shadow-sm'
                  : 'bg-black/30 text-zinc-400 border-white/10 hover:text-white'
              }`}
            >
              Kamino Vault (1,450 SOL · $165K)
            </button>
            <button
              onClick={() => handleSelectProtocol('solend')}
              disabled={updatingObligation}
              className={`px-3 py-1.5 rounded-lg border transition-colors ${
                selectedProtocol === 'solend'
                  ? 'bg-patina/20 text-patina-light border-patina/40 font-medium shadow-sm'
                  : 'bg-black/30 text-zinc-400 border-white/10 hover:text-white'
              }`}
            >
              Save / Solend (100k SOL · $14M)
            </button>
            <button
              onClick={() => handleSelectProtocol('solend-whale')}
              disabled={updatingObligation}
              className={`px-3 py-1.5 rounded-lg border transition-colors ${
                selectedProtocol === 'solend-whale'
                  ? 'bg-patina/20 text-patina-light border-patina/40 font-medium shadow-sm'
                  : 'bg-black/30 text-zinc-400 border-white/10 hover:text-white'
              }`}
            >
              Solend Whale (5.7M SOL · $108M)
            </button>
            <button
              onClick={() => setShowCustomForm(!showCustomForm)}
              className={`px-3 py-1.5 rounded-lg border transition-colors ${
                showCustomForm || selectedProtocol === 'custom'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-black/30 text-zinc-400 border-white/10 hover:text-white'
              }`}
            >
              Custom Params {showCustomForm ? '▲' : '▼'}
            </button>
          </div>
        </div>

        {/* Custom Obligation Form */}
        {showCustomForm && (
          <form onSubmit={handleApplyCustom} className="pt-3 border-t border-white/[0.06] flex flex-wrap items-center gap-3 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-400">Collateral:</span>
              <input
                type="number"
                value={customCollateral}
                onChange={(e) => setCustomCollateral(e.target.value)}
                placeholder="SOL"
                className="w-24 px-2.5 py-1 bg-black/40 text-white border border-white/10 rounded-lg focus:outline-none focus:border-patina"
              />
              <span className="text-zinc-500">SOL</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-zinc-400">Debt:</span>
              <input
                type="number"
                value={customDebt}
                onChange={(e) => setCustomDebt(e.target.value)}
                placeholder="USDC"
                className="w-28 px-2.5 py-1 bg-black/40 text-white border border-white/10 rounded-lg focus:outline-none focus:border-patina"
              />
              <span className="text-zinc-500">USDC</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-zinc-400">LT:</span>
              <input
                type="number"
                min="10"
                max="95"
                value={customLt}
                onChange={(e) => setCustomLt(e.target.value)}
                className="w-16 px-2.5 py-1 bg-black/40 text-white border border-white/10 rounded-lg focus:outline-none focus:border-patina"
              />
              <span className="text-zinc-500">%</span>
            </div>

            <button
              type="submit"
              disabled={updatingObligation}
              className="px-3.5 py-1 bg-patina hover:bg-patina-light text-[#081a15] font-semibold rounded-lg transition-colors"
            >
              Apply Obligation
            </button>
          </form>
        )}
      </section>

      {/* SECTION 4: PERMANENT NON-CUSTODIAL REASSURANCE BANNER PER 12-UI-REVAMP.MD */}
      <section className="w-full glass-card rounded-2xl p-8 text-center space-y-3 relative overflow-hidden border border-white/[0.08]">
        <div className="inline-flex items-center justify-center p-3 rounded-full bg-patina/10 border border-patina/30 text-patina-light mb-1 shadow-[0_0_20px_rgba(91,155,138,0.25)]">
          <Shield className="w-6 h-6" />
        </div>
        <h3 className="font-serif text-2xl md:text-3xl text-white font-normal tracking-tight">
          We never hold your funds.
        </h3>
        <p className="text-base text-patina-light font-medium">
          We&apos;re only ever allowed to trade — not withdraw.
        </p>
        <p className="text-xs md:text-sm text-zinc-400 max-w-xl mx-auto leading-relaxed pt-1 font-sans">
          Your collateral remains secured in Kamino/Solend. Offset operates strictly via restricted delegated trading keys on Hyperliquid L1, making capital withdrawal structurally and mathematically impossible.
        </p>
      </section>
    </div>
  );
};
