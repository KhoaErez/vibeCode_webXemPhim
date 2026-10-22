import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { createClient } from '@/lib/supabase/server';
import type { AdminUserProfile } from '@/types/admin';

export async function GET(request: Request) {
  try {
    const auth = await verifyAdminSession();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(5, parseInt(searchParams.get('limit') || '15', 10)));
    const search = searchParams.get('search')?.trim().toLowerCase() || '';
    const role = searchParams.get('role') || 'all';
    const sortBy = searchParams.get('sortBy') || 'created_at';
    const order = searchParams.get('order') === 'asc';

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const supabase = await createClient();

    let query = supabase.from('profiles').select('*', { count: 'exact' });

    if (role === 'admin' || role === 'user') {
      query = query.eq('role', role);
    }

    if (search) {
      query = query.or(`username.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const sortColumn = ['created_at', 'last_seen_at', 'username'].includes(sortBy)
      ? sortBy
      : 'created_at';
    query = query.order(sortColumn, { ascending: order, nullsFirst: false }).range(from, to);

    const { data: profiles, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Lấy thông tin thống kê xem phim của các user trong trang này
    const userIds = (profiles || []).map((p) => p.id);
    const watchStatsMap = new Map<string, { count: number; totalSeconds: number }>();

    if (userIds.length > 0) {
      try {
        const { data: watchData } = await supabase
          .from('watch_progress')
          .select('user_id, progress_seconds')
          .in('user_id', userIds);

        if (watchData) {
          for (const item of watchData) {
            const uid = item.user_id;
            const current = watchStatsMap.get(uid) || { count: 0, totalSeconds: 0 };
            current.count += 1;
            current.totalSeconds += Number(item.progress_seconds) || 0;
            watchStatsMap.set(uid, current);
          }
        }
      } catch (wErr) {
        console.warn('Lỗi lấy watch stats theo user:', wErr);
      }
    }

    const users: AdminUserProfile[] = (profiles || []).map((p) => {
      const stats = watchStatsMap.get(p.id) || { count: 0, totalSeconds: 0 };
      return {
        id: p.id,
        username: p.username || 'Khán giả',
        email: p.email || null,
        avatar_url: p.avatar_url || null,
        role: p.role || 'user',
        created_at: p.created_at || new Date().toISOString(),
        last_seen_at: p.last_seen_at || null,
        watch_count: stats.count,
        total_watch_seconds: stats.totalSeconds,
      };
    });

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      users,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (err: unknown) {
    console.error('Lỗi API users:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await verifyAdminSession();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.userId || !['user', 'admin'].includes(body.role)) {
      return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 });
    }

    const { userId, role } = body;

    // Ngăn chặn admin tự hạ quyền chính mình nếu là admin duy nhất
    if (auth.user?.id === userId && role !== 'admin') {
      return NextResponse.json(
        { error: 'Bạn không thể tự gỡ quyền Quản trị viên của chính tài khoản mình đang đăng nhập.' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', userId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Đã cập nhật vai trò thành ${role === 'admin' ? 'Quản trị viên' : 'Thành viên'} thành công.`,
    });
  } catch (err: unknown) {
    console.error('Lỗi cập nhật role:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
