'use client';

import React, { useState } from 'react';
import AdminSidebar from './AdminSidebar';
import AdminHeader from './AdminHeader';
import { AdminPresenceProvider, useAdminPresence } from './AdminPresenceContext';
import type { AdminUserProfile } from '@/types/admin';

type AdminLayoutShellProps = {
  profile: AdminUserProfile | null;
  children: React.ReactNode;
};

function ShellContent({
  profile,
  children,
}: {
  profile: AdminUserProfile | null;
  children: React.ReactNode;
}) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { presenceStats } = useAdminPresence();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      {/* Sidebar Navigation */}
      <AdminSidebar
        profile={profile}
        isOpenMobile={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
        onlineCount={presenceStats.totalOnline}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <AdminHeader
          profile={profile}
          onOpenMobileMenu={() => setIsMobileOpen(true)}
          onlineCount={presenceStats.totalOnline}
          membersOnline={presenceStats.membersOnline}
          guestsOnline={presenceStats.guestsOnline}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-in fade-in duration-300">
          {children}
        </main>

        <footer className="py-4 px-6 border-t border-white/5 text-center text-xs text-zinc-500">
          Hệ thống Quản Trị Rạp Nhà &copy; {new Date().getFullYear()}. Toàn bộ dữ liệu được cập nhật theo thời gian thực.
        </footer>
      </div>
    </div>
  );
}

export default function AdminLayoutShell({ profile, children }: AdminLayoutShellProps) {
  return (
    <AdminPresenceProvider>
      <ShellContent profile={profile}>{children}</ShellContent>
    </AdminPresenceProvider>
  );
}
