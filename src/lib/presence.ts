import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { PresenceUser, OnlinePresenceStats } from '@/types/admin';

const PRESENCE_CHANNEL_NAME = 'online-users';
const GUEST_SESSION_KEY = 'rapnha_guest_session_id';

const initialStats: OnlinePresenceStats = {
  totalOnline: 0,
  membersOnline: 0,
  guestsOnline: 0,
  users: [],
};

let activeChannel: RealtimeChannel | null = null;
let currentStats: OnlinePresenceStats = initialStats;
const listeners = new Set<(stats: OnlinePresenceStats) => void>();

function notifyListeners(channel: RealtimeChannel) {
  const state = channel.presenceState();
  currentStats = parsePresenceState(state as Record<string, unknown[]>);
  listeners.forEach((listener) => {
    try {
      listener(currentStats);
    } catch (e) {
      console.warn('Lỗi gọi presence listener:', e);
    }
  });
}

/**
 * Lấy hoặc tạo Session ID duy nhất cho khách vãng lai
 * Lưu trong sessionStorage để không bị đếm trùng khi mở nhiều tab
 */
export function getOrCreateGuestSessionId(): string {
  if (typeof window === 'undefined') return 'server_session';
  try {
    let sessionId = sessionStorage.getItem(GUEST_SESSION_KEY);
    if (!sessionId) {
      sessionId = 'guest_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
      sessionStorage.setItem(GUEST_SESSION_KEY, sessionId);
    }
    return sessionId;
  } catch {
    return 'guest_fallback_' + Date.now();
  }
}

/**
 * Phát hiện loại thiết bị của người dùng
 */
export function detectDeviceType(): 'desktop' | 'mobile' | 'tablet' {
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'tablet';
  }
  if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|NetFront|Silk-Accelerated|(hpw|web)OS|Fennec|Minimo|Opera M(obi|ini)|Blazer|Dolfin|Dolphin|Skyfire|Zune/i.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

/**
 * Khởi tạo hoặc cập nhật trạng thái Hiện Diện (Presence)
 * Đảm bảo chỉ có DUY NHẤT 1 channel toàn hệ thống và các callback luôn đăng ký TRƯỚC subscribe()
 */
export function joinPresenceChannel(
  user: { id: string; email?: string | null } | null,
  profile?: { username?: string; avatar_url?: string } | null
): { cleanup: () => void } {
  if (typeof window === 'undefined') return { cleanup: () => {} };

  const supabase = createClient();
  const guestId = getOrCreateGuestSessionId();
  const device = detectDeviceType();

  const isGuest = !user;
  const presenceKey = isGuest ? guestId : `user_${user.id}`;
  const username = isGuest
    ? 'Khách ' + guestId.slice(-4).toUpperCase()
    : (profile?.username || user?.email?.split('@')[0] || 'Thành viên');

  const payload: PresenceUser = {
    presenceKey,
    userId: user ? user.id : null,
    username,
    avatarUrl: profile?.avatar_url || null,
    isGuest,
    device,
    joinedAt: Date.now(),
  };

  // Nếu channel đã tồn tại, chỉ cần track lại payload mới mà không tạo lại channel
  if (activeChannel) {
    if (activeChannel.state === 'joined') {
      activeChannel.track(payload).catch(() => {});
    }
    return {
      cleanup: () => {
        // Giữ channel chạy nền
      },
    };
  }

  // Tạo mới channel và ĐĂNG KÝ CALLBACKS TRƯỚC KHI GỌI subscribe()
  const channel = supabase.channel(PRESENCE_CHANNEL_NAME, {
    config: {
      presence: {
        key: presenceKey,
      },
    },
  });

  activeChannel = channel;

  channel
    .on('presence', { event: 'sync' }, () => {
      notifyListeners(channel);
    })
    .on('presence', { event: 'join' }, () => {
      notifyListeners(channel);
    })
    .on('presence', { event: 'leave' }, () => {
      notifyListeners(channel);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track(payload);
        notifyListeners(channel);
      }
    });

  const cleanup = () => {
    // Không hủy channel ngay lập tức khi chuyển route để duy trì kết nối mượt mà
  };

  return { cleanup };
}

/**
 * Đăng ký lắng nghe thay đổi số lượng người online từ bất kỳ component nào
 */
export function subscribeToPresence(listener: (stats: OnlinePresenceStats) => void): () => void {
  listeners.add(listener);
  // Gửi ngay trạng thái hiện tại
  listener(currentStats);

  // Nếu channel đã có sẵn, cập nhật lại trạng thái mới nhất
  if (activeChannel && activeChannel.state === 'joined') {
    notifyListeners(activeChannel);
  }

  return () => {
    listeners.delete(listener);
  };
}

export function getCurrentPresenceStats(): OnlinePresenceStats {
  return currentStats;
}

/**
 * Trích xuất danh sách và số lượng người dùng từ Presence State của Supabase
 * Loại bỏ trùng lặp hoàn toàn theo presenceKey
 */
export function parsePresenceState(presenceState: Record<string, unknown[]>): OnlinePresenceStats {
  const uniqueUsersMap = new Map<string, PresenceUser>();

  for (const [key, presences] of Object.entries(presenceState)) {
    if (Array.isArray(presences) && presences.length > 0) {
      const latest = presences[presences.length - 1] as PresenceUser;
      if (latest) {
        uniqueUsersMap.set(key, {
          presenceKey: key,
          userId: latest.userId || null,
          username: latest.username || 'Người dùng',
          avatarUrl: latest.avatarUrl || null,
          isGuest: Boolean(latest.isGuest),
          device: latest.device || 'desktop',
          joinedAt: latest.joinedAt || Date.now(),
        });
      }
    }
  }

  const users = Array.from(uniqueUsersMap.values());
  const membersOnline = users.filter((u) => !u.isGuest).length;
  const guestsOnline = users.filter((u) => u.isGuest).length;

  return {
    totalOnline: users.length,
    membersOnline,
    guestsOnline,
    users,
  };
}
