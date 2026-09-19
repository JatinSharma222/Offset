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
import { RiskLevel } from '../theme/risk';
import { Zap, RotateCcw, TrendingDown, ShieldAlert, Sliders } from 'lucide-react';

interface ChartPoint {
  time: number;
  value: number;
}

export const DashboardScreen: React.FC = () => {
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
  const netExposure = exposure - currentHedge;

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
          message: `${exec.riskLevel} → Hedge adjusted to $${(parseFloat(exec.targetNotional) / 1_000_000).toFixed(2)}M (${exec.status})`,
          highlight: exec.status === 'FILLED' || exec.status === 'Filled',
        });
      }
    } else {
      events.push(
        {
          time: '14:32',
          type: 'EXECUTION',
          message: `${riskLevel} triggered → Hedge target $${(targetHedge / 1_000_000).toFixed(2)}M SOL-PERP`,
          highlight: true,
        },
        {
          time: '14:19',
          type: 'RISK',
          message: `Distance to liquidation boundary: ${(distance * 100).toFixed(1)}%`,
          highlight: distance <= 0.15,
        },
        {
          time: '13:58',
          type: 'STATUS',
          message: `Health factor evaluated: ${healthFactor.toFixed(3)}`,
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
    <div className="space-y-6">
      {/* On-Chain Solana Ingestion & Live Status Banner */}
      <div className="bg-[#12141a] border border-[#232733] rounded-lg px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            ON-CHAIN SOLANA INGESTION
          </div>
          <span className="text-neutral-500">|</span>
          <span className="text-neutral-400">
            Obligation: <span className="text-white">{obligationData?.obligation?.pubkey?.slice(0, 8)}...{obligationData?.obligation?.pubkey?.slice(-4)}</span>
          </span>
          <span className="text-neutral-500">|</span>
          <span className="text-neutral-400">
            Market: <span className="text-indigo-400">{obligationData?.obligation?.lendingMarket || 'Kamino Lending Vault'}</span>
          </span>
        </div>
        <div className="flex items-center gap-4 text-neutral-400">
          <span>
            Deposits: <span className="text-white font-bold">{obligationData?.obligation?.deposits?.[0]?.depositedAmount ? parseFloat(obligationData.obligation.deposits[0].depositedAmount).toLocaleString() : '50,000'} SOL</span> (LT: {obligationData?.obligation?.deposits?.[0]?.liquidationThreshold ? (parseFloat(obligationData.obligation.deposits[0].liquidationThreshold) * 100).toFixed(0) : '80'}%)
          </span>
          <span className="text-neutral-600">•</span>
          <span>
            Debt: <span className="text-white font-bold">${obligationData?.obligation?.borrows?.[0]?.borrowedAmount ? (parseFloat(obligationData.obligation.borrows[0].borrowedAmount) / 1_000_000).toFixed(2) : '6.50'}M USDC</span>
          </span>
          <span className="px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-800/30 text-[10px] uppercase font-bold">
            {obligationData?.obligation?.source || 'Kamino Ingested'}
          </span>
        </div>
      </div>

      {/* Scenario-Specific Parameter Customizer */}
      <div className="bg-[#12141a] border border-[#232733] rounded-lg p-3.5 space-y-3 text-xs font-mono">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-neutral-300 font-bold">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <span>SOLANA OBLIGATION SCENARIO:</span>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={() => handleSelectProtocol('kamino')}
              disabled={updatingObligation}
              className={`px-3 py-1.5 rounded border transition-colors font-semibold flex items-center gap-1.5 ${
                selectedProtocol === 'kamino'
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                  : 'bg-[#181b22] text-neutral-400 border-[#232733] hover:text-white hover:border-[#383f52]'
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
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                  : 'bg-[#181b22] text-neutral-400 border-[#232733] hover:text-white hover:border-[#383f52]'
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
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                  : 'bg-[#181b22] text-neutral-400 border-[#232733] hover:text-white hover:border-[#383f52]'
              }`}
            >
              <span>Solend Whale</span>
              <span className="text-[10px] opacity-75">(5.7M SOL · $108M)</span>
            </button>

            <button
              onClick={() => setShowCustomForm(!showCustomForm)}
              className={`px-3 py-1.5 rounded border transition-colors font-semibold ${
                showCustomForm || selectedProtocol === 'custom'
                  ? 'bg-[#232733] text-indigo-300 border-indigo-500/50'
                  : 'bg-[#181b22] text-neutral-400 border-[#232733] hover:text-white'
              }`}
            >
              Custom Params {showCustomForm ? '▲' : '▼'}
            </button>
          </div>
        </div>

        {/* Expandable Custom Parameter Form */}
        {showCustomForm && (
          <form onSubmit={handleApplyCustom} className="pt-3 border-t border-[#1e222d] flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-neutral-400">Collateral:</span>
              <input
                type="number"
                value={customCollateral}
                onChange={(e) => setCustomCollateral(e.target.value)}
                placeholder="SOL Amount"
                className="w-28 px-2.5 py-1 bg-[#181b22] text-white border border-[#2b3040] rounded focus:outline-none focus:border-indigo-400"
              />
              <span className="text-neutral-500">SOL</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-neutral-400">Debt:</span>
              <input
                type="number"
                value={customDebt}
                onChange={(e) => setCustomDebt(e.target.value)}
                placeholder="USDC Debt"
                className="w-32 px-2.5 py-1 bg-[#181b22] text-white border border-[#2b3040] rounded focus:outline-none focus:border-indigo-400"
              />
              <span className="text-neutral-500">USDC</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-neutral-400">LT:</span>
              <input
                type="number"
                step="1"
                min="10"
                max="95"
                value={customLt}
                onChange={(e) => setCustomLt(e.target.value)}
                className="w-16 px-2.5 py-1 bg-[#181b22] text-white border border-[#2b3040] rounded focus:outline-none focus:border-indigo-400"
              />
              <span className="text-neutral-500">%</span>
            </div>

            <button
              type="submit"
              disabled={updatingObligation}
              className="px-3.5 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded transition-colors"
            >
              Apply Custom Obligation
            </button>
          </form>
        )}
      </div>

      {/* Live Stress-Test & Simulation Action Bar */}
      <div className="bg-[#12141a] border border-[#232733] rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-2 text-neutral-300 font-bold">
          <Zap className="w-4 h-4 text-amber-400" />
          <span>MARKET STRESS-TEST DRIVER:</span>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={() => handleShock(10)}
            disabled={shocking}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold transition-colors disabled:opacity-50"
          >
            <TrendingDown className="w-3.5 h-3.5" />
            -10% (Warning)
          </button>

          <button
            onClick={() => handleShock(20)}
            disabled={shocking}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 font-semibold transition-colors disabled:opacity-50"
          >
            <TrendingDown className="w-3.5 h-3.5" />
            -20% (Danger)
          </button>

          <button
            onClick={() => handleShock(35)}
            disabled={shocking}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-bold transition-colors disabled:opacity-50"
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
              className="w-24 px-2 py-1 bg-[#0a0b0e] border border-[#2b3040] rounded text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={settingPrice || !customPriceInput}
              className="px-2.5 py-1 rounded bg-[#1f2430] hover:bg-[#2b3245] text-neutral-200 border border-[#333b4d] font-semibold transition-colors disabled:opacity-50"
            >
              Set
            </button>
          </form>

          <button
            onClick={handleResetPrice}
            disabled={resetting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-neutral-800/60 hover:bg-neutral-800 text-neutral-300 border border-neutral-700/40 transition-colors disabled:opacity-50 ml-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Oracle
          </button>

          <button
            onClick={handleTriggerRefusal}
            disabled={triggeringRefusal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 font-semibold transition-colors disabled:opacity-50 ml-1"
            title="Deliberately trigger a pre-trade safety limit refusal (> $1M order limit) to show audit log and order book snapshot"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Trigger Safety Refusal
          </button>
        </div>
      </div>

      {/* Top Stat Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Risk State"
          value={<RiskBadge level={riskLevel} className="text-sm py-1 px-3" />}
          subtitle={`Boundary distance ${(distance * 100).toFixed(1)}%`}
          change={riskLevel !== 'HEALTHY' ? 'Escalating' : 'Nominal'}
        />

        <StatCard
          label="Collateral Exposure"
          value={`$${(exposure / 1_000_000).toFixed(2)}M`}
          subtitle="SOL Collateral"
          change="Long"
        />

        <StatCard
          label="Automated Hedge"
          value={`$${(currentHedge / 1_000_000).toFixed(2)}M`}
          subtitle="SOL-PERP on Hyperliquid"
          change={`Short (${(hedgeRatio * 100).toFixed(0)}%)`}
        />

        <StatCard
          label="Net Protocol Exposure"
          value={`$${(netExposure / 1_000_000).toFixed(2)}M`}
          subtitle="Unhedged delta"
          change={`${((1 - hedgeRatio) * 100).toFixed(0)}% exposed`}
        />
      </div>

      {/* Main Chart Section */}
      <div className="bg-[#12141a] border border-[#232733] rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-white">SOL Collateral Price & Cliff Proximity</h2>
            <p className="text-xs text-neutral-400 font-mono mt-0.5">
              Automated triggers fire at configured liquidation distance thresholds
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
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
        />
      </div>

      {/* Bottom Diagnostics & Activity Split */}
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
    </div>
  );
};
