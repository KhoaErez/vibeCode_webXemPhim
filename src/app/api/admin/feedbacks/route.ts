import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { createClient } from '@/lib/supabase/server';
import type { FeedbackItem } from '@/types/admin';

export async function GET(request: Request) {
  try {
    const auth = await verifyAdminSession();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(5, parseInt(searchParams.get('limit') || '15', 10)));
    const status = searchParams.get('status') || 'all';
    const category = searchParams.get('category') || 'all';
    const rating = searchParams.get('rating') || 'all';
    const search = searchParams.get('search')?.trim().toLowerCase() || '';

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const supabase = await createClient();

    // 1. Thống kê nhanh số lượng theo trạng thái
    const statusCounts = {
      all: 0,
      pending: 0,
      in_progress: 0,
      resolved: 0,
      closed: 0,
    };

    try {
      const { count: totalC } = await supabase.from('feedbacks').select('*', { count: 'exact', head: true });
      statusCounts.all = totalC || 0;

      const { count: pendingC } = await supabase.from('feedbacks').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      statusCounts.pending = pendingC || 0;

      const { count: inProgressC } = await supabase.from('feedbacks').select('*', { count: 'exact', head: true }).eq('status', 'in_progress');
      statusCounts.in_progress = inProgressC || 0;

      const { count: resolvedC } = await supabase.from('feedbacks').select('*', { count: 'exact', head: true }).eq('status', 'resolved');
      statusCounts.resolved = resolvedC || 0;

      const { count: closedC } = await supabase.from('feedbacks').select('*', { count: 'exact', head: true }).eq('status', 'closed');
      statusCounts.closed = closedC || 0;
    } catch {
      // Bỏ qua nếu bảng feedbacks chưa tạo
    }

    // 2. Truy vấn danh sách đã lọc
    let query = supabase.from('feedbacks').select('*', { count: 'exact' });

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    if (category !== 'all') {
      query = query.eq('category', category);
    }

    if (rating !== 'all') {
      const ratingNum = parseInt(rating, 10);
      if (!isNaN(ratingNum)) {
        query = query.eq('rating', ratingNum);
      }
    }

    if (search) {
      query = query.or(
        `subject.ilike.%${search}%,content.ilike.%${search}%,user_email.ilike.%${search}%,movie_name.ilike.%${search}%`
      );
    }

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data: feedbacks, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items: FeedbackItem[] = (feedbacks || []).map((f) => ({
      id: f.id,
      user_id: f.user_id,
      user_email: f.user_email,
      user_name: f.user_name,
      rating: f.rating,
      category: f.category,
      subject: f.subject,
      content: f.content,
      movie_name: f.movie_name,
      episode_name: f.episode_name,
      movie_url: f.movie_url,
      status: f.status,
      admin_notes: f.admin_notes,
      admin_reply: f.admin_reply,
      created_at: f.created_at,
      updated_at: f.updated_at,
    }));

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      feedbacks: items,
      statusCounts,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (err: unknown) {
    console.error('Lỗi API feedbacks:', err);
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
    if (!body || !body.id) {
      return NextResponse.json({ error: 'Thiếu ID phản hồi' }, { status: 400 });
    }

    const { id, status, admin_notes, admin_reply } = body;

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (status && ['pending', 'in_progress', 'resolved', 'closed'].includes(status)) {
      updates.status = status;
    }
    if (admin_notes !== undefined) {
      updates.admin_notes = admin_notes;
    }
    if (admin_reply !== undefined) {
      updates.admin_reply = admin_reply;
    }

    const supabase = await createClient();
    const { error: updateError } = await supabase
      .from('feedbacks')
      .update(updates)
      .eq('id', id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Cập nhật phản hồi thành công.',
    });
  } catch (err: unknown) {
    console.error('Lỗi cập nhật feedback:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await verifyAdminSession();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID phản hồi' }, { status: 400 });
    }

    const supabase = await createClient();
    const { error: deleteError } = await supabase.from('feedbacks').delete().eq('id', id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Đã xóa phản hồi thành công.',
    });
  } catch (err: unknown) {
    console.error('Lỗi xóa feedback:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
