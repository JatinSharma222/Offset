import React, { useState } from 'react';

export type GlossaryKey =
  | 'healthFactor'
  | 'liquidationDistance'
  | 'liquidationPrice'
  | 'targetHedge'
  | 'filledNotional'
  | 'residualExposure'
  | 'slippage'
  | 'riskLevel'
  | 'agentWallet';

export interface GlossaryDefinition {
  plain: string;
  technical: string;
  gloss: string;
}

export const GLOSSARY: Record<GlossaryKey, GlossaryDefinition> = {
  healthFactor: {
    plain: 'Safety margin',
    technical: 'Health Factor',
    gloss: 'Ratio of collateral value to liquidation threshold. Greater than 1.0 means safe from liquidation.',
  },
  liquidationDistance: {
    plain: 'How close to trouble',
    technical: 'Liquidation Distance',
    gloss: 'Percentage the collateral price can fall before liquidation triggers.',
  },
  liquidationPrice: {
    plain: 'The price where things go wrong',
    technical: 'Liquidation Price',
    gloss: 'Exact market price where the lending protocol begins seizing and liquidating collateral.',
  },
  targetHedge: {
    plain: "Protection we're aiming for",
    technical: 'Target Hedge',
    gloss: 'Target short position notional calculated by the risk policy to absorb downside loss.',
  },
  filledNotional: {
    plain: 'Protection actually in place',
    technical: 'Filled Notional',
    gloss: 'Actual short position notional filled and currently live on the exchange.',
  },
  residualExposure: {
    plain: 'Protection still missing',
    technical: 'Residual Exposure',
    gloss: 'Remaining collateral value not yet covered by active hedges.',
  },
  slippage: {
    plain: 'Cost of acting fast',
    technical: 'Slippage',
    gloss: 'Difference between the expected price when the order was triggered and the actual filled price.',
  },
  riskLevel: {
    plain: 'Risk level',
    technical: 'Risk Level (Healthy / Warning / Danger / Critical)',
    gloss: 'Standardized operational risk tier based on distance to the liquidation cliff.',
  },
  agentWallet: {
    plain: 'Trading-only permission',
    technical: 'Agent wallet / Delegated trading key',
    gloss: 'Restricted API key authorized only to place and cancel hedge orders, with zero withdrawal capability.',
  },
};

interface GlossaryLabelProps {
  term?: GlossaryKey;
  plainText?: string;
  technicalText?: string;
  glossText?: string;
  className?: string;
  textClassName?: string;
  showIcon?: boolean;
}

export const GlossaryLabel: React.FC<GlossaryLabelProps> = ({
  term,
  plainText,
  technicalText,
  glossText,
  className = '',
  textClassName = '',
  showIcon = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const def = term ? GLOSSARY[term] : undefined;
  const plain = plainText || def?.plain || '';
  const technical = technicalText || def?.technical || '';
  const gloss = glossText || def?.gloss || '';

  const tooltipTitle = technical ? `Technical term: ${technical}${gloss ? ` — ${gloss}` : ''}` : gloss;

  return (
    <span
      className={`relative inline-flex items-center gap-1 group cursor-help select-none ${className}`}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onClick={(e) => {
        e.stopPropagation();
        setIsOpen((prev) => !prev);
      }}
      onFocus={() => setIsOpen(true)}
      onBlur={() => setIsOpen(false)}
      tabIndex={0}
      title={tooltipTitle}
      role="tooltip"
      aria-label={tooltipTitle}
    >
      <span
        className={`border-b border-dotted border-neutral-400/60 group-hover:border-neutral-200 transition-colors ${textClassName}`}
      >
        {plain}
      </span>

      {showIcon && (
        <span className="text-[10px] text-neutral-400 opacity-70 group-hover:opacity-100">ⓘ</span>
      )}

      {/* Floating Gloss Popover */}
      {isOpen && (
        <span
          className="absolute bottom-full left-0 mb-2 z-50 w-64 p-2.5 bg-[#181b22] text-[#e1e4ea] border border-[#333b4d] rounded shadow-xl text-left font-sans text-xs normal-case tracking-normal animate-fadeIn pointer-events-none"
          style={{ minWidth: '220px' }}
        >
          <span className="block font-semibold text-indigo-300 text-[11px] uppercase tracking-wider mb-1">
            Technical: {technical}
          </span>
          {gloss && <span className="block text-neutral-300 text-[11px] leading-relaxed">{gloss}</span>}
          <span className="block text-[10px] text-neutral-500 mt-1.5 font-mono">
            Click / tap to dismiss
          </span>
        </span>
      )}
    </span>
  );
};
