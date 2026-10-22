import React from 'react';

type KpiCardProps = {
  title: string;
  value: string | number;
  subtext?: string;
  icon: React.ReactNode;
  badge?: {
    text: string;
    variant: 'success' | 'warning' | 'info' | 'purple' | 'orange';
  };
  highlight?: boolean;
  className?: string;
};

export default function KpiCard({
  title,
  value,
  subtext,
  icon,
  badge,
  highlight = false,
  className = '',
}: KpiCardProps) {
  const badgeColors = {
    success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    info: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    purple: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    orange: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  };

  return (
    <div
      className={`rounded-2xl p-3.5 sm:p-5 border transition-all duration-300 relative overflow-hidden group ${
        highlight
          ? 'bg-gradient-to-br from-orange-950/40 via-zinc-900 to-zinc-900 border-orange-500/30 shadow-lg shadow-orange-500/10'
          : 'bg-zinc-900/90 hover:bg-zinc-900 border-white/5 hover:border-white/10 shadow-md'
      } ${className}`}
    >
      <div className="flex items-start justify-between mb-2 sm:mb-3 gap-1">
        <span className="text-zinc-400 text-[11px] sm:text-xs font-semibold uppercase tracking-wider line-clamp-1">
          {title}
        </span>
        <div
          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 shrink-0 ${
            highlight
              ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
              : 'bg-zinc-800 text-zinc-300 border border-white/5'
          }`}
        >
          {icon}
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-1.5 sm:gap-2 mb-1 sm:mb-1.5">
        <span className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
          {value}
        </span>
        {badge && (
          <span
            className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full border ${
              badgeColors[badge.variant]
            }`}
          >
            {badge.text}
          </span>
        )}
      </div>

      {subtext && <p className="text-zinc-400 text-[11px] sm:text-xs truncate">{subtext}</p>}

      {/* Decorative subtle ambient glow */}
      {highlight && (
        <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-orange-500/10 rounded-full blur-2xl pointer-events-none" />
      )}
    </div>
  );
}
