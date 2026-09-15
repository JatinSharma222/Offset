import React from 'react';
import { RiskLevel, getRiskTheme } from '../theme/risk';

interface RiskBadgeProps {
  level: RiskLevel;
  className?: string;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ level, className = '' }) => {
  const theme = getRiskTheme(level);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider border ${theme.badgeBg} ${className}`}
    >
      <span className={`w-2 h-2 rounded-full ${theme.indicatorColor}`} />
      {theme.label}
    </span>
  );
};
