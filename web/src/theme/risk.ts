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
    color: '#4ADE80',
    bg: 'bg-emerald-950/20',
    border: 'border-emerald-800/40',
    badgeBg: 'bg-emerald-500/10 text-[#4ADE80] border-emerald-500/30',
    text: 'text-[#4ADE80]',
    indicatorColor: 'bg-[#4ADE80]',
  },
  WARNING: {
    label: 'Warning',
    color: '#F5B942',
    bg: 'bg-amber-950/20',
    border: 'border-amber-800/40',
    badgeBg: 'bg-amber-500/10 text-[#F5B942] border-amber-500/30',
    text: 'text-[#F5B942]',
    indicatorColor: 'bg-[#F5B942]',
  },
  DANGER: {
    label: 'Danger',
    color: '#F5793A',
    bg: 'bg-orange-950/20',
    border: 'border-orange-800/40',
    badgeBg: 'bg-orange-500/10 text-[#F5793A] border-orange-500/30',
    text: 'text-[#F5793A]',
    indicatorColor: 'bg-[#F5793A]',
  },
  CRITICAL: {
    label: 'Critical',
    color: '#F0473E',
    bg: 'bg-red-950/20',
    border: 'border-red-800/40',
    badgeBg: 'bg-red-500/10 text-[#F0473E] border-red-500/30',
    text: 'text-[#F0473E]',
    indicatorColor: 'bg-[#F0473E]',
  },
};

export function getRiskTheme(level: RiskLevel): RiskTheme {
  return RISK_THEMES[level] || RISK_THEMES.HEALTHY;
}
