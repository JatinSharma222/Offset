import React, { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { GET_EXECUTION_STATUS, SET_KILL_SWITCH, UPDATE_POLICY } from '../graphql/operations';
import { Check, X, Shield, AlertOctagon, Sliders, Save, Lock } from 'lucide-react';
import { GlossaryLabel } from '../components/GlossaryLabel';

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
      <div className="pb-3 border-b border-surface-2">
        <h2 className="text-lg font-bold text-text-primary tracking-tight">Configuration & Custody Permissions</h2>
        <p className="text-xs text-text-muted font-mono mt-1">
          Offset operates under a zero-custody delegation architecture enforced on Hyperliquid L1.
        </p>
      </div>

      {/* Custody Reassurance Banner */}
      <div className="p-5 bg-surface-1 border border-surface-2 rounded-xl flex items-start gap-3.5">
        <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-risk-healthy shrink-0">
          <Shield className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-text-primary">You keep custody. We trade. We cannot withdraw.</h4>
          <p className="text-xs text-text-muted mt-1 leading-relaxed">
            All positions are held in your own exchange account. The automated engine uses a restricted sub-account key
            with mathematical constraints guaranteeing funds can never be withdrawn or transferred elsewhere.
          </p>
        </div>
      </div>

      {/* Custody & Permissions Section */}
      <div className="bg-surface-1 border border-surface-2 rounded-xl p-6">
        <div className="flex items-center gap-2 pb-3 border-b border-surface-2 text-sm font-semibold text-text-primary">
          <Lock className="w-4 h-4 text-brand" />
          <span>Execution Venue & Custody Boundary</span>
        </div>

        <div className="mt-4 space-y-4 text-xs font-mono">
          <div className="flex justify-between items-center py-2.5 border-b border-surface-2/60">
            <span className="text-text-muted">Hyperliquid connection</span>
            <span className="flex items-center gap-1.5 text-risk-healthy font-semibold">
              <span className="w-2 h-2 rounded-full bg-risk-healthy" />
              {status?.connected ? 'Connected (Testnet)' : 'Connected'}
            </span>
          </div>

          <div className="flex justify-between items-center py-2.5 border-b border-surface-2/60">
            <span className="text-text-muted">Master protocol account</span>
            <span className="text-text-primary">0x71C...b29F</span>
          </div>

          <div className="flex justify-between items-center py-2.5 border-b border-surface-2/60">
            <GlossaryLabel term="agentWallet" />
            <span className="text-text-primary">
              {status?.accountAddress || '0x84Ae...01Cd (Offset Trading Key)'}
            </span>
          </div>

          {/* Permissions trust block: Trading ✓ / Withdrawal ✗ */}
          <div className="p-4 bg-surface-0 border border-surface-2 rounded-lg space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-text-primary font-semibold block">Trading permissions</span>
                <span className="text-[11px] text-text-muted font-sans">
                  Allowed to open and close protective positions
                </span>
              </div>
              <span className="flex items-center gap-1.5 text-risk-healthy font-bold bg-emerald-500/10 px-3 py-1 rounded border border-emerald-500/30">
                <Check className="w-4 h-4" /> Granted
              </span>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-surface-2/60">
              <div>
                <span className="text-risk-critical font-bold block">Withdrawal permissions</span>
                <span className="text-[11px] text-text-muted font-sans">
                  We cannot move your funds — structurally impossible at exchange level
                </span>
              </div>
              <span className="flex items-center gap-1.5 text-risk-critical font-bold bg-red-500/10 px-3 py-1 rounded border border-red-500/30">
                <X className="w-4 h-4 stroke-[3]" /> Denied
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Protection Policy Editor Section */}
      <div className="bg-surface-1 border border-surface-2 rounded-xl p-6">
        <div className="flex items-center justify-between pb-3 border-b border-surface-2">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Sliders className="w-4 h-4 text-brand" />
            Protection Policy
          </h3>
          {policySavedMsg && (
            <span className="text-xs font-mono text-risk-healthy flex items-center gap-1 bg-emerald-500/10 px-2.5 py-0.5 rounded border border-emerald-500/20">
              <Check className="w-3 h-3" /> Policy Saved & Applied
            </span>
          )}
        </div>

        <form onSubmit={handleSavePolicy} className="mt-4 space-y-4 text-xs font-mono">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Warning Tier */}
            <div className="p-3.5 bg-surface-0 border border-risk-warning/30 rounded-lg">
              <div className="font-bold text-risk-warning mb-2 flex items-center justify-between">
                <span>Warning</span>
                <span className="text-[10px] bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">Tier 1</span>
              </div>
              <div className="space-y-2 text-text-primary">
                <div>
                  <label className="text-[11px] text-text-muted block mb-1">
                    <GlossaryLabel term="liquidationDistance" plainText="How close to trouble (%)" />
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={warningDist}
                    onChange={(e) => setWarningDist(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1 bg-surface-2 border border-surface-2 rounded text-text-primary focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-text-muted block mb-1">
                    <GlossaryLabel term="targetHedge" plainText="Protection ratio (%)" />
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={warningRatio}
                    onChange={(e) => setWarningRatio(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1 bg-surface-2 border border-surface-2 rounded text-text-primary focus:outline-none focus:border-brand"
                  />
                </div>
              </div>
            </div>

            {/* Danger Tier */}
            <div className="p-3.5 bg-surface-0 border border-risk-danger/30 rounded-lg">
              <div className="font-bold text-risk-danger mb-2 flex items-center justify-between">
                <span>Danger</span>
                <span className="text-[10px] bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20">Tier 2</span>
              </div>
              <div className="space-y-2 text-text-primary">
                <div>
                  <label className="text-[11px] text-text-muted block mb-1">
                    <GlossaryLabel term="liquidationDistance" plainText="How close to trouble (%)" />
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={dangerDist}
                    onChange={(e) => setDangerDist(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1 bg-surface-2 border border-surface-2 rounded text-text-primary focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-text-muted block mb-1">
                    <GlossaryLabel term="targetHedge" plainText="Protection ratio (%)" />
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={dangerRatio}
                    onChange={(e) => setDangerRatio(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1 bg-surface-2 border border-surface-2 rounded text-text-primary focus:outline-none focus:border-brand"
                  />
                </div>
              </div>
            </div>

            {/* Critical Tier */}
            <div className="p-3.5 bg-surface-0 border border-risk-critical/30 rounded-lg">
              <div className="font-bold text-risk-critical mb-2 flex items-center justify-between">
                <span>Critical</span>
                <span className="text-[10px] bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">Tier 3</span>
              </div>
              <div className="space-y-2 text-text-primary">
                <div>
                  <label className="text-[11px] text-text-muted block mb-1">
                    <GlossaryLabel term="liquidationDistance" plainText="How close to trouble (%)" />
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={criticalDist}
                    onChange={(e) => setCriticalDist(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1 bg-surface-2 border border-surface-2 rounded text-text-primary focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-text-muted block mb-1">
                    <GlossaryLabel term="targetHedge" plainText="Protection ratio (%)" />
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={criticalRatio}
                    onChange={(e) => setCriticalRatio(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1 bg-surface-2 border border-surface-2 rounded text-text-primary focus:outline-none focus:border-brand"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={updatingPolicy}
              className="flex items-center gap-1.5 px-4 py-2 rounded bg-brand hover:bg-brand-hover text-white font-bold transition-colors disabled:opacity-50 shadow-sm"
            >
              <Save className="w-3.5 h-3.5" />
              Save Policy Changes
            </button>
          </div>
        </form>
      </div>

      {/* Emergency Kill Switch */}
      <div className="bg-surface-1 border border-surface-2 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-risk-critical" /> Circuit breaker / kill switch
            </h3>
            <p className="text-xs text-text-muted font-mono mt-1">
              Instantly cancels open orders and halts automated execution across all tiers.
            </p>
          </div>

          <button
            onClick={handleToggleKillSwitch}
            disabled={mutationLoading}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded transition-colors ${
              isKillSwitchActive
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-surface-2 hover:bg-red-950/40 text-risk-critical border border-risk-critical/40'
            }`}
          >
            {isKillSwitchActive ? 'Trading Halted (Active)' : 'Halt All Trading'}
          </button>
        </div>
      </div>
    </div>
  );
};
