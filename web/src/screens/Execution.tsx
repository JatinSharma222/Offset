import React from 'react';
import { ExecutionTable, ExecutionRow } from '../components/ExecutionTable';

export const ExecutionScreen: React.FC = () => {
  const executionData: ExecutionRow[] = [
    {
      id: 'exec-1',
      time: '14:32:09',
      riskLevel: 'CRITICAL',
      target: 5_000_000,
      filled: 4_972_300,
      slippageBps: 18,
      residual: 27_700,
      status: 'Filled',
      bookSnapshot: {
        bids: [
          { price: 184.15, size: 5000 },
          { price: 184.10, size: 8500 },
          { price: 184.05, size: 12000 },
          { price: 184.00, size: 15000 },
          { price: 183.90, size: 22000 },
        ],
        asks: [
          { price: 184.25, size: 4000 },
          { price: 184.30, size: 9000 },
          { price: 184.35, size: 11000 },
          { price: 184.40, size: 14000 },
          { price: 184.50, size: 25000 },
        ],
      },
    },
    {
      id: 'exec-2',
      time: '14:19:02',
      riskLevel: 'DANGER',
      target: 2_500_000,
      filled: 2_500_000,
      slippageBps: 4,
      residual: 0,
      status: 'Filled',
      bookSnapshot: {
        bids: [
          { price: 189.45, size: 12000 },
          { price: 189.40, size: 18000 },
          { price: 189.35, size: 25000 },
          { price: 189.30, size: 30000 },
          { price: 189.20, size: 45000 },
        ],
        asks: [
          { price: 189.55, size: 10000 },
          { price: 189.60, size: 14000 },
          { price: 189.65, size: 22000 },
          { price: 189.70, size: 31000 },
          { price: 189.80, size: 40000 },
        ],
      },
    },
    {
      id: 'exec-3',
      time: '14:05:44',
      riskLevel: 'DANGER',
      target: 2_500_000,
      filled: 0,
      residual: 2_500_000,
      status: 'Refused',
      statusNote: 'Book depth insufficient (<$1.0M at 15bps)',
      bookSnapshot: {
        bids: [
          { price: 189.50, size: 400 },
          { price: 189.40, size: 650 },
          { price: 189.20, size: 800 },
          { price: 189.00, size: 1200 },
          { price: 188.50, size: 1500 },
        ],
        asks: [
          { price: 189.60, size: 500 },
          { price: 189.70, size: 700 },
          { price: 189.90, size: 900 },
          { price: 190.10, size: 1100 },
          { price: 190.50, size: 2000 },
        ],
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end pb-2 border-b border-[#232733]">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Execution Audit Log</h2>
          <p className="text-xs text-neutral-400 font-mono mt-1">
            Complete record of trade attempts on Hyperliquid. Click any row to inspect book depth evidence.
          </p>
        </div>
        <div className="text-xs font-mono text-neutral-400">
          Total orders: <span className="text-white font-bold">3</span> · Fill rate: <span className="text-emerald-400 font-bold">66.7%</span>
        </div>
      </div>

      <ExecutionTable executions={executionData} />

      <div className="p-4 bg-[#12141a] border border-[#232733] rounded-lg text-xs text-neutral-400 leading-relaxed">
        <span className="text-white font-semibold">Pre-Trade Safety Guarantee:</span> Every order strictly undergoes margin headroom verification,
        price staleness check (&lt;30s), maximum single clip constraints, and slippage tolerance boundaries before transmission to the Hyperliquid DEX.
      </div>
    </div>
  );
};
