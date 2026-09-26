import React from 'react';

interface StatCardProps {
  label: string | React.ReactNode;
  value: string | React.ReactNode;
  subtitle?: string | React.ReactNode;
  change?: string | React.ReactNode;
  badge?: React.ReactNode;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtitle,
  change,
  badge,
}) => {
  return (
    <div className="bg-surface-1 border border-surface-2 p-5 rounded-lg flex flex-col justify-between shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase font-medium tracking-wider text-text-muted">
          {label}
        </span>
        {badge}
      </div>
      <div className="text-2xl font-bold font-mono tracking-tight text-text-primary tabular-nums">
        {value}
      </div>
      {(subtitle || change) && (
        <div className="mt-2.5 flex items-center justify-between text-xs text-text-muted font-mono">
          {subtitle && <span>{subtitle}</span>}
          {change && <span className="text-text-primary/90">{change}</span>}
        </div>
      )}
    </div>
  );
};
