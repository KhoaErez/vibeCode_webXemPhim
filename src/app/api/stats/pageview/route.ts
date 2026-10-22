import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || !body.path) {
      return NextResponse.json({ success: false, message: 'Invalid payload' }, { status: 400 });
    }

    const { sessionId, path, movieSlug, movieName, deviceType } = body;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // 1. Ghi nhận lượt truy cập vào page_views
    try {
      await supabase.from('page_views').insert({
        session_id: sessionId || 'unknown_session',
        user_id: user ? user.id : null,
        path: String(path).substring(0, 255),
        movie_slug: movieSlug ? String(movieSlug).substring(0, 255) : null,
        movie_name: movieName ? String(movieName).substring(0, 255) : null,
        device_type: deviceType || 'desktop',
      });
    } catch (dbErr) {
      // Bỏ qua nếu bảng chưa được tạo trên Supabase
      console.warn('Lỗi ghi page_views:', dbErr);
    }

    // 2. Nếu đã đăng nhập, cập nhật last_seen_at trong profiles
    if (user) {
      try {
        await supabase
          .from('profiles')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', user.id);
      } catch (profileErr) {
        console.warn('Lỗi cập nhật last_seen_at:', profileErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
