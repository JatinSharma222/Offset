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
    <div className="min-h-screen bg-surface-0 text-text-primary flex flex-col font-sans">
      {/* Top Instrument Navigation Bar */}
      <header className="border-b border-surface-2 bg-surface-1 px-6 py-3.5 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-brand/10 border border-brand/30 rounded">
              <Shield className="w-5 h-5 text-brand" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-text-primary">Offset</span>
              <span className="text-[10px] text-text-muted block -mt-1 font-mono uppercase tracking-wider">
                Liquidation Defense
              </span>
            </div>
          </div>

          <nav className="flex items-center gap-1.5 border-l border-surface-2 pl-6">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold tracking-wider uppercase transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-surface-2 text-text-primary border border-brand/40 shadow-sm'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-2/60'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-brand" />
              Dashboard
            </button>

            <button
              onClick={() => setActiveTab('execution')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold tracking-wider uppercase transition-colors ${
                activeTab === 'execution'
                  ? 'bg-surface-2 text-text-primary border border-brand/40 shadow-sm'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-2/60'
              }`}
            >
              <Terminal className="w-3.5 h-3.5 text-brand" />
              Execution Log
            </button>

            <button
              onClick={() => setActiveTab('replay')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold tracking-wider uppercase transition-colors ${
                activeTab === 'replay'
                  ? 'bg-surface-2 text-text-primary border border-brand/40 shadow-sm'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-2/60'
              }`}
            >
              <PlayCircle className="w-3.5 h-3.5 text-brand" />
              Replay
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold tracking-wider uppercase transition-colors ${
                activeTab === 'settings'
                  ? 'bg-surface-2 text-text-primary border border-brand/40 shadow-sm'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-2/60'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-brand" />
              Settings
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-semibold tracking-wider text-risk-healthy bg-emerald-500/10 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-risk-healthy animate-pulse" />
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
      <footer className="border-t border-surface-2 py-2.5 px-6 text-[11px] font-mono text-text-muted flex justify-between items-center bg-surface-1">
        <div>Solana Position: Kamino Vault #4829 · Primary Venue: Hyperliquid L1 (SOL-PERP)</div>
        <div>Deterministic Risk Engine v0.1.0 · Trading-Only Permission (Zero-Custody)</div>
      </footer>
    </div>
  );
};
