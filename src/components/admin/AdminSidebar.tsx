'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useScrollLock } from '@/hooks/useScrollLock';
import type { AdminUserProfile } from '@/types/admin';

type AdminSidebarProps = {
  profile: AdminUserProfile | null;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onlineCount?: number;
};

export default function AdminSidebar({
  profile,
  isOpenMobile,
  onCloseMobile,
  onlineCount = 0,
}: AdminSidebarProps) {
  useScrollLock(isOpenMobile);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const navItems = [
    {
      name: 'Tổng Quan',
      href: '/admin',
      exact: true,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
          />
        </svg>
      ),
    },
    {
      name: 'Quản Lý Tài Khoản',
      href: '/admin/users',
      exact: false,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ),
    },
    {
      name: 'Góp Ý & Báo Lỗi',
      href: '/admin/feedbacks',
      exact: false,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
          />
        </svg>
      ),
    },
  ];

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  const isActive = (itemHref: string, exact: boolean) => {
    if (exact) return pathname === itemHref;
    return pathname.startsWith(itemHref);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-zinc-950 border-r border-white/5">
      {/* Brand Header */}
      <div className="p-5 border-b border-white/5 flex items-center justify-between">
        <Link href="/admin" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-orange-500/20 text-orange-500 border border-orange-500/30 flex items-center justify-center font-black text-lg transition-transform group-hover:scale-105">
            🍿
          </div>
          <div>
            <div className="font-extrabold text-white text-base tracking-tight leading-none">
              RẠP NHÀ
            </div>
            <div className="text-[10px] text-orange-400 font-bold uppercase tracking-wider mt-1">
              Admin Portal
            </div>
          </div>
        </Link>

        {/* Mobile close button */}
        {isOpenMobile && (
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors touch-target cursor-pointer"
            aria-label="Đóng menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Realtime Live Online Badge */}
      <div className="px-5 py-3 bg-zinc-900/60 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="text-zinc-300 text-xs font-semibold">Đang online</span>
        </div>
        <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
          {onlineCount} người
        </span>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-4 flex flex-col gap-1.5 overflow-y-auto custom-scrollbar">
        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider px-3 mb-1">
          Menu Điều Hướng
        </div>
        {navItems.map((item) => {
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onCloseMobile}
              className={`flex items-center gap-3 px-3.5 py-3 min-h-[44px] rounded-xl text-sm font-semibold transition-all duration-200 touch-target ${
                active
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20 font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
            >
              <span className={active ? 'text-white' : 'text-zinc-400'}>{item.icon}</span>
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Admin User Profile & Footer Actions */}
      <div className="p-4 border-t border-white/5 flex flex-col gap-2 bg-zinc-950/80">
        {/* User Card */}
        {profile && (
          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-900/80 border border-white/5">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Avatar"
                className="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-orange-500/20 text-orange-400 font-bold flex items-center justify-center text-xs shrink-0">
                {profile.username?.charAt(0).toUpperCase() || 'A'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-white truncate leading-tight">
                {profile.username}
              </div>
              <div className="text-[10px] text-zinc-400 truncate">{profile.email}</div>
            </div>
          </div>
        )}

        {/* Back to Movie Website */}
        <Link
          href="/"
          className="flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-900 transition-colors touch-target"
        >
          <svg className="w-4 h-4 text-orange-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span>Về trang xem phim</span>
        </Link>

        {/* Sign Out */}
        <button
          onClick={handleSignOut}
          className="cursor-pointer flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors w-full text-left touch-target"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span>Đăng xuất</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:flex w-64 flex-col fixed inset-y-0 left-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden animate-in fade-in duration-200"
          onClick={onCloseMobile}
        />
      )}

      {/* Mobile Drawer Panel */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 lg:hidden transform transition-all duration-300 ease-in-out ${
          isOpenMobile ? 'translate-x-0 pointer-events-auto visible' : '-translate-x-full pointer-events-none invisible'
        }`}
      >
        {sidebarContent}
      </div>
    </>
  );
}
