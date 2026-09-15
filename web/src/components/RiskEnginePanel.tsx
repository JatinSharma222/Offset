import React from 'react';
import { RiskBadge } from './RiskBadge';
import { RiskLevel } from '../theme/risk';

interface RiskEnginePanelProps {
  price: number;
  liquidationPrice: number;
  distance: number;
  healthFactor: number;
  recommendedHedge: number;
  currentHedge: number;
  level: RiskLevel;
}

export const RiskEnginePanel: React.FC<RiskEnginePanelProps> = ({
  price,
  liquidationPrice,
  distance,
  healthFactor,
  recommendedHedge,
  currentHedge,
  level,
}) => {
  const isUnderhedged = currentHedge < recommendedHedge;

  return (
    <div className="bg-[#12141a] border border-[#232733] rounded-lg p-5">
      <div className="flex items-center justify-between pb-4 border-b border-[#232733]">
        <h3 className="text-sm font-semibold tracking-wider uppercase text-neutral-300">
          Risk Engine Diagnostics
        </h3>
        <RiskBadge level={level} />
      </div>

      <div className="mt-4 space-y-3 font-mono text-sm">
        <div className="flex justify-between items-center text-neutral-400">
          <span>SOL Price</span>
          <span className="text-white font-bold tabular-nums">${price.toFixed(2)}</span>
        </div>

        <div className="flex justify-between items-center text-neutral-400">
          <span>Liquidation Price</span>
          <span className="text-red-400 font-bold tabular-nums">${liquidationPrice.toFixed(2)}</span>
        </div>

        <div className="flex justify-between items-center text-neutral-400">
          <span>Distance to Liquidation</span>
          <span className="text-amber-400 font-bold tabular-nums">{(distance * 100).toFixed(2)}%</span>
        </div>

        <div className="flex justify-between items-center text-neutral-400">
          <span>Health Factor</span>
          <span className="text-emerald-400 font-bold tabular-nums">{healthFactor.toFixed(3)}</span>
        </div>

        <div className="pt-3 border-t border-[#232733] flex justify-between items-center text-neutral-400">
          <span>Target Hedge</span>
          <span className="text-white font-bold tabular-nums">${(recommendedHedge / 1_000_000).toFixed(2)}M</span>
        </div>

        <div className="flex justify-between items-center text-neutral-400">
          <span>Current Active Hedge</span>
          <span className="text-indigo-400 font-bold tabular-nums">${(currentHedge / 1_000_000).toFixed(2)}M</span>
        </div>

        {isUnderhedged && (
          <div className="mt-2 p-2 bg-amber-950/30 border border-amber-800/40 rounded text-xs text-amber-400 font-sans flex items-center gap-2">
            <span>⚠</span>
            <span>Position underhedged: Adjustment queued for next tick</span>
          </div>
        )}
      </div>
    </div>
  );
};
