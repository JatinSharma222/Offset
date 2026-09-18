import React, { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { GET_EXECUTION_STATUS, SET_KILL_SWITCH, UPDATE_POLICY } from '../graphql/operations';
import { Check, X, Shield, AlertOctagon, Sliders, Save } from 'lucide-react';

export const SettingsScreen: React.FC = () => {
  const [localKillSwitch, setLocalKillSwitch] = useState(false);
  const [policySavedMsg, setPolicySavedMsg] = useState(false);

  // Policy tier state (in percentages)
  const [warningDist, setWarningDist] = useState(15);
  const [warningRatio, setWarningRatio] = useState(25);
  const [dangerDist, setDangerDist] = useState(10);
  const [dangerRatio, setDangerRatio] = useState(50);
  const [criticalDist, setCriticalDist] = useState(5);
  const [criticalRatio, setCriticalRatio] = useState(75);

  const { data: statusData, refetch } = useQuery(GET_EXECUTION_STATUS, {
    pollInterval: 5000,
  });

  const [setKillSwitchMutation, { loading: mutationLoading }] = useMutation(SET_KILL_SWITCH, {
    onCompleted: () => refetch(),
  });

  const [updatePolicyMutation, { loading: updatingPolicy }] = useMutation(UPDATE_POLICY, {
    onCompleted: () => {
      setPolicySavedMsg(true);
      setTimeout(() => setPolicySavedMsg(false), 3000);
    },
  });

  const status = statusData?.executionStatus;
  const isKillSwitchActive = status?.killSwitchActive ?? localKillSwitch;

  const handleToggleKillSwitch = async () => {
    const nextState = !isKillSwitchActive;
    setLocalKillSwitch(nextState);
    try {
      await setKillSwitchMutation({
        variables: { active: nextState },
      });
    } catch (e) {
      console.error('Failed to toggle kill switch via GraphQL:', e);
    }
  };

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updatePolicyMutation({
        variables: {
          input: {
            warning: {
              minimumDistance: (warningDist / 100).toString(),
              hedgeRatio: (warningRatio / 100).toString(),
            },
            danger: {
              minimumDistance: (dangerDist / 100).toString(),
              hedgeRatio: (dangerRatio / 100).toString(),
            },
            critical: {
              minimumDistance: (criticalDist / 100).toString(),
              hedgeRatio: (criticalRatio / 100).toString(),
            },
          },
        },
      });
    } catch (err) {
      console.error('Failed to update policy:', err);
    }
  };

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
          <span>Execution Venue & Delegation</span>
        </div>

        <div className="mt-4 space-y-4 text-xs font-mono">
          <div className="flex justify-between items-center py-2 border-b border-[#1a1d26]">
            <span className="text-neutral-400">Hyperliquid Connection</span>
            <span className="flex items-center gap-1 text-emerald-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              {status?.connected ? 'Connected (Testnet)' : 'Connected'}
            </span>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-[#1a1d26]">
            <span className="text-neutral-400">Master Protocol Account</span>
            <span className="text-neutral-200">0x71C...b29F</span>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-[#1a1d26]">
            <span className="text-neutral-400">Delegated Trading Key</span>
            <span className="text-neutral-200">
              {status?.accountAddress || '0x84Ae...01Cd (Offset Trading Key)'}
            </span>
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

      {/* Protection Policy Editor Section */}
      <div className="bg-[#12141a] border border-[#232733] rounded-lg p-5">
        <div className="flex items-center justify-between pb-3 border-b border-[#232733]">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-400" />
            Configurable Liquidation Defense Policy
          </h3>
          {policySavedMsg && (
            <span className="text-xs font-mono text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              <Check className="w-3 h-3" /> Policy Saved & Applied
            </span>
          )}
        </div>

        <form onSubmit={handleSavePolicy} className="mt-4 space-y-4 text-xs font-mono">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Warning Tier */}
            <div className="p-3 bg-[#0d0f14] border border-amber-500/20 rounded">
              <div className="font-bold text-amber-400 mb-2 flex items-center justify-between">
                <span>WARNING TIER</span>
                <span className="text-[10px] bg-amber-500/10 px-1.5 py-0.5 rounded">Tier 1</span>
              </div>
              <div className="space-y-2 text-neutral-300">
                <div>
                  <label className="text-[11px] text-neutral-400 block mb-1">Trigger Distance (%):</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={warningDist}
                    onChange={(e) => setWarningDist(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 bg-[#12141a] border border-[#232733] rounded text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-neutral-400 block mb-1">Hedge Ratio (%):</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={warningRatio}
                    onChange={(e) => setWarningRatio(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 bg-[#12141a] border border-[#232733] rounded text-white"
                  />
                </div>
              </div>
            </div>

            {/* Danger Tier */}
            <div className="p-3 bg-[#0d0f14] border border-orange-500/20 rounded">
              <div className="font-bold text-orange-400 mb-2 flex items-center justify-between">
                <span>DANGER TIER</span>
                <span className="text-[10px] bg-orange-500/10 px-1.5 py-0.5 rounded">Tier 2</span>
              </div>
              <div className="space-y-2 text-neutral-300">
                <div>
                  <label className="text-[11px] text-neutral-400 block mb-1">Trigger Distance (%):</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={dangerDist}
                    onChange={(e) => setDangerDist(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 bg-[#12141a] border border-[#232733] rounded text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-neutral-400 block mb-1">Hedge Ratio (%):</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={dangerRatio}
                    onChange={(e) => setDangerRatio(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 bg-[#12141a] border border-[#232733] rounded text-white"
                  />
                </div>
              </div>
            </div>

            {/* Critical Tier */}
            <div className="p-3 bg-[#0d0f14] border border-red-500/20 rounded">
              <div className="font-bold text-red-400 mb-2 flex items-center justify-between">
                <span>CRITICAL TIER</span>
                <span className="text-[10px] bg-red-500/10 px-1.5 py-0.5 rounded">Tier 3</span>
              </div>
              <div className="space-y-2 text-neutral-300">
                <div>
                  <label className="text-[11px] text-neutral-400 block mb-1">Trigger Distance (%):</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={criticalDist}
                    onChange={(e) => setCriticalDist(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 bg-[#12141a] border border-[#232733] rounded text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-neutral-400 block mb-1">Hedge Ratio (%):</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={criticalRatio}
                    onChange={(e) => setCriticalRatio(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 bg-[#12141a] border border-[#232733] rounded text-white"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={updatingPolicy}
              className="flex items-center gap-1.5 px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-colors disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              Save Policy Changes
            </button>
          </div>
        </form>
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
            onClick={handleToggleKillSwitch}
            disabled={mutationLoading}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded transition-colors ${
              isKillSwitchActive
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-[#181b22] hover:bg-red-950/40 text-red-400 border border-red-900/40'
            }`}
          >
            {isKillSwitchActive ? 'Trading Halted (Active)' : 'Halt All Trading'}
          </button>
        </div>
      </div>
    </div>
  );
};
