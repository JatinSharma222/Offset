import React from 'react';
import { GlossaryLabel } from './GlossaryLabel';

interface ImpactPanelProps {
  lossAvoided: number;
  damageOffsetPct?: number;
  badDebtReductionPct: number;
  liquidationsPrevented?: number;
  onChainLiquidationsAbsorbed?: number;
  hedgeCost: number;
}

export const ImpactPanel: React.FC<ImpactPanelProps> = ({
  lossAvoided,
  damageOffsetPct = 100,
  badDebtReductionPct,
  liquidationsPrevented = 0,
  onChainLiquidationsAbsorbed = 1,
  hedgeCost,
}) => {
  return (
    <div className="bg-surface-1 border border-surface-2 rounded-xl p-6">
      <div className="text-center mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-risk-healthy">
          Protection impact verification
        </h3>
        <p className="text-xs text-text-muted mt-1 font-mono">
          Net capital preserved after deducting the cost of acting fast (slippage) and carrying protection
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
        {/* Hero Number statement moment in Fraunces */}
        <div className="bg-surface-0 border border-emerald-500/30 p-5 rounded-lg">
          <div className="font-fraunces text-3xl sm:text-4xl font-bold text-risk-healthy tabular-nums">
            ${(lossAvoided / 1_000_000).toFixed(2)}M
          </div>
          <div className="text-[11px] uppercase tracking-wider text-risk-healthy/90 mt-1 font-sans font-semibold">
            Net capital preserved
          </div>
        </div>

        <div className="bg-surface-0 border border-surface-2 p-5 rounded-lg">
          <div className="font-fraunces text-3xl sm:text-4xl font-bold text-text-primary tabular-nums">
            {damageOffsetPct > 100 ? '100%+' : `${damageOffsetPct.toFixed(0)}%`}
          </div>
          <div className="text-[11px] uppercase tracking-wider text-text-muted mt-1 font-sans font-medium">
            Financial damage offset
          </div>
        </div>

        <div className="bg-surface-0 border border-surface-2 p-5 rounded-lg">
          <div className="font-fraunces text-3xl sm:text-4xl font-bold text-text-primary tabular-nums">
            {onChainLiquidationsAbsorbed > 0
              ? `${onChainLiquidationsAbsorbed} Covered`
              : `${liquidationsPrevented} Prevented`}
          </div>
          <div className="text-[11px] uppercase tracking-wider text-text-muted mt-1 font-sans font-medium">
            {badDebtReductionPct === 100
              ? 'Penalties covered ($0 bad debt)'
              : `Penalties covered (${badDebtReductionPct.toFixed(0)}% bad debt red.)`}
          </div>
        </div>

        <div className="bg-surface-0 border border-surface-2 p-5 rounded-lg">
          <div className="font-fraunces text-3xl sm:text-4xl font-bold text-risk-warning tabular-nums">
            ${(hedgeCost / 1_000).toFixed(1)}K
          </div>
          <div className="text-[11px] uppercase tracking-wider text-text-muted mt-1 font-sans font-medium">
            <GlossaryLabel
              term="slippage"
              plainText="Cost of acting fast & carry"
              technicalText="Slippage and funding carry"
              glossText="Combined trading slippage and borrow funding incurred while keeping the protective hedge live."
            />
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-surface-2/60 text-center">
        <p className="text-[11px] font-mono text-text-muted">
          Note: Offset does not alter on-chain smart contract liquidation code. It executes off-chain perp hedges on Hyperliquid to financially absorb losses and keep protocols whole.
        </p>
      </div>
    </div>
  );
};
