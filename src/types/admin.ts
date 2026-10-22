export type UserRole = 'user' | 'admin';

export type UserStatus = 'online' | 'recent' | 'offline';

export type AdminUserProfile = {
  id: string;
  username: string;
  email?: string | null;
  avatar_url?: string | null;
  role: UserRole;
  created_at: string;
  last_seen_at?: string | null;
  watch_count?: number;
  total_watch_seconds?: number;
};

export type FeedbackStatus = 'pending' | 'in_progress' | 'resolved' | 'closed';

export type FeedbackCategory =
  | 'Báo lỗi video'
  | 'Lỗi phụ đề / âm thanh'
  | 'Tốc độ tải chậm'
  | 'Góp ý giao diện'
  | 'Đề xuất tính năng'
  | 'Sai thông tin phim'
  | 'Khác';

export type FeedbackItem = {
  id: string;
  user_id?: string | null;
  user_email?: string | null;
  user_name?: string | null;
  rating?: number | null;
  category: FeedbackCategory | string;
  subject: string;
  content: string;
  movie_name?: string | null;
  episode_name?: string | null;
  movie_url?: string | null;
  status: FeedbackStatus;
  admin_notes?: string | null;
  admin_reply?: string | null;
  created_at: string;
  updated_at: string;
};

export type PresenceUser = {
  presenceKey: string;
  userId?: string | null;
  username: string;
  avatarUrl?: string | null;
  isGuest: boolean;
  device: 'desktop' | 'mobile' | 'tablet';
  joinedAt: number;
};

export type OnlinePresenceStats = {
  totalOnline: number;
  membersOnline: number;
  guestsOnline: number;
  users: PresenceUser[];
};

export type AdminDashboardKPIs = {
  totalUsers: number;
  newUsersToday: number;
  newUsers7Days: number;
  newUsers30Days: number;
  activeToday: number;
  active7Days: number;
  active30Days: number;
  totalPageViews: number;
  pageViewsToday: number;
  pageViews7Days: number;
  memberViewsToday: number;
  guestViewsToday: number;
  totalWatchSeconds: number;
  pendingFeedbacks: number;
  resolvedFeedbacks: number;
};

export type TrafficDataPoint = {
  date: string;
  totalViews: number;
  memberViews: number;
  guestViews: number;
};

export type PopularMovieStat = {
  movie_slug: string;
  movie_name: string;
  view_count: number;
  total_watch_seconds: number;
  completed_count: number;
};
