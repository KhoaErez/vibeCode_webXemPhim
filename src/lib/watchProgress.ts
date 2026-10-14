import type { SupabaseClient, User } from '@supabase/supabase-js';

export type WatchProgressItem = {
  id?: string;
  user_id?: string;
  movie_slug: string;
  movie_name: string;
  movie_poster?: string;
  episode_name: string;
  episode_slug?: string;
  progress_seconds: number;
  duration_seconds: number;
  completed?: boolean;
  updated_at: string;
};

const LOCAL_STORAGE_KEY = 'rapnha_watch_progress';

export function formatWatchTime(totalSeconds: number): string {
  if (!totalSeconds || isNaN(totalSeconds) || totalSeconds <= 0) return '00:00';
  const sec = Math.floor(totalSeconds);
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Lấy danh sách tiến độ xem từ LocalStorage
 */
export function getLocalProgressList(): WatchProgressItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    }
    return [];
  } catch (e) {
    console.warn('Lỗi đọc local watch progress:', e);
    return [];
  }
}

/**
 * Lưu tiến độ vào LocalStorage
 */
export function saveLocalProgress(item: WatchProgressItem): void {
  if (typeof window === 'undefined') return;
  try {
    const list = getLocalProgressList();
    const index = list.findIndex(
      (p) => p.movie_slug === item.movie_slug && p.episode_name === item.episode_name
    );

    if (index >= 0) {
      list[index] = item;
    } else {
      list.unshift(item);
    }

    // Giữ tối đa 50 bản ghi gần nhất
    const trimmed = list.slice(0, 50);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('Lỗi ghi local watch progress:', e);
  }
}

/**
 * Xóa tiến độ khỏi LocalStorage
 */
export function removeLocalProgress(movieSlug: string, episodeName?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const list = getLocalProgressList();
    const filtered = list.filter((p) => {
      if (p.movie_slug !== movieSlug) return true;
      if (episodeName && p.episode_name !== episodeName) return true;
      return false;
    });
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.warn('Lỗi xóa local watch progress:', e);
  }
}

/**
 * Lấy toàn bộ tiến độ xem gần đây của người dùng (từ Supabase nếu đăng nhập, hoặc LocalStorage)
 */
export async function fetchWatchProgressList(
  supabase: SupabaseClient,
  user: User | null
): Promise<WatchProgressItem[]> {
  if (!user) {
    return getLocalProgressList();
  }

  try {
    const { data, error } = await supabase
      .from('watch_progress')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) {
      // Nếu bảng chưa được tạo trong Supabase, fallback về LocalStorage
      if (error.code === 'PGRST205' || error.message?.includes('schema cache')) {
        console.warn('Bảng watch_progress chưa tồn tại trong Supabase. Sử dụng LocalStorage tạm thời.');
        return getLocalProgressList();
      }
      throw error;
    }

    return (data as WatchProgressItem[]) || [];
  } catch (err) {
    console.warn('Lỗi tải tiến độ xem từ Supabase, chuyển sang LocalStorage:', err);
    return getLocalProgressList();
  }
}

/**
 * Lấy danh sách phim đang xem dở (Deduplicate mỗi phim 1 bản ghi gần nhất)
 */
export async function fetchContinueWatchingList(
  supabase: SupabaseClient,
  user: User | null
): Promise<WatchProgressItem[]> {
  const all = await fetchWatchProgressList(supabase, user);
  const seenMovies = new Set<string>();
  const uniqueList: WatchProgressItem[] = [];

  for (const item of all) {
    if (!seenMovies.has(item.movie_slug)) {
      seenMovies.add(item.movie_slug);
      // Chỉ hiện phim chưa hoàn thành hoặc còn dở
      if (!item.completed && item.progress_seconds > 5) {
        uniqueList.push(item);
      }
    }
  }

  return uniqueList;
}

/**
 * Lấy tiến độ của 1 tập hoặc tiến độ mới nhất của 1 bộ phim
 */
export async function getMovieWatchProgress(
  supabase: SupabaseClient,
  user: User | null,
  movieSlug: string,
  episodeName?: string
): Promise<WatchProgressItem | null> {
  if (!user) {
    const local = getLocalProgressList();
    if (episodeName) {
      return (
        local.find((p) => p.movie_slug === movieSlug && p.episode_name === episodeName) || null
      );
    }
    return local.find((p) => p.movie_slug === movieSlug) || null;
  }

  try {
    let query = supabase
      .from('watch_progress')
      .select('*')
      .eq('movie_slug', movieSlug);

    if (episodeName) {
      query = query.eq('episode_name', episodeName);
    }

    const { data, error } = await query
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST205') {
        const local = getLocalProgressList();
        return episodeName
          ? local.find((p) => p.movie_slug === movieSlug && p.episode_name === episodeName) || null
          : local.find((p) => p.movie_slug === movieSlug) || null;
      }
      throw error;
    }

    return (data as WatchProgressItem) || null;
  } catch (err) {
    console.warn('Lỗi lấy tiến độ phim từ Supabase:', err);
    const local = getLocalProgressList();
    return episodeName
      ? local.find((p) => p.movie_slug === movieSlug && p.episode_name === episodeName) || null
      : local.find((p) => p.movie_slug === movieSlug) || null;
  }
}

