'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  joinPresenceChannel,
  getOrCreateGuestSessionId,
  detectDeviceType,
} from '@/lib/presence';
import type { User } from '@supabase/supabase-js';
import type { UserProfile } from '@/types/movie';

export default function SitePresenceTracker() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const lastLoggedPath = useRef<string>('');
  const supabase = createClient();

  // 1. Lắng nghe trạng thái đăng nhập
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user || null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  // 2. Tải profile nếu có user
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    supabase
      .from('profiles')
      .select('id, username, avatar_url, role')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProfile(data as UserProfile);
      });
  }, [user, supabase]);

  // 3. Kết nối Presence Channel (Online realtime không trùng lặp)
  useEffect(() => {
    const { cleanup } = joinPresenceChannel(user, profile);

    return () => {
      cleanup();
    };
  }, [user, profile]);

  // 4. Ghi nhận lượt truy cập (Page View Logging)
  useEffect(() => {
    // Không log lại cùng 1 path nhiều lần liên tiếp
    if (!pathname || lastLoggedPath.current === pathname) return;
    lastLoggedPath.current = pathname;

    const sessionId = getOrCreateGuestSessionId();
    const deviceType = detectDeviceType();

    fetch('/api/stats/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        path: pathname,
        deviceType,
      }),
    }).catch(() => {});
  }, [pathname]);

  // 5. Throttled Heartbeat (mỗi 3 phút cập nhật last_seen_at nếu tab đang mở)
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        const sessionId = getOrCreateGuestSessionId();
        const deviceType = detectDeviceType();

        fetch('/api/stats/pageview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            path: pathname || '/',
            deviceType,
          }),
        }).catch(() => {});
      }
    }, 3 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user, pathname]);

  return null;
}
