import React from 'react';

interface StatCardProps {
  label: string;
  value: string | React.ReactNode;
  subtitle?: string;
  change?: string;
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
    <div className="bg-[#12141a] border border-[#232733] p-4 rounded-lg flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase font-medium tracking-wider text-neutral-400">
          {label}
        </span>
        {badge}
      </div>
      <div className="text-2xl font-bold font-mono tracking-tight text-white tabular-nums">
        {value}
      </div>
      {(subtitle || change) && (
        <div className="mt-2 flex items-center justify-between text-xs text-neutral-400 font-mono">
          {subtitle && <span>{subtitle}</span>}
          {change && <span className="text-neutral-300">{change}</span>}
        </div>
      )}
    </div>
  );
};
