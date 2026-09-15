import React from 'react';

interface ImpactPanelProps {
  lossAvoided: number;
  badDebtReductionPct: number;
  liquidationsPrevented: number;
  hedgeCost: number;
}

export const ImpactPanel: React.FC<ImpactPanelProps> = ({
  lossAvoided,
  badDebtReductionPct,
  liquidationsPrevented,
  hedgeCost,
}) => {
  return (
    <div className="bg-[#12141a] border border-[#232733] rounded-lg p-6">
      <div className="text-center mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
          Protection Impact Verification
        </h3>
        <p className="text-xs text-neutral-400 mt-1 font-mono">
          Net benefit verified after deducting funding rate & execution slippage costs
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
        <div className="bg-[#0a0b0e] border border-[#232733] p-4 rounded-lg">
          <div className="text-3xl font-bold font-mono text-emerald-400 tabular-nums">
            ${(lossAvoided / 1_000_000).toFixed(2)}M
          </div>
          <div className="text-[11px] uppercase tracking-wider text-neutral-400 mt-1 font-sans font-medium">
            Loss Avoided (Net)
          </div>
        </div>

        <div className="bg-[#0a0b0e] border border-[#232733] p-4 rounded-lg">
          <div className="text-3xl font-bold font-mono text-white tabular-nums">
            {badDebtReductionPct.toFixed(0)}%
          </div>
          <div className="text-[11px] uppercase tracking-wider text-neutral-400 mt-1 font-sans font-medium">
            Bad Debt Reduction
          </div>
        </div>

        <div className="bg-[#0a0b0e] border border-[#232733] p-4 rounded-lg">
          <div className="text-3xl font-bold font-mono text-white tabular-nums">
            {liquidationsPrevented}
          </div>
          <div className="text-[11px] uppercase tracking-wider text-neutral-400 mt-1 font-sans font-medium">
            Cascades Prevented
          </div>
        </div>

        <div className="bg-[#0a0b0e] border border-[#232733] p-4 rounded-lg">
          <div className="text-3xl font-bold font-mono text-amber-400 tabular-nums">
            ${(hedgeCost / 1_000).toFixed(1)}K
          </div>
          <div className="text-[11px] uppercase tracking-wider text-neutral-400 mt-1 font-sans font-medium">
            Total Hedge Cost
          </div>
        </div>
      </div>
    </div>
  );
};
