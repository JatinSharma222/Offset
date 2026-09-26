import React, { useState } from 'react';
import { RiskBadge } from './RiskBadge';
import { BookSnapshot } from './BookSnapshot';
import { RiskLevel } from '../theme/risk';
import { GlossaryLabel } from './GlossaryLabel';

export interface ExecutionRow {
  id: string;
  time: string;
  riskLevel: RiskLevel;
  target: number;
  filled: number;
  slippageBps?: number;
  residual: number;
  status: 'Filled' | 'PartiallyFilled' | 'Refused' | 'Failed';
  statusNote?: string;
  bookSnapshot?: {
    bids: { price: number; size: number }[];
    asks: { price: number; size: number }[];
  };
}

interface ExecutionTableProps {
  executions: ExecutionRow[];
}

export const ExecutionTable: React.FC<ExecutionTableProps> = ({ executions }) => {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto bg-surface-1 border border-surface-2 rounded-lg">
      <table className="w-full text-left font-mono text-xs border-collapse">
        <thead>
          <tr className="border-b border-surface-2 text-text-muted uppercase tracking-wider text-[11px] bg-surface-0/60">
            <th className="py-3 px-4">Time</th>
            <th className="py-3 px-4">Risk level</th>
            <th className="py-3 px-4 text-right">
              <GlossaryLabel term="targetHedge" />
            </th>
            <th className="py-3 px-4 text-right">
              <GlossaryLabel term="filledNotional" />
            </th>
            <th className="py-3 px-4 text-right">
              <GlossaryLabel term="slippage" />
            </th>
            <th className="py-3 px-4 text-right">
              <GlossaryLabel term="residualExposure" />
            </th>
            <th className="py-3 px-4 text-right">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-2/60">
          {executions.map((row) => (
            <React.Fragment key={row.id}>
              <tr
                className="hover:bg-surface-2/60 cursor-pointer transition-colors"
                onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}
              >
                <td className="py-3 px-4 text-text-muted">{row.time}</td>
                <td className="py-3 px-4">
                  <RiskBadge level={row.riskLevel} />
                </td>
                <td className="py-3 px-4 text-right font-bold text-text-primary tabular-nums">
                  ${(row.target / 1_000_000).toFixed(2)}M
                </td>
                <td className="py-3 px-4 text-right text-risk-healthy font-semibold tabular-nums">
                  ${(row.filled / 1_000_000).toFixed(2)}M
                </td>
                <td className="py-3 px-4 text-right text-text-primary/90 tabular-nums">
                  {row.slippageBps !== undefined ? `${(row.slippageBps / 100).toFixed(2)}%` : '—'}
                </td>
                <td className="py-3 px-4 text-right text-text-muted tabular-nums">
                  ${(row.residual / 1_000).toFixed(1)}K
                </td>
                <td className="py-3 px-4 text-right">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-sans font-medium uppercase tracking-wider ${
                      row.status === 'Filled'
                        ? 'bg-emerald-500/10 text-risk-healthy border border-emerald-500/20'
                        : row.status === 'Refused'
                        ? 'bg-amber-500/10 text-risk-warning border border-amber-500/20'
                        : 'bg-surface-2 text-text-muted border border-surface-2'
                    }`}
                  >
                    {row.statusNote ? `${row.status} — ${row.statusNote}` : row.status}
                  </span>
                </td>
              </tr>
              {expandedRow === row.id && row.bookSnapshot && (
                <tr className="bg-surface-0/90">
                  <td colSpan={7} className="p-4 border-b border-surface-2">
                    <div className="text-xs text-text-muted font-sans mb-2 font-semibold">
                      Decision-time top of book snapshot (proof of execution and cost of acting fast)
                    </div>
                    <BookSnapshot
                      bids={row.bookSnapshot.bids}
                      asks={row.bookSnapshot.asks}
                    />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};
