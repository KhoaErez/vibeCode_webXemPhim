'use client';

import React, { useState } from 'react';
import type { TrafficDataPoint } from '@/types/admin';

type SvgTrafficChartProps = {
  data: TrafficDataPoint[];
  title?: string;
  subtitle?: string;
};

export default function SvgTrafficChart({
  data,
  title = 'Biến thiên lượt truy cập',
  subtitle = 'Phân bổ lượt xem giữa Thành viên và Khách vãng lai theo ngày',
}: SvgTrafficChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="bg-zinc-900 border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center min-h-[300px]">
        <span className="text-zinc-500 text-sm">Chưa có dữ liệu lượt truy cập ghi nhận.</span>
      </div>
    );
  }

  const width = 700;
  const height = 240;
  const padding = { top: 20, right: 20, bottom: 35, left: 40 };

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const maxVal = Math.max(
    5,
    ...data.map((d) => Math.max(d.totalViews, d.memberViews, d.guestViews))
  );

  const getX = (index: number) => {
    if (data.length <= 1) return padding.left + innerWidth / 2;
    return padding.left + (index / (data.length - 1)) * innerWidth;
  };

  const getY = (val: number) => {
    return padding.top + innerHeight - (val / maxVal) * innerHeight;
  };

  // Tạo đường dẫn SVG Area và Line
  const pointsTotal = data.map((d, i) => `${getX(i)},${getY(d.totalViews)}`).join(' ');
  const pointsMember = data.map((d, i) => `${getX(i)},${getY(d.memberViews)}`).join(' ');

  const areaTotal = `${getX(0)},${padding.top + innerHeight} ${pointsTotal} ${getX(
    data.length - 1
  )},${padding.top + innerHeight}`;

  const hoveredData = hoverIndex !== null ? data[hoverIndex] : null;

  return (
    <div className="bg-zinc-900/90 border border-white/5 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-white">{title}</h3>
          <p className="text-xs text-zinc-400">{subtitle}</p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-orange-500" />
            <span className="text-zinc-300 font-medium">Tổng lượt xem</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-sky-400" />
            <span className="text-zinc-400 font-medium">Thành viên</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-400" />
            <span className="text-zinc-400 font-medium">Khách</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none"
        >
          <defs>
            <linearGradient id="orangeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97316" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#f97316" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
            const y = padding.top + innerHeight * pct;
            const val = Math.round(maxVal * (1 - pct));
            return (
              <g key={idx}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.05)"
                  strokeDasharray="4 4"
                />
                <text
                  x={padding.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-zinc-600 text-[10px] font-mono"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Total Views Area & Line */}
          <polygon points={areaTotal} fill="url(#orangeGrad)" />
          <polyline
            points={pointsTotal}
            fill="none"
            stroke="#f97316"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Member Views Line */}
          <polyline
            points={pointsMember}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2"
            strokeDasharray="3 3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive Dots & Hover trigger bars */}
          {data.map((d, i) => {
            const cx = getX(i);
            const cy = getY(d.totalViews);
            const isHovered = hoverIndex === i;

            return (
              <g key={i} className="cursor-pointer">
                {/* Invisible hover capture rect */}
                <rect
                  x={cx - innerWidth / (data.length * 2)}
                  y={padding.top}
                  width={innerWidth / data.length}
                  height={innerHeight}
                  fill="transparent"
                  onMouseEnter={() => setHoverIndex(i)}
                  onMouseLeave={() => setHoverIndex(null)}
                />

                {/* Vertical hover indicator */}
                {isHovered && (
                  <line
                    x1={cx}
                    y1={padding.top}
                    x2={cx}
                    y2={padding.top + innerHeight}
                    stroke="rgba(249, 115, 22, 0.4)"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                )}

                {/* Point circle */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 6 : 4}
                  fill="#f97316"
                  stroke="#18181b"
                  strokeWidth="2"
                  className="transition-all duration-200"
                />

                {/* X Axis label */}
                <text
                  x={cx}
                  y={height - 10}
                  textAnchor="middle"
                  className={`text-[11px] transition-colors ${
                    isHovered ? 'fill-orange-400 font-bold' : 'fill-zinc-500'
                  }`}
                >
                  {d.date}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip */}
        {hoveredData && hoverIndex !== null && (
          <div
            className="absolute z-30 pointer-events-none bg-zinc-950/95 border border-white/10 p-3 rounded-xl shadow-2xl text-xs backdrop-blur-md transition-all duration-100"
            style={{
              left: `${Math.min(
                Math.max(15, (getX(hoverIndex) / width) * 100 - 15),
                70
              )}%`,
              top: '10px',
            }}
          >
            <div className="font-bold text-white mb-1.5 border-b border-white/10 pb-1 flex justify-between items-center gap-4">
              <span>Ngày {hoveredData.date}</span>
              <span className="text-orange-400 font-mono font-bold">
                {hoveredData.totalViews} lượt xem
              </span>
            </div>
            <div className="flex flex-col gap-1 text-[11px]">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sky-400">👤 Thành viên:</span>
                <span className="font-semibold text-white">{hoveredData.memberViews}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-emerald-400">🌐 Khách vãng lai:</span>
                <span className="font-semibold text-white">{hoveredData.guestViews}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
