export type RiskLevel = 'HEALTHY' | 'WARNING' | 'DANGER' | 'CRITICAL';

export interface RiskTheme {
  label: string;
  color: string;
  bg: string;
  border: string;
  badgeBg: string;
  text: string;
  indicatorColor: string;
}

export const RISK_THEMES: Record<RiskLevel, RiskTheme> = {
  HEALTHY: {
    label: 'Healthy',
    color: '#10B981',
    bg: 'bg-emerald-950/20',
    border: 'border-emerald-800/40',
    badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    text: 'text-emerald-400',
    indicatorColor: 'bg-emerald-500',
  },
  WARNING: {
    label: 'Warning',
    color: '#F59E0B',
    bg: 'bg-amber-950/20',
    border: 'border-amber-800/40',
    badgeBg: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    text: 'text-amber-400',
    indicatorColor: 'bg-amber-500',
  },
  DANGER: {
    label: 'Danger',
    color: '#F97316',
    bg: 'bg-orange-950/20',
    border: 'border-orange-800/40',
    badgeBg: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    text: 'text-orange-400',
    indicatorColor: 'bg-orange-500',
  },
  CRITICAL: {
    label: 'Critical',
    color: '#EF4444',
    bg: 'bg-red-950/20',
    border: 'border-red-800/40',
    badgeBg: 'bg-red-500/10 text-red-400 border-red-500/30',
    text: 'text-red-400',
    indicatorColor: 'bg-red-500',
  },
};

export function getRiskTheme(level: RiskLevel): RiskTheme {
  return RISK_THEMES[level] || RISK_THEMES.HEALTHY;
}
