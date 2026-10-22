'use client';

import React from 'react';
import type { User } from '@supabase/supabase-js';
import type { UserProfile } from '@/types/movie';

type MobileBottomNavProps = {
  user: User | null;
  userProfile: UserProfile | null;
  activeSection: 'home' | 'search' | 'room' | 'feedback' | 'profile';
  onHomeClick: () => void;
  onSearchClick: () => void;
  onRoomClick: () => void;
  onFeedbackClick: () => void;
  onProfileClick: () => void;
  isVisible?: boolean;
};

export default function MobileBottomNav({
  user,
  userProfile,
  activeSection,
  onHomeClick,
  onSearchClick,
  onRoomClick,
  onFeedbackClick,
  onProfileClick,
  isVisible = true,
}: MobileBottomNavProps) {
  if (!isVisible) return null;

  const isAdmin = userProfile?.role === 'admin';

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 xl:hidden bg-zinc-950/92 backdrop-blur-xl border-t border-white/10 pb-safe transition-transform duration-300 shadow-[0_-8px_30px_rgba(0,0,0,0.7)]"
      aria-label="Thanh điều hướng di động"
    >
      <div className="flex items-center justify-around h-14 max-w-md mx-auto px-2">
        {/* 1. Trang Chủ */}
        <button
          type="button"
          onClick={onHomeClick}
          className={`flex-1 h-full min-h-[44px] flex flex-col items-center justify-center gap-1 transition-all touch-target cursor-pointer ${
            activeSection === 'home' ? 'text-orange-500 font-bold scale-105' : 'text-zinc-400 hover:text-white'
          }`}
          aria-label="Về trang chủ"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span className="text-[10px] tracking-tight">Trang chủ</span>
        </button>

        {/* 2. Tìm Kiếm */}
        <button
          type="button"
          onClick={onSearchClick}
          className={`flex-1 h-full min-h-[44px] flex flex-col items-center justify-center gap-1 transition-all touch-target cursor-pointer ${
            activeSection === 'search' ? 'text-orange-500 font-bold scale-105' : 'text-zinc-400 hover:text-white'
          }`}
          aria-label="Tìm kiếm phim"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="text-[10px] tracking-tight">Tìm kiếm</span>
        </button>

        {/* 3. Xem Chung */}
        <button
          type="button"
          onClick={onRoomClick}
          className={`flex-1 h-full min-h-[44px] flex flex-col items-center justify-center gap-1 transition-all touch-target cursor-pointer ${
            activeSection === 'room' ? 'text-orange-500 font-bold scale-105' : 'text-zinc-400 hover:text-white'
          }`}
          aria-label="Xem chung cùng bạn bè"
        >
          <div className="relative">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            <span className="absolute -top-1 -right-2 bg-yellow-500 text-black text-[8px] font-black px-1 rounded-full scale-75">
              NEW
            </span>
          </div>
          <span className="text-[10px] tracking-tight">Xem chung</span>
        </button>

        {/* 4. Góp Ý */}
        <button
          type="button"
          onClick={onFeedbackClick}
          className={`flex-1 h-full min-h-[44px] flex flex-col items-center justify-center gap-1 transition-all touch-target cursor-pointer ${
            activeSection === 'feedback' ? 'text-orange-500 font-bold scale-105' : 'text-zinc-400 hover:text-white'
          }`}
          aria-label="Gửi góp ý hoặc báo lỗi"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <span className="text-[10px] tracking-tight">Góp ý</span>
        </button>

        {/* 5. Tài Khoản / Quản Trị */}
        {isAdmin ? (
          <a
            href="/admin"
            className="flex-1 h-full min-h-[44px] flex flex-col items-center justify-center gap-1 text-orange-400 hover:text-orange-300 font-bold transition-all touch-target"
            aria-label="Truy cập Bảng điều khiển Quản trị"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[10px] tracking-tight">Quản trị</span>
          </a>
        ) : (
          <button
            type="button"
            onClick={onProfileClick}
            className={`flex-1 h-full min-h-[44px] flex flex-col items-center justify-center gap-1 transition-all touch-target cursor-pointer ${
              activeSection === 'profile' ? 'text-orange-500 font-bold scale-105' : 'text-zinc-400 hover:text-white'
            }`}
            aria-label={user ? 'Tài khoản của bạn' : 'Đăng nhập'}
          >
            {userProfile?.avatar_url ? (
              <img
                src={userProfile.avatar_url}
                alt="Avatar"
                className="w-5 h-5 rounded-full object-cover border border-white/20"
              />
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            )}
            <span className="text-[10px] tracking-tight truncate max-w-[55px]">
              {user ? (userProfile?.username || 'Cá nhân') : 'Đăng nhập'}
            </span>
          </button>
        )}
      </div>
    </nav>
  );
}
