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
    color: '#5b9b8a',
    bg: 'bg-patina/10',
    border: 'border-patina/30',
    badgeBg: 'bg-patina/10 text-patina-light border border-patina/30 shadow-[0_0_12px_rgba(91,155,138,0.2)]',
    text: 'text-patina-light',
    indicatorColor: 'bg-patina',
  },
  WARNING: {
    label: 'Warning',
    color: '#ffb873',
    bg: 'bg-amber-500/10',
    border: 'border-amber-400/30',
    badgeBg: 'bg-amber-500/15 text-amber-300 border border-amber-400/30 shadow-[0_0_12px_rgba(255,184,115,0.2)]',
    text: 'text-amber-gold',
    indicatorColor: 'bg-amber-gold',
  },
  DANGER: {
    label: 'Danger',
    color: '#f5793a',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    badgeBg: 'bg-orange-500/15 text-orange-300 border border-orange-500/30 shadow-[0_0_12px_rgba(245,121,58,0.2)]',
    text: 'text-orange-400',
    indicatorColor: 'bg-orange-500',
  },
  CRITICAL: {
    label: 'Critical',
    color: '#e05252',
    bg: 'bg-red-500/15',
    border: 'border-red-500/40',
    badgeBg: 'bg-bohemian-crimson/25 text-red-200 border border-bohemian-crimson/60 shadow-[0_0_20px_rgba(224,82,82,0.35)]',
    text: 'text-red-300',
    indicatorColor: 'bg-bohemian-crimson',
  },
};

export function getRiskTheme(level: RiskLevel): RiskTheme {
  return RISK_THEMES[level] || RISK_THEMES.HEALTHY;
}
