import React, { useState } from 'react';
import { DashboardScreen } from './screens/Dashboard';
import { ExecutionScreen } from './screens/Execution';
import { ReplayScreen } from './screens/Replay';
import { SettingsScreen } from './screens/Settings';
import { Shield } from 'lucide-react';

type ScreenTab = 'dashboard' | 'execution' | 'replay' | 'settings';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ScreenTab>('dashboard');

  return (
    <div className="min-h-screen bg-[#0b0b0f] text-on-surface flex flex-col font-sans selection:bg-patina selection:text-[#0a1a15] relative overflow-x-hidden">
      {/* Ambient Light Mesh Atmosphere */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Top-left subtle Bohemian Terracotta / Copper bloom */}
        <div className="absolute -top-40 -left-20 w-[640px] h-[540px] rounded-full bg-gradient-to-br from-[#a35846]/18 to-transparent blur-[130px] opacity-70" />
        {/* Center-right Luminous Golden & Patina celestial streak */}
        <div className="absolute top-[8%] -right-40 w-[780px] h-[600px] rounded-full bg-gradient-to-bl from-[#ffb873]/12 via-[#5b9b8a]/14 to-transparent blur-[140px] opacity-80" />
        {/* Mid-ground warm ambient sweep */}
        <div className="absolute top-[48%] left-1/3 w-[800px] h-[380px] rounded-full bg-gradient-to-tr from-[#5b9b8a]/08 via-[#c86e59]/10 to-transparent blur-[160px] opacity-60" />
      </div>

      {/* Floating Header & Floating Pill Navigation Bar */}
      <header className="fixed top-0 left-0 w-full z-50 pointer-events-none">
        <div className="h-20 w-full max-w-[1440px] mx-auto px-4 md:px-8 lg:px-12 flex items-center justify-between pointer-events-auto">
          {/* Brand Mark: Offset Liquidation Defense */}
          <div
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-3 group cursor-pointer"
          >
            <div className="relative w-9 h-9 rounded-xl glass-card flex items-center justify-center p-1.5 border border-white/10 group-hover:border-patina/40 transition-all duration-300 shadow-[0_4px_16px_rgba(91,155,138,0.15)]">
              <Shield className="w-5 h-5 text-patina-light group-hover:scale-105 transition-transform" />
            </div>
            <div className="flex flex-col">
              <span className="font-serif text-[19px] tracking-tight font-medium text-white group-hover:text-patina-light transition-colors leading-none">
                Offset
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-400 mt-1 font-medium">
                Liquidation Defense
              </span>
            </div>
          </div>

          {/* Center Floating Pill Bar */}
          <div className="hidden sm:flex justify-center flex-1 max-w-[440px] px-2">
            <nav className="w-full max-w-[410px] h-10 bg-zinc-950/75 backdrop-blur-2xl border border-white/10 rounded-full shadow-[0_12px_36px_-6px_rgba(0,0,0,0.85)] flex items-center justify-between p-1">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex-1 text-center py-1 text-xs transition-all duration-200 rounded-full ${
                  activeTab === 'dashboard'
                    ? 'font-medium bg-white/10 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.25)] border border-white/10'
                    : 'font-normal text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => setActiveTab('execution')}
                className={`flex-1 text-center py-1 text-xs transition-all duration-200 rounded-full ${
                  activeTab === 'execution'
                    ? 'font-medium bg-white/10 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.25)] border border-white/10'
                    : 'font-normal text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Execution
              </button>
              <button
                onClick={() => setActiveTab('replay')}
                className={`flex-1 text-center py-1 text-xs transition-all duration-200 rounded-full ${
                  activeTab === 'replay'
                    ? 'font-medium bg-white/10 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.25)] border border-white/10'
                    : 'font-normal text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Replay
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`flex-1 text-center py-1 text-xs transition-all duration-200 rounded-full ${
                  activeTab === 'settings'
                    ? 'font-medium bg-white/10 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.25)] border border-white/10'
                    : 'font-normal text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Settings
              </button>
            </nav>
          </div>

          {/* Wallet & Institutional Telemetry Pill */}
          <div className="flex items-center gap-3">
            <div className="hidden xl:flex flex-col items-end mr-1">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-patina animate-pulse shadow-[0_0_8px_#5b9b8a]" />
                <span className="font-mono text-[11px] text-patina-light tracking-wide font-medium">
                  Solana Mainnet-Beta
                </span>
              </div>
              <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
                Block 264,819,042
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full glass-card border border-white/10 hover:border-white/20 transition-all cursor-pointer">
              <span className="font-mono text-[9px] tracking-widest text-zinc-400 font-semibold uppercase">
                WALLET
              </span>
              <span className="font-mono text-xs text-zinc-200 font-medium">
                7xK...9mPq
              </span>
              <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-patina-dim to-patina flex items-center justify-center ml-0.5 shadow-sm">
                <Shield className="w-3 h-3 text-white" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Screen Content Viewport */}
      <main className="relative z-10 w-full pt-24 pb-16 min-h-[calc(100vh-80px)]">
        <div className="w-full max-w-[1440px] mx-auto px-4 md:px-8 lg:px-12">
          {activeTab === 'dashboard' && <DashboardScreen onNavigate={setActiveTab} />}
          {activeTab === 'execution' && <ExecutionScreen />}
          {activeTab === 'replay' && <ReplayScreen />}
          {activeTab === 'settings' && <SettingsScreen />}
        </div>
      </main>

      {/* Editorial Footer */}
      <footer className="w-full border-t border-white/[0.06] bg-[#07070a]/90 backdrop-blur-md relative z-10">
        <div className="w-full max-w-[1440px] mx-auto px-4 md:px-8 lg:px-12 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-zinc-400 uppercase tracking-widest">
              OFFSET CORE V2.4.1
            </span>
            <span className="text-zinc-700 font-mono">•</span>
            <span className="font-mono text-[11px] text-zinc-400 uppercase tracking-widest">
              INSTITUTIONAL DEFENSE NODE
            </span>
          </div>
          <div className="flex items-center gap-6 font-mono text-[11px] text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-patina" />
              HEARTBEAT 12ms
            </span>
            <span>RPC LATENCY 44ms</span>
            <span className="text-zinc-500 font-sans">© 2024 Offset Protocol</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
