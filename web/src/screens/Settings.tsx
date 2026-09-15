import React, { useState } from 'react';
import { Check, X, Shield, AlertOctagon } from 'lucide-react';

export const SettingsScreen: React.FC = () => {
  const [killSwitch, setKillSwitch] = useState(false);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="pb-2 border-b border-[#232733]">
        <h2 className="text-lg font-bold text-white tracking-tight">Configuration & Custody Permissions</h2>
        <p className="text-xs text-neutral-400 font-mono mt-1">
          Offset operates under a zero-custody delegation architecture enforced on Hyperliquid L1.
        </p>
      </div>

      {/* Custody & Permissions Section */}
      <div className="bg-[#12141a] border border-[#232733] rounded-lg p-5">
        <div className="flex items-center gap-2 pb-3 border-b border-[#232733] text-sm font-semibold text-white">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span>Execution Venue & Agent Delegation</span>
        </div>

        <div className="mt-4 space-y-4 text-xs font-mono">
          <div className="flex justify-between items-center py-2 border-b border-[#1a1d26]">
            <span className="text-neutral-400">Hyperliquid Connection</span>
            <span className="flex items-center gap-1 text-emerald-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Connected (Testnet)
            </span>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-[#1a1d26]">
            <span className="text-neutral-400">Master Account Address</span>
            <span className="text-neutral-200">0x71C...b29F</span>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-[#1a1d26]">
            <span className="text-neutral-400">Agent Wallet Public Key</span>
            <span className="text-neutral-200">0x84A...e01C (Offset Engine)</span>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-[#1a1d26]">
            <span className="text-neutral-400">Trading Permissions</span>
            <span className="flex items-center gap-1 text-emerald-400 font-bold">
              <Check className="w-4 h-4" /> Granted (Place / Cancel SOL-PERP)
            </span>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-[#1a1d26] bg-red-950/20 p-2 rounded">
            <div>
              <span className="text-red-400 font-bold">Withdraw / Transfer Permissions</span>
              <p className="text-[11px] text-neutral-400 font-sans mt-0.5">
                Structurally impossible. Exchange-level constraint prevents funds leaving protocol custody.
              </p>
            </div>
            <span className="flex items-center gap-1 text-red-400 font-bold">
              <X className="w-4 h-4 text-red-400 stroke-[3]" /> Denied
            </span>
          </div>
        </div>
      </div>

      {/* Protection Policy Section */}
      <div className="bg-[#12141a] border border-[#232733] rounded-lg p-5">
        <h3 className="text-sm font-semibold text-white pb-3 border-b border-[#232733]">
          Active Liquidation Defense Policy
        </h3>

        <div className="mt-4 space-y-3 text-xs font-mono">
          <div className="flex justify-between items-center py-1.5 text-neutral-300">
            <span className="text-neutral-400">Protected Collateral Asset</span>
            <span className="font-bold text-white">SOL</span>
          </div>
          <div className="flex justify-between items-center py-1.5 text-neutral-300">
            <span className="text-neutral-400">Warning Trigger</span>
            <span>Distance ≤ 15% → <strong className="text-amber-400">25% Hedge</strong></span>
          </div>
          <div className="flex justify-between items-center py-1.5 text-neutral-300">
            <span className="text-neutral-400">Danger Trigger</span>
            <span>Distance ≤ 10% → <strong className="text-orange-400">50% Hedge</strong></span>
          </div>
          <div className="flex justify-between items-center py-1.5 text-neutral-300">
            <span className="text-neutral-400">Critical Trigger</span>
            <span>Distance ≤ 5% → <strong className="text-red-400">75% Hedge</strong></span>
          </div>
        </div>
      </div>

      {/* Emergency Kill Switch */}
      <div className="bg-[#12141a] border border-[#232733] rounded-lg p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-red-400" /> Circuit Breaker / Kill Switch
            </h3>
            <p className="text-xs text-neutral-400 font-mono mt-1">
              Instantly cancels open orders and halts automated execution across all tiers.
            </p>
          </div>

          <button
            onClick={() => setKillSwitch(!killSwitch)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded transition-colors ${
              killSwitch
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-[#181b22] hover:bg-red-950/40 text-red-400 border border-red-900/40'
            }`}
          >
            {killSwitch ? 'Trading Halted (Active)' : 'Halt All Trading'}
          </button>
        </div>
      </div>
    </div>
  );
};
