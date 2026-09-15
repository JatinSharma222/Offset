import React, { useState } from 'react';
import { DashboardScreen } from './screens/Dashboard';
import { ExecutionScreen } from './screens/Execution';
import { ReplayScreen } from './screens/Replay';
import { SettingsScreen } from './screens/Settings';
import { Shield, Activity, Terminal, PlayCircle, Sliders } from 'lucide-react';

type ScreenTab = 'dashboard' | 'execution' | 'replay' | 'settings';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ScreenTab>('dashboard');

  return (
    <div className="min-h-screen bg-[#0a0b0e] text-[#e1e4ea] flex flex-col">
      {/* Top Instrument Navigation Bar */}
      <header className="border-b border-[#232733] bg-[#0d0f14] px-6 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded">
              <Shield className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-white font-mono">Offset</span>
              <span className="text-[10px] text-neutral-500 block -mt-1 font-mono uppercase">Liquidation Defense</span>
            </div>
          </div>

          <nav className="flex items-center gap-1 border-l border-[#232733] pl-6">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold tracking-wider uppercase transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-[#181b22] text-white border border-[#333b4d]'
                  : 'text-neutral-400 hover:text-white hover:bg-[#12141a]'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Dashboard
            </button>

            <button
              onClick={() => setActiveTab('execution')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold tracking-wider uppercase transition-colors ${
                activeTab === 'execution'
                  ? 'bg-[#181b22] text-white border border-[#333b4d]'
                  : 'text-neutral-400 hover:text-white hover:bg-[#12141a]'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              Execution Log
            </button>

            <button
              onClick={() => setActiveTab('replay')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold tracking-wider uppercase transition-colors ${
                activeTab === 'replay'
                  ? 'bg-[#181b22] text-white border border-[#333b4d]'
                  : 'text-neutral-400 hover:text-white hover:bg-[#12141a]'
              }`}
            >
              <PlayCircle className="w-3.5 h-3.5 text-indigo-400" />
              Replay
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold tracking-wider uppercase transition-colors ${
                activeTab === 'settings'
                  ? 'bg-[#181b22] text-white border border-[#333b4d]'
                  : 'text-neutral-400 hover:text-white hover:bg-[#12141a]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Settings
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-semibold tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            PROTECTION ACTIVE
          </span>
        </div>
      </header>

      {/* Screen Content Viewport */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
        {activeTab === 'dashboard' && <DashboardScreen />}
        {activeTab === 'execution' && <ExecutionScreen />}
        {activeTab === 'replay' && <ReplayScreen />}
        {activeTab === 'settings' && <SettingsScreen />}
      </main>

      {/* Low-profile status footer */}
      <footer className="border-t border-[#1a1d26] py-2 px-6 text-[11px] font-mono text-neutral-500 flex justify-between items-center bg-[#0d0f14]">
        <div>Solana Position: Kamino Vault #4829 · Primary Venue: Hyperliquid L1 (SOL-PERP)</div>
        <div>Deterministic Risk Engine v0.1.0 · Zero-Custody Trading Key</div>
      </footer>
    </div>
  );
};
