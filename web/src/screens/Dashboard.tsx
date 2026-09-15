import React from 'react';
import { StatCard } from '../components/StatCard';
import { RiskBadge } from '../components/RiskBadge';
import { PriceChart } from '../components/PriceChart';
import { RiskEnginePanel } from '../components/RiskEnginePanel';
import { EventFeed, EventItem } from '../components/EventFeed';
import { RiskLevel } from '../theme/risk';

export const DashboardScreen: React.FC = () => {
  // Demo baseline state
  const riskLevel: RiskLevel = 'DANGER';
  const price = 184.20;
  const liqPrice = 172.50;
  const distance = (price - liqPrice) / price;
  const healthFactor = 1.068;
  const exposure = 10_000_000;
  const hedgeRatio = 0.50;
  const targetHedge = exposure * hedgeRatio;
  const currentHedge = 5_000_000;
  const netExposure = exposure - currentHedge;

  // Chart price history
  const chartData = [
    { time: 1716163200, value: 220 },
    { time: 1716166800, value: 215 },
    { time: 1716170400, value: 208 },
    { time: 1716174000, value: 202 },
    { time: 1716177600, value: 195 },
    { time: 1716181200, value: 189 },
    { time: 1716184800, value: 184.2 },
  ];

  const recentEvents: EventItem[] = [
    { time: '14:32', type: 'EXECUTION', message: 'Danger triggered → Hedge resized to $5.0M SOL-PERP', highlight: true },
    { time: '14:19', type: 'RISK', message: 'Warning threshold crossed (distance 12.5%)', highlight: true },
    { time: '13:58', type: 'STATUS', message: 'Position evaluated: Healthy (distance 24.2%)' },
    { time: '13:00', type: 'ORCHESTRATION', message: 'Monitoring Solana Kamino vault #4829' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Stat Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Risk State"
          value={<RiskBadge level={riskLevel} className="text-sm py-1 px-3" />}
          subtitle={`Boundary distance ${(distance * 100).toFixed(1)}%`}
          change="Escalating"
        />

        <StatCard
          label="Collateral Exposure"
          value={`$${(exposure / 1_000_000).toFixed(1)}M`}
          subtitle="SOL Collateral"
          change="Long"
        />

        <StatCard
          label="Automated Hedge"
          value={`$${(currentHedge / 1_000_000).toFixed(1)}M`}
          subtitle="SOL-PERP on Hyperliquid"
          change="Short (50%)"
        />

        <StatCard
          label="Net Protocol Exposure"
          value={`$${(netExposure / 1_000_000).toFixed(1)}M`}
          subtitle="Unhedged delta"
          change="-50% variance"
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
          warningPrice={198.5}
          dangerPrice={189.5}
          criticalPrice={178.0}
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
