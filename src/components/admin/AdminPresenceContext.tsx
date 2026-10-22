'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { subscribeToPresence, getCurrentPresenceStats } from '@/lib/presence';
import type { OnlinePresenceStats } from '@/types/admin';

type AdminPresenceContextType = {
  presenceStats: OnlinePresenceStats;
  isUserOnline: (userId?: string | null) => boolean;
  onlineUserIds: Set<string>;
};

const AdminPresenceContext = createContext<AdminPresenceContextType>({
  presenceStats: getCurrentPresenceStats(),
  isUserOnline: () => false,
  onlineUserIds: new Set<string>(),
});

export function AdminPresenceProvider({ children }: { children: React.ReactNode }) {
  const [presenceStats, setPresenceStats] = useState<OnlinePresenceStats>(getCurrentPresenceStats);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(() => {
    const initial = getCurrentPresenceStats();
    return new Set(initial.users.map((u) => u.userId).filter(Boolean) as string[]);
  });

  useEffect(() => {
    const unsubscribe = subscribeToPresence((stats) => {
      setPresenceStats(stats);
      const idSet = new Set<string>();
      stats.users.forEach((u) => {
        if (u.userId) idSet.add(u.userId);
      });
      setOnlineUserIds(idSet);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const isUserOnline = (userId?: string | null): boolean => {
    if (!userId) return false;
    return onlineUserIds.has(userId);
  };

  return (
    <AdminPresenceContext.Provider value={{ presenceStats, isUserOnline, onlineUserIds }}>
      {children}
    </AdminPresenceContext.Provider>
  );
}

export function useAdminPresence() {
  return useContext(AdminPresenceContext);
}
