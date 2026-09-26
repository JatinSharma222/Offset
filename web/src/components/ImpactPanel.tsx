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
    <div className="bg-[#12141a] border border-[#232733] rounded-lg p-6">
      <div className="text-center mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
          Protection impact verification
        </h3>
        <p className="text-xs text-neutral-400 mt-1 font-mono">
          Net capital preserved after deducting the cost of acting fast (slippage) and carrying protection
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
        <div className="bg-[#0a0b0e] border border-emerald-500/30 p-4 rounded-lg">
          <div className="text-3xl font-bold font-mono text-emerald-400 tabular-nums">
            ${(lossAvoided / 1_000_000).toFixed(2)}M
          </div>
          <div className="text-[11px] uppercase tracking-wider text-emerald-300/80 mt-1 font-sans font-semibold">
            Net capital preserved
          </div>
        </div>

        <div className="bg-[#0a0b0e] border border-[#232733] p-4 rounded-lg">
          <div className="text-3xl font-bold font-mono text-white tabular-nums">
            {damageOffsetPct > 100 ? '100%+' : `${damageOffsetPct.toFixed(0)}%`}
          </div>
          <div className="text-[11px] uppercase tracking-wider text-neutral-400 mt-1 font-sans font-medium">
            Financial damage offset
          </div>
        </div>

        <div className="bg-[#0a0b0e] border border-[#232733] p-4 rounded-lg">
          <div className="text-3xl font-bold font-mono text-white tabular-nums">
            {onChainLiquidationsAbsorbed > 0
              ? `${onChainLiquidationsAbsorbed} Covered`
              : `${liquidationsPrevented} Prevented`}
          </div>
          <div className="text-[11px] uppercase tracking-wider text-neutral-400 mt-1 font-sans font-medium">
            {badDebtReductionPct === 100
              ? 'Penalties covered ($0 bad debt)'
              : `Penalties covered (${badDebtReductionPct.toFixed(0)}% bad debt red.)`}
          </div>
        </div>

        <div className="bg-[#0a0b0e] border border-[#232733] p-4 rounded-lg">
          <div className="text-3xl font-bold font-mono text-amber-400 tabular-nums">
            ${(hedgeCost / 1_000).toFixed(1)}K
          </div>
          <div className="text-[11px] uppercase tracking-wider text-neutral-400 mt-1 font-sans font-medium">
            <GlossaryLabel
              term="slippage"
              plainText="Cost of acting fast & carry"
              technicalText="Slippage and funding carry"
              glossText="Combined trading slippage and borrow funding incurred while keeping the protective hedge live."
            />
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-[#1a1d26] text-center">
        <p className="text-[11px] font-mono text-neutral-500">
          Note: Offset does not alter on-chain smart contract liquidation code. It executes off-chain perp hedges on Hyperliquid to financially absorb losses and keep protocols whole.
        </p>
      </div>
    </div>
  );
};
