import React, { useMemo } from 'react';
import { useQuery, useSubscription } from '@apollo/client';
import { GET_CURRENT_SNAPSHOT, GET_EXECUTIONS, SNAPSHOT_STREAM } from '../graphql/operations';
import { StatCard } from '../components/StatCard';
import { RiskBadge } from '../components/RiskBadge';
import { PriceChart } from '../components/PriceChart';
import { RiskEnginePanel } from '../components/RiskEnginePanel';
import { EventFeed, EventItem } from '../components/EventFeed';
import { RiskLevel } from '../theme/risk';

export const DashboardScreen: React.FC = () => {
  // Query initial snapshot & poll
  const { data: snapshotData } = useQuery(GET_CURRENT_SNAPSHOT, {
    pollInterval: 4000,
  });

  // Subscribe to live websocket stream
  const { data: streamData } = useSubscription(SNAPSHOT_STREAM);

  // Query recent execution records for the event feed
  const { data: executionsData } = useQuery(GET_EXECUTIONS, {
    variables: { limit: 5 },
    pollInterval: 4000,
  });

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

  // Chart price history
  const chartData = useMemo(() => {
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
  }, [price]);

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

  return (
    <div className="space-y-6">
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
