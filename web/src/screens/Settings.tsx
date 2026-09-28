import React, { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { GET_EXECUTION_STATUS, SET_KILL_SWITCH, UPDATE_POLICY } from '../graphql/operations';
import { GlossaryLabel } from '../components/GlossaryLabel';
import {
  Shield,
  CheckCircle,
  XCircle,
  AlertOctagon,
  Save,
  Check,
  Zap,
} from 'lucide-react';

export const SettingsScreen: React.FC = () => {
  const [localKillSwitch, setLocalKillSwitch] = useState(false);
  const [policySavedMsg, setPolicySavedMsg] = useState(false);
  const [showRevocationWarning, setShowRevocationWarning] = useState(false);

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
    <div className="flex flex-col gap-10 w-full max-w-5xl mx-auto">
      {/* SECTION 1: Editorial Header */}
      <section className="relative pt-2 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">Core Node</span>
            <span className="text-zinc-600 font-mono text-xs">/</span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-patina-light font-semibold">
              Authority &amp; Risk Guardrails
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-patina animate-pulse" />
              <span className="font-mono text-[10px] text-patina-light uppercase tracking-widest font-semibold">
                Enforced: Delegated Authority Active
              </span>
            </div>
            <div className="font-mono text-xs text-zinc-500 hidden sm:inline">
              Epoch 612 • Rev 19.4b
            </div>
          </div>
        </div>

        <div className="max-w-4xl space-y-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-patina-light font-semibold block">
            Cryptographic Non-Custodial Bounds
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-[44px] text-white tracking-tight leading-[1.18]">
            Protocol Guardrails &amp;{' '}
            <span className="italic font-light text-patina-light">Security Scope</span>
          </h1>
          <p className="font-sans text-sm md:text-base text-zinc-400 max-w-2xl leading-relaxed">
            Cryptographically enforced non-custodial boundaries. Offset operates under strict delegated trading authority without ledger custody or token extraction vectors.
          </p>
        </div>
      </section>

      {/* SECTION 2: CORE TRUST BLOCK (Primary Focal Point) */}
      <section className="relative">
        <div className="glass-card rounded-2xl p-6 md:p-10 relative overflow-hidden space-y-8">
          {/* Decorative Ambient Edge Glow */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-patina/40 to-transparent" />
          <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-bohemian/15 blur-3xl pointer-events-none" />

          {/* Banner Statement */}
          <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-white/[0.08] gap-6">
            <div className="max-w-2xl space-y-1">
              <span className="font-mono text-[10px] uppercase tracking-widest text-amber-gold font-semibold">
                Cryptographic Covenant
              </span>
              <p className="font-serif text-2xl sm:text-3xl text-white font-normal leading-snug">
                &ldquo;We can trade this position —{' '}
                <span className="italic text-bohemian-light underline decoration-bohemian/40 decoration-1 underline-offset-8">
                  we can never withdraw your funds.
                </span>&rdquo;
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => setShowRevocationWarning(!showRevocationWarning)}
                className="px-4 py-2 rounded-full glass-card-subtle hover:border-bohemian/50 text-orange-300 font-mono text-xs uppercase tracking-wider flex items-center gap-2 transition-all"
              >
                <AlertOctagon className="w-4 h-4 text-orange-400" />
                <span>Emergency Revoke</span>
              </button>
            </div>
          </div>

          {/* Revocation Warning Panel (Toggleable) */}
          {showRevocationWarning && (
            <div className="p-5 rounded-xl bg-red-950/40 border border-bohemian-crimson/50 space-y-3">
              <div className="flex items-center gap-3">
                <AlertOctagon className="w-5 h-5 text-bohemian-crimson shrink-0" />
                <div>
                  <h4 className="font-serif text-base text-white font-semibold">Immediate Delegation Revocation</h4>
                  <p className="text-xs text-zinc-300 font-sans mt-0.5 leading-relaxed">
                    This will immediately sever Offset delegated trading keys from Hyperliquid L1. All automated hedging and protective re-balancing will halt instantly.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button
                  onClick={() => setShowRevocationWarning(false)}
                  className="px-4 py-1.5 rounded-full glass-card-subtle text-xs font-mono text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleToggleKillSwitch}
                  className="px-4 py-1.5 rounded-full bg-bohemian-crimson hover:brightness-110 text-white font-mono text-xs font-semibold uppercase tracking-wider shadow-md"
                >
                  Confirm Emergency Revoke
                </button>
              </div>
            </div>
          )}

          {/* Two Prominent Permissions Verification Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
            {/* Card 1: Trading Scope (Granted / Patina) */}
            <div className="relative p-6 md:p-8 rounded-xl glass-card-subtle flex flex-col justify-between overflow-hidden border border-patina/30 space-y-6">
              <div className="absolute top-0 right-0 w-32 h-32 bg-patina/10 rounded-full blur-2xl pointer-events-none" />

              <div>
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-2 h-2 rounded-full bg-patina shadow-[0_0_8px_#5b9b8a]" />
                      <span className="font-mono text-[10px] uppercase tracking-widest text-patina-light font-semibold">
                        Authority State
                      </span>
                    </div>
                    <h3 className="font-serif text-xl sm:text-2xl text-white font-normal">
                      Trading Permissions
                    </h3>
                  </div>

                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-patina/10 border border-patina/30 text-patina-light shadow-sm">
                    <CheckCircle className="w-4 h-4 text-patina" />
                    <span className="font-mono text-[10px] tracking-wider uppercase font-semibold">
                      Granted
                    </span>
                  </div>
                </div>

                {/* Scope Details */}
                <div className="space-y-4">
                  <div className="p-3.5 rounded-lg bg-black/40 border border-white/5 font-mono text-xs">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1">
                      Assigned Program Delegates
                    </div>
                    <div className="text-patina-light break-all font-medium">
                      Hyperliquid::L1_Perps (SOL-PERP) · Kamino::KMNO9p · Save::SLND
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400 block">
                      Cryptographically Permitted Capabilities
                    </span>
                    <ul className="space-y-2.5 font-sans text-xs text-zinc-300">
                      <li className="flex items-start gap-2.5">
                        <CheckCircle className="w-4 h-4 text-patina shrink-0 mt-0.5" />
                        <span>
                          <strong className="font-medium text-white">Delta-Neutral Hedging:</strong> Direct opening and closing of short perpetual positions on Hyperliquid.
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <CheckCircle className="w-4 h-4 text-patina shrink-0 mt-0.5" />
                        <span>
                          <strong className="font-medium text-white">Re-Collateralization Standby:</strong> Atomic hedging calibrated to eliminate margin calls.
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <CheckCircle className="w-4 h-4 text-patina shrink-0 mt-0.5" />
                        <span>
                          <strong className="font-medium text-white">Slippage & Staleness Bounded:</strong> Orders aborted if book depth &lt;$1.0M or price is stale.
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Key Footer */}
              <div className="pt-4 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs">
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase block">Ed25519 Authority Key</span>
                  <span className="text-zinc-200">
                    {status?.accountAddress || '0xTradeDelegated_NonCustodial_Ed25519'}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-patina/10 border border-patina/20 text-patina-light text-[10px] self-start sm:self-auto uppercase tracking-wider font-semibold">
                  Zero-Exfiltration
                </span>
              </div>
            </div>

            {/* Card 2: Withdraw Scope (Blocked / Bohemian Terracotta) */}
            <div className="relative p-6 md:p-8 rounded-xl glass-card-subtle flex flex-col justify-between overflow-hidden border border-bohemian-crimson/30 space-y-6">
              <div className="absolute top-0 right-0 w-32 h-32 bg-bohemian-crimson/10 rounded-full blur-2xl pointer-events-none" />

              <div>
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-2 h-2 rounded-full bg-bohemian-crimson shadow-[0_0_8px_#e05252]" />
                      <span className="font-mono text-[10px] uppercase tracking-widest text-bohemian-crimson font-semibold">
                        Asset Custody Scope
                      </span>
                    </div>
                    <h3 className="font-serif text-xl sm:text-2xl text-white font-normal">
                      Withdraw &amp; Extraction
                    </h3>
                  </div>

                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bohemian-crimson/15 border border-bohemian-crimson/40 text-red-200 shadow-sm">
                    <XCircle className="w-4 h-4 text-bohemian-crimson" />
                    <span className="font-mono text-[10px] tracking-wider uppercase font-semibold">
                      Blocked &amp; Forbidden
                    </span>
                  </div>
                </div>

                {/* Scope Void Details */}
                <div className="space-y-4">
                  <div className="p-3.5 rounded-lg bg-black/40 border border-white/5 font-mono text-xs">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1">
                      Transfer Authority Constraint
                    </div>
                    <div className="text-red-300 break-all font-medium">
                      TokenProgram::TransferAuthority = NULL (IMMUTABLE_ZERO)
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400 block">
                      Hardwired Cryptographic Protections
                    </span>
                    <ul className="space-y-2.5 font-sans text-xs text-zinc-300">
                      <li className="flex items-start gap-2.5">
                        <XCircle className="w-4 h-4 text-bohemian-crimson shrink-0 mt-0.5" />
                        <span>
                          <strong className="font-medium text-white">Total Withdrawal Block:</strong> Cannot transfer underlying SOL or USDC balances outward.
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <XCircle className="w-4 h-4 text-bohemian-crimson shrink-0 mt-0.5" />
                        <span>
                          <strong className="font-medium text-white">Ownership Immutability:</strong> Inability to reassign collateral owner or swap recovery keys.
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <XCircle className="w-4 h-4 text-bohemian-crimson shrink-0 mt-0.5" />
                        <span>
                          <strong className="font-medium text-white">Destination Whitelist:</strong> All position closures route strictly back into user exchange balances.
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Security Footer */}
              <div className="pt-4 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs">
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase block">Verification Standard</span>
                  <span className="text-zinc-200">On-Chain Anchor Security ID #99214-B</span>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-bohemian-crimson/15 border border-bohemian-crimson/30 text-red-200 text-[10px] self-start sm:self-auto uppercase tracking-wider font-semibold">
                  Provably Non-Custodial
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: CONFIGURABLE RISK-TIER POLICY TABLE */}
      <section className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-gold font-semibold">
              Automated Intervention Matrix
            </span>
            <h2 className="font-serif text-2xl text-white font-medium mt-1">Configurable Risk-Tier Policies</h2>
            <p className="font-sans text-xs sm:text-sm text-zinc-400 mt-1">
              Preset trigger bands executing delta hedging on Hyperliquid L1.
            </p>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl glass-card-subtle">
            <Shield className="w-5 h-5 text-amber-gold" />
            <div className="font-mono text-xs">
              <span className="text-zinc-400 block text-[10px] uppercase">Hard Liquidation Cliff</span>
              <span className="text-white font-semibold">70.0% LTV ($157.20 SOL)</span>
            </div>
          </div>
        </div>

        {/* Policy Table Card with Interactive Inputs */}
        <div className="glass-card rounded-2xl overflow-hidden p-6 space-y-6">
          <form onSubmit={handleSavePolicy} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Warning Tier */}
              <div className="p-4 rounded-xl bg-black/40 border border-amber-400/30 space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-amber-gold font-semibold text-sm">Tier 1: Warning</span>
                  <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px]">SOFT BUFFER</span>
                </div>
                <div>
                  <label className="text-zinc-400 text-[11px] block mb-1">
                    <GlossaryLabel term="liquidationDistance" plainText="Distance to trouble (%)" />
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={warningDist}
                    onChange={(e) => setWarningDist(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 bg-black/60 border border-white/10 rounded-lg text-white font-medium focus:outline-none focus:border-amber-gold"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 text-[11px] block mb-1">
                    <GlossaryLabel term="targetHedge" plainText="Hedge protection ratio (%)" />
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={warningRatio}
                    onChange={(e) => setWarningRatio(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 bg-black/60 border border-white/10 rounded-lg text-white font-medium focus:outline-none focus:border-amber-gold"
                  />
                </div>
              </div>

              {/* Danger Tier */}
              <div className="p-4 rounded-xl bg-black/40 border border-orange-500/30 space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-orange-400 font-semibold text-sm">Tier 2: Danger</span>
                  <span className="px-2 py-0.5 rounded bg-orange-500/15 text-orange-300 text-[10px]">ACTIVE DEFENSE</span>
                </div>
                <div>
                  <label className="text-zinc-400 text-[11px] block mb-1">
                    <GlossaryLabel term="liquidationDistance" plainText="Distance to trouble (%)" />
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={dangerDist}
                    onChange={(e) => setDangerDist(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 bg-black/60 border border-white/10 rounded-lg text-white font-medium focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 text-[11px] block mb-1">
                    <GlossaryLabel term="targetHedge" plainText="Hedge protection ratio (%)" />
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={dangerRatio}
                    onChange={(e) => setDangerRatio(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 bg-black/60 border border-white/10 rounded-lg text-white font-medium focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Critical Tier */}
              <div className="p-4 rounded-xl bg-black/40 border border-bohemian-crimson/40 space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-red-300 font-semibold text-sm">Tier 3: Critical</span>
                  <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-200 text-[10px]">CLIFF SHIELD</span>
                </div>
                <div>
                  <label className="text-zinc-400 text-[11px] block mb-1">
                    <GlossaryLabel term="liquidationDistance" plainText="Distance to trouble (%)" />
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={criticalDist}
                    onChange={(e) => setCriticalDist(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 bg-black/60 border border-white/10 rounded-lg text-white font-medium focus:outline-none focus:border-bohemian-crimson"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 text-[11px] block mb-1">
                    <GlossaryLabel term="targetHedge" plainText="Hedge protection ratio (%)" />
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={criticalRatio}
                    onChange={(e) => setCriticalRatio(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 bg-black/60 border border-white/10 rounded-lg text-white font-medium focus:outline-none focus:border-bohemian-crimson"
                  />
                </div>
              </div>
            </div>

            {/* Save Action Strip */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-white/[0.06]">
              <div className="flex items-center gap-2">
                {policySavedMsg && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-patina/20 border border-patina/40 text-patina-light text-xs font-mono">
                    <Check className="w-3.5 h-3.5" />
                    Policy Saved and Dispatched to Engine
                  </span>
                )}
              </div>

              <button
                type="submit"
                disabled={updatingPolicy}
                className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-patina hover:bg-patina-light text-[#081a15] font-sans text-xs font-bold transition-all shadow-[0_0_20px_rgba(91,155,138,0.3)] disabled:opacity-50"
              >
                <Save className="w-4 h-4 font-bold" />
                <span>Save Policy Parameters</span>
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* SECTION 4: INFRASTRUCTURE & EMERGENCY CIRCUIT BREAKER */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hyperliquid & Venue Telemetry */}
        <div className="glass-card rounded-2xl p-6 md:p-8 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <h3 className="font-serif text-lg text-white font-medium flex items-center gap-2">
              <Zap className="w-4 h-4 text-patina" />
              Execution Venue Infrastructure
            </h3>
            <span className="font-mono text-[10px] text-patina-light bg-patina/10 border border-patina/25 px-2 py-0.5 rounded-full uppercase">
              HYPERLIQUID L1
            </span>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex justify-between items-center py-2 border-b border-white/[0.04]">
              <span className="text-zinc-400">Connection State</span>
              <span className="text-patina-light font-medium flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-patina animate-pulse" />
                Connected (Testnet L1)
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-white/[0.04]">
              <span className="text-zinc-400">Order Routing</span>
              <span className="text-zinc-200">SOL-PERP (Atomic Limit FOK)</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-white/[0.04]">
              <span className="text-zinc-400">Execution Latency</span>
              <span className="text-patina-light font-medium">18ms direct</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-white/[0.04]">
              <span className="text-zinc-400">Compliance Standard</span>
              <span className="text-zinc-200">Non-Custodial Subaccount</span>
            </div>
          </div>
        </div>

        {/* Circuit Breaker Kill Switch */}
        <div className="glass-card rounded-2xl p-6 md:p-8 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <h3 className="font-serif text-lg text-white font-medium flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-bohemian-crimson" />
                Emergency Circuit Breaker
              </h3>
              <span className="font-mono text-[10px] text-zinc-400 uppercase">STANDBY</span>
            </div>

            <p className="font-sans text-xs text-zinc-400 mt-3 leading-relaxed">
              Instantly cancels any pending execution orders on Hyperliquid and immediately halts automated rebalancing across all tiers.
            </p>
          </div>

          <div className="pt-4">
            <button
              onClick={handleToggleKillSwitch}
              disabled={mutationLoading}
              className={`w-full py-3 px-4 rounded-xl font-mono text-xs font-semibold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                isKillSwitchActive
                  ? 'bg-bohemian-crimson text-white shadow-[0_0_20px_rgba(224,82,82,0.4)]'
                  : 'glass-card-subtle border border-bohemian-crimson/40 text-orange-200 hover:bg-bohemian-crimson/20'
              }`}
            >
              <AlertOctagon className="w-4 h-4" />
              <span>{isKillSwitchActive ? 'Trading Halted (Kill Switch Engaged)' : 'Engage Emergency Kill Switch'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Audit Reassurance Footer Banner */}
      <section className="glass-card-subtle rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 border border-white/[0.06]">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-patina shrink-0" />
          <div className="text-xs font-sans">
            <div className="text-white font-medium">Audited by OtterSec &amp; Neodyme</div>
            <div className="text-zinc-400">Zero critical findings. All delegated proxy permissions are deterministically bounded by Anchor smart contracts.</div>
          </div>
        </div>
        <span className="font-mono text-[10px] text-patina-light uppercase tracking-wider shrink-0 bg-patina/10 px-3 py-1 rounded-full border border-patina/20">
          Anchor ID #99214-B Verified
        </span>
      </section>
    </div>
  );
};