/**
 * Lưu tiến độ xem (vào Supabase và LocalStorage)
 */
export async function saveWatchProgress(
  supabase: SupabaseClient,
  user: User | null,
  input: Omit<WatchProgressItem, 'updated_at'> & { updated_at?: string }
): Promise<void> {
  const item: WatchProgressItem = {
    ...input,
    progress_seconds: Math.floor(input.progress_seconds),
    duration_seconds: Math.floor(input.duration_seconds || 0),
    updated_at: input.updated_at || new Date().toISOString(),
  };

  // Luôn lưu bản sao vào LocalStorage
  saveLocalProgress(item);

  // Nếu người dùng đã đăng nhập, lưu vào Supabase
  if (user) {
    try {
      const { error } = await supabase.from('watch_progress').upsert(
        {
          user_id: user.id,
          movie_slug: item.movie_slug,
          movie_name: item.movie_name,
          movie_poster: item.movie_poster || '',
          episode_name: item.episode_name,
          episode_slug: item.episode_slug || '',
          progress_seconds: item.progress_seconds,
          duration_seconds: item.duration_seconds,
          completed: item.completed || false,
          updated_at: item.updated_at,
        },
        {
          onConflict: 'user_id,movie_slug,episode_name',
        }
      );

      if (error && error.code !== 'PGRST205') {
        console.warn('Lỗi lưu watch_progress Supabase:', error.message);
      }
    } catch (err) {
      console.warn('Không thể kết nối Supabase để lưu tiến độ:', err);
    }
  }
}

/**
 * Xóa tiến độ xem của 1 bộ phim
 */
export async function deleteWatchProgress(
  supabase: SupabaseClient,
  user: User | null,
  movieSlug: string,
  episodeName?: string
): Promise<void> {
  removeLocalProgress(movieSlug, episodeName);

  if (user) {
    try {
      let query = supabase.from('watch_progress').delete().eq('movie_slug', movieSlug);
      if (episodeName) {
        query = query.eq('episode_name', episodeName);
      }
      await query;
    } catch (err) {
      console.warn('Lỗi xóa watch_progress trên Supabase:', err);
    }
  }
}

/**
 * Đồng bộ tiến độ từ LocalStorage lên Supabase khi người dùng đăng nhập
 */
export async function syncLocalProgressToSupabase(
  supabase: SupabaseClient,
  user: User
): Promise<void> {
  const localItems = getLocalProgressList();
  if (localItems.length === 0) return;

  try {
    const { data: dbItems, error } = await supabase
      .from('watch_progress')
      .select('movie_slug, episode_name, updated_at')
      .eq('user_id', user.id);

    if (error) {
      if (error.code === 'PGRST205') return; // Bảng chưa tồn tại
      console.warn('Lỗi đọc watch_progress khi đồng bộ:', error);
      return;
    }

    const dbMap = new Map<string, number>();
    (dbItems || []).forEach((row) => {
      dbMap.set(`${row.movie_slug}_${row.episode_name}`, new Date(row.updated_at).getTime());
    });

    const itemsToUpsert = localItems.filter((local) => {
      const dbTime = dbMap.get(`${local.movie_slug}_${local.episode_name}`);
      if (!dbTime) return true; // Chưa có trên DB -> cần đồng bộ lên
      return new Date(local.updated_at).getTime() > dbTime; // Local mới hơn DB -> cập nhật
    });

    for (const item of itemsToUpsert) {
      await supabase.from('watch_progress').upsert(
        {
          user_id: user.id,
          movie_slug: item.movie_slug,
          movie_name: item.movie_name,
          movie_poster: item.movie_poster || '',
          episode_name: item.episode_name,
          episode_slug: item.episode_slug || '',
          progress_seconds: item.progress_seconds,
          duration_seconds: item.duration_seconds,
          completed: item.completed || false,
          updated_at: item.updated_at,
        },
        { onConflict: 'user_id,movie_slug,episode_name' }
      );
    }
  } catch (syncErr) {
    console.warn('Lỗi đồng bộ watch_progress:', syncErr);
  }
}
