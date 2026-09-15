import React, { useState } from 'react';
import { RiskBadge } from './RiskBadge';
import { BookSnapshot } from './BookSnapshot';
import { RiskLevel } from '../theme/risk';

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
    <div className="overflow-x-auto bg-[#12141a] border border-[#232733] rounded-lg">
      <table className="w-full text-left font-mono text-xs border-collapse">
        <thead>
          <tr className="border-b border-[#232733] text-neutral-400 uppercase tracking-wider text-[11px] bg-[#0d0f14]">
            <th className="py-3 px-4">Time</th>
            <th className="py-3 px-4">Risk</th>
            <th className="py-3 px-4 text-right">Target</th>
            <th className="py-3 px-4 text-right">Filled</th>
            <th className="py-3 px-4 text-right">Slippage</th>
            <th className="py-3 px-4 text-right">Residual</th>
            <th className="py-3 px-4 text-right">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1a1d26]">
          {executions.map((row) => (
            <React.Fragment key={row.id}>
              <tr
                className="hover:bg-[#181b22] cursor-pointer transition-colors"
                onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}
              >
                <td className="py-3 px-4 text-neutral-400">{row.time}</td>
                <td className="py-3 px-4">
                  <RiskBadge level={row.riskLevel} />
                </td>
                <td className="py-3 px-4 text-right font-bold text-white tabular-nums">
                  ${(row.target / 1_000_000).toFixed(2)}M
                </td>
                <td className="py-3 px-4 text-right text-emerald-400 tabular-nums">
                  ${(row.filled / 1_000_000).toFixed(2)}M
                </td>
                <td className="py-3 px-4 text-right text-neutral-300 tabular-nums">
                  {row.slippageBps !== undefined ? `${(row.slippageBps / 100).toFixed(2)}%` : '—'}
                </td>
                <td className="py-3 px-4 text-right text-neutral-400 tabular-nums">
                  ${(row.residual / 1_000).toFixed(1)}K
                </td>
                <td className="py-3 px-4 text-right">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-sans font-medium uppercase tracking-wider ${
                      row.status === 'Filled'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : row.status === 'Refused'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {row.statusNote ? `${row.status} — ${row.statusNote}` : row.status}
                  </span>
                </td>
              </tr>
              {expandedRow === row.id && row.bookSnapshot && (
                <tr className="bg-[#0f1117]">
                  <td colSpan={7} className="p-4 border-b border-[#232733]">
                    <div className="text-xs text-neutral-400 font-sans mb-2 font-semibold">
                      Decision-time Top of Book Snapshot (Proof of Execution & Slippage)
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
