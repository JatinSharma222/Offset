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
    <div className="glass-card rounded-2xl p-6 md:p-8 space-y-6 relative overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-patina-light font-semibold block">
            Protection Impact Verification
          </span>
          <h3 className="font-serif text-2xl text-white font-medium mt-1">
            Quantified Capital Defense
          </h3>
        </div>
        <span className="font-mono text-xs text-zinc-400">
          Net capital preserved after deducting slippage &amp; funding carry
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Hero Number statement moment in Newsreader serif */}
        <div className="glass-card-subtle p-5 rounded-xl border border-patina/30 relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-patina/10 blur-xl pointer-events-none" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-patina-light font-semibold block">
            Net Capital Preserved
          </span>
          <div className="font-serif text-3xl sm:text-4xl text-patina-light font-normal mt-1.5 tabular-nums">
            ${(lossAvoided / 1_000_000).toFixed(2)}M
          </div>
          <div className="text-[11px] text-zinc-400 mt-1 font-mono">
            Zero collateral seized
          </div>
        </div>

        <div className="glass-card-subtle p-5 rounded-xl border border-white/5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400 block">
            Financial Damage Offset
          </span>
          <div className="font-serif text-3xl sm:text-4xl text-white font-normal mt-1.5 tabular-nums">
            {damageOffsetPct > 100 ? '100%+' : `${damageOffsetPct.toFixed(0)}%`}
          </div>
          <div className="text-[11px] text-patina-light mt-1 font-mono">
            Fully cushioned downside
          </div>
        </div>

        <div className="glass-card-subtle p-5 rounded-xl border border-white/5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400 block">
            Bad Debt Avoided
          </span>
          <div className="font-serif text-3xl sm:text-4xl text-white font-normal mt-1.5 tabular-nums">
            {badDebtReductionPct === 100
              ? '100%'
              : `${badDebtReductionPct.toFixed(0)}%`}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1 font-mono">
            {onChainLiquidationsAbsorbed > 0
              ? `${onChainLiquidationsAbsorbed} liquidations absorbed`
              : `${liquidationsPrevented} prevented`}
          </div>
        </div>

        <div className="glass-card-subtle p-5 rounded-xl border border-white/5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400 block">
            <GlossaryLabel
              term="slippage"
              plainText="Cost of Acting Fast & Carry"
              technicalText="Slippage & Funding Carry"
              glossText="Combined trading slippage and borrow funding incurred while keeping the protective hedge live."
            />
          </span>
          <div className="font-serif text-3xl sm:text-4xl text-amber-gold font-normal mt-1.5 tabular-nums">
            ${(hedgeCost / 1_000).toFixed(1)}K
          </div>
          <div className="text-[11px] text-zinc-400 mt-1 font-mono">
            Direct Hyperliquid fee + basis
          </div>
        </div>
      </div>

      <div className="pt-2 text-center text-xs font-mono text-zinc-500">
        Note: Offset does not alter on-chain smart contract liquidation code. It executes off-chain delta-neutral perp hedges on Hyperliquid to financially absorb losses and protect collateral.
      </div>
    </div>
  );
};
