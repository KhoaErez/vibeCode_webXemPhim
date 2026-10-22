'use client';

import React from 'react';
import Link from 'next/link';
import type { AdminUserProfile } from '@/types/admin';

type AdminHeaderProps = {
  profile: AdminUserProfile | null;
  onOpenMobileMenu: () => void;
  onlineCount?: number;
  membersOnline?: number;
  guestsOnline?: number;
  title?: string;
};

export default function AdminHeader({
  profile,
  onOpenMobileMenu,
  onlineCount = 0,
  membersOnline = 0,
  guestsOnline = 0,
  title = 'Bảng Điều Khiển Quản Trị',
}: AdminHeaderProps) {
  return (
    <header className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-xl border-b border-white/5 px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {/* Mobile Hamburger Button */}
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-900 border border-white/5 transition-colors touch-target cursor-pointer"
          aria-label="Mở menu quản trị"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div>
          <h1 className="text-base sm:text-lg font-bold text-white tracking-tight leading-tight">
            {title}
          </h1>
          <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 hidden sm:flex">
            <span>Rạp Nhà Hệ Thống</span>
            <span>&bull;</span>
            <span className="text-orange-400 font-medium">Phiên bản 2.0</span>
          </div>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Realtime Live Pill */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-emerald-500/30 text-xs shadow-inner cursor-help"
          title={`Chi tiết online: ${membersOnline} thành viên, ${guestsOnline} khách vãng lai`}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-zinc-300 font-medium hidden sm:inline">Online:</span>
          <span className="font-mono font-bold text-emerald-400">{onlineCount}</span>
          <span className="text-[10px] text-zinc-500 hidden md:inline">
            ({membersOnline} TV / {guestsOnline} Khách)
          </span>
        </div>

        {/* View Movie Site Link */}
        <Link
          href="/"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-850 text-zinc-300 hover:text-white text-xs font-semibold border border-white/5 transition-colors"
          title="Trở về trang xem phim"
        >
          <span>🎬</span>
          <span>Xem web</span>
        </Link>

        {/* Admin Avatar & Role Badge */}
        {profile && (
          <div className="flex items-center gap-2 pl-2 border-l border-white/5">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Avatar"
                className="w-7 h-7 rounded-full object-cover border border-white/10"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-orange-500/20 text-orange-400 font-bold flex items-center justify-center text-xs">
                {profile.username?.charAt(0).toUpperCase() || 'A'}
              </div>
            )}
            <span className="text-xs font-bold text-white hidden md:inline truncate max-w-[120px]">
              {profile.username}
            </span>
            <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
              Admin
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
