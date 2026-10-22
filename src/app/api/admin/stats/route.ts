import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { createClient } from '@/lib/supabase/server';
import type { AdminDashboardKPIs, TrafficDataPoint, PopularMovieStat } from '@/types/admin';

export async function GET() {
  try {
    const auth = await verifyAdminSession();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 });
    }

    const supabase = await createClient();
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // 1. Tổng số tài khoản và thống kê đăng ký
    const { count: totalUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    const { count: newUsersToday } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', oneDayAgo);

    const { count: newUsers7Days } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo);

    const { count: newUsers30Days } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo);

    // 2. Thống kê hoạt động dựa trên last_seen_at
    const { count: activeToday } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('last_seen_at', oneDayAgo);

    const { count: active7Days } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('last_seen_at', sevenDaysAgo);

    const { count: active30Days } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('last_seen_at', thirtyDaysAgo);

    // 3. Thống kê lượt xem trang (page_views)
    let totalPageViews = 0;
    let pageViewsToday = 0;
    let pageViews7Days = 0;
    let memberViewsToday = 0;
    let guestViewsToday = 0;
    const trafficDaily: TrafficDataPoint[] = [];
    const deviceStats = { desktop: 0, mobile: 0, tablet: 0 };

    try {
      const { count: totalPv } = await supabase
        .from('page_views')
        .select('*', { count: 'exact', head: true });
      totalPageViews = totalPv || 0;

      const { count: pvToday } = await supabase
        .from('page_views')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfToday);
      pageViewsToday = pvToday || 0;

      const { count: pv7d } = await supabase
        .from('page_views')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo);
      pageViews7Days = pv7d || 0;

      const { count: mToday } = await supabase
        .from('page_views')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfToday)
        .not('user_id', 'is', null);
      memberViewsToday = mToday || 0;
      guestViewsToday = Math.max(0, pageViewsToday - memberViewsToday);

      // Lấy page_views 7 ngày gần đây để vẽ biểu đồ
      const { data: recentViews } = await supabase
        .from('page_views')
        .select('created_at, user_id, device_type')
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: true });

      if (recentViews && recentViews.length > 0) {
        // Gom nhóm theo ngày
        const dayMap = new Map<string, { total: number; member: number; guest: number }>();
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          const dateStr = d.toLocaleDateString('vi-VN', { month: 'numeric', day: 'numeric' });
          dayMap.set(dateStr, { total: 0, member: 0, guest: 0 });
        }

        for (const pv of recentViews) {
          const dStr = new Date(pv.created_at).toLocaleDateString('vi-VN', { month: 'numeric', day: 'numeric' });
          const entry = dayMap.get(dStr);
          if (entry) {
            entry.total += 1;
            if (pv.user_id) entry.member += 1;
            else entry.guest += 1;
          }

          if (pv.device_type === 'mobile') deviceStats.mobile += 1;
          else if (pv.device_type === 'tablet') deviceStats.tablet += 1;
          else deviceStats.desktop += 1;
        }

        for (const [date, counts] of dayMap.entries()) {
          trafficDaily.push({
            date,
            totalViews: counts.total,
            memberViews: counts.member,
            guestViews: counts.guest,
          });
        }
      }
    } catch {
      // Nếu bảng page_views chưa được tạo thì bỏ qua
    }

    // Nếu trafficDaily trống (mới khởi tạo), điền danh sách 7 ngày qua với 0 view để biểu đồ luôn hiển thị đúng trục thời gian
    if (trafficDaily.length === 0) {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        trafficDaily.push({
          date: d.toLocaleDateString('vi-VN', { month: 'numeric', day: 'numeric' }),
          totalViews: 0,
          memberViews: 0,
          guestViews: 0,
        });
      }
    }

    // 4. Thống kê xem phim thực tế (watch_progress)
    let totalWatchSeconds = 0;
    const popularMovies: PopularMovieStat[] = [];

    try {
      const { data: watchRecords } = await supabase
        .from('watch_progress')
        .select('movie_slug, movie_name, progress_seconds, completed');

      if (watchRecords && watchRecords.length > 0) {
        const movieMap = new Map<string, PopularMovieStat>();

        for (const record of watchRecords) {
          const sec = Number(record.progress_seconds) || 0;
          totalWatchSeconds += sec;

          const slug = record.movie_slug || 'unknown';
          const existing = movieMap.get(slug);
          if (existing) {
            existing.view_count += 1;
            existing.total_watch_seconds += sec;
            if (record.completed) existing.completed_count += 1;
          } else {
            movieMap.set(slug, {
              movie_slug: slug,
              movie_name: record.movie_name || slug,
              view_count: 1,
              total_watch_seconds: sec,
              completed_count: record.completed ? 1 : 0,
            });
          }
        }

        const sorted = Array.from(movieMap.values())
          .sort((a, b) => b.view_count - a.view_count)
          .slice(0, 8);
        popularMovies.push(...sorted);
      }
    } catch (wpErr) {
      console.warn('Lỗi đọc watch_progress:', wpErr);
    }

    // 5. Thống kê phản hồi góp ý
    let pendingFeedbacks = 0;
    let resolvedFeedbacks = 0;

    try {
      const { count: pendingCount } = await supabase
        .from('feedbacks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      pendingFeedbacks = pendingCount || 0;

      const { count: resolvedCount } = await supabase
        .from('feedbacks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'resolved');
      resolvedFeedbacks = resolvedCount || 0;
    } catch {
      // Bỏ qua nếu bảng feedbacks chưa tạo
    }

    const kpis: AdminDashboardKPIs = {
      totalUsers: totalUsers || 0,
      newUsersToday: newUsersToday || 0,
      newUsers7Days: newUsers7Days || 0,
      newUsers30Days: newUsers30Days || 0,
      activeToday: activeToday || 0,
      active7Days: active7Days || 0,
      active30Days: active30Days || 0,
      totalPageViews,
      pageViewsToday,
      pageViews7Days,
      memberViewsToday,
      guestViewsToday,
      totalWatchSeconds,
      pendingFeedbacks,
      resolvedFeedbacks,
    };

    return NextResponse.json({
      success: true,
      kpis,
      trafficDaily,
      popularMovies,
      deviceStats,
    });
  } catch (err: unknown) {
    console.error('Lỗi API stats:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
