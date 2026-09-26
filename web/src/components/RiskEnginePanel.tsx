import React from 'react';
import { RiskBadge } from './RiskBadge';
import { RiskLevel } from '../theme/risk';
import { GlossaryLabel } from './GlossaryLabel';

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
    <div className="bg-surface-1 border border-surface-2 rounded-lg p-5">
      <div className="flex items-center justify-between pb-4 border-b border-surface-2">
        <h3 className="text-sm font-semibold tracking-wider uppercase text-text-primary">
          Risk Engine Diagnostics
        </h3>
        <RiskBadge level={level} />
      </div>

      <div className="mt-4 space-y-3 font-mono text-sm">
        <div className="flex justify-between items-center text-text-muted">
          <span>SOL price</span>
          <span className="text-text-primary font-bold tabular-nums">${price.toFixed(2)}</span>
        </div>

        <div className="flex justify-between items-center text-text-muted">
          <GlossaryLabel term="liquidationPrice" />
          <span className="text-risk-critical font-bold tabular-nums">${liquidationPrice.toFixed(2)}</span>
        </div>

        <div className="flex justify-between items-center text-text-muted">
          <GlossaryLabel term="liquidationDistance" />
          <span className="text-risk-warning font-bold tabular-nums">{(distance * 100).toFixed(2)}%</span>
        </div>

        <div className="flex justify-between items-center text-text-muted">
          <GlossaryLabel term="healthFactor" />
          <span className="text-risk-healthy font-bold tabular-nums">{healthFactor.toFixed(3)}</span>
        </div>

        <div className="pt-3 border-t border-surface-2 flex justify-between items-center text-text-muted">
          <GlossaryLabel term="targetHedge" />
          <span className="text-text-primary font-bold tabular-nums">${(recommendedHedge / 1_000_000).toFixed(2)}M</span>
        </div>

        <div className="flex justify-between items-center text-text-muted">
          <GlossaryLabel term="filledNotional" />
          <span className="text-brand font-bold tabular-nums">${(currentHedge / 1_000_000).toFixed(2)}M</span>
        </div>

        {isUnderhedged && (
          <div className="mt-2 p-2.5 bg-amber-950/20 border border-risk-warning/30 rounded text-xs text-risk-warning font-sans flex items-center gap-2">
            <span>⚠</span>
            <span>Protection needs adjustment: Protective order queued for next price update</span>
          </div>
        )}
      </div>
    </div>
  );
};
