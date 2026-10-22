import { createClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';
import type { AdminUserProfile } from '@/types/admin';

export type AdminAuthResult = {
  isAdmin: boolean;
  user: User | null;
  profile: AdminUserProfile | null;
  error?: string;
};

/**
 * Kiểm tra phân quyền Admin an toàn ở phía Server
 * Dựa trên Supabase SSR Session cookie và Database Profile Role
 */
export async function verifyAdminSession(): Promise<AdminAuthResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    // In development mode, allow test session cookie for automated E2E tests
    if (process.env.NODE_ENV === 'development') {
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      if (cookieStore.get('e2e_mock_admin')?.value === 'true') {
        return {
          isAdmin: true,
          user: { id: 'e2e-admin-id', email: 'admin@rapnha.com', user_metadata: {} } as User,
          profile: {
            id: 'e2e-admin-id',
            email: 'admin@rapnha.com',
            username: 'E2E Admin',
            role: 'admin',
            created_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
          },
        };
      }
    }

    if (userError || !user) {
      return { isAdmin: false, user: null, profile: null, error: 'Chưa đăng nhập' };
    }

    // Danh sách email quản trị viên cấu hình sẵn (fallback an toàn)
    const adminEmails = [
      process.env.FEEDBACK_RECEIVER_EMAIL?.trim().toLowerCase(),
      ...(process.env.ADMIN_EMAILS?.split(',').map((e) => e.trim().toLowerCase()) || []),
    ].filter(Boolean) as string[];

    const isConfiguredAdminEmail = !!user.email && adminEmails.includes(user.email.toLowerCase());

    // Lấy thông tin profile từ database
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError && !isConfiguredAdminEmail) {
      return { isAdmin: false, user, profile: null, error: 'Không thể xác thực quyền hạn' };
    }

    const hasDbAdminRole = profile?.role === 'admin';

    // Nếu email nằm trong danh sách admin nhưng profile chưa cập nhật role thì tự động đồng bộ
    if (isConfiguredAdminEmail && (!profile || profile.role !== 'admin')) {
      try {
        await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            email: user.email,
            username: profile?.username || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Admin',
            role: 'admin',
            last_seen_at: new Date().toISOString(),
          }, { onConflict: 'id' });
      } catch (e) {
        console.warn('Lỗi auto-sync admin profile:', e);
      }
    }

    const isAdmin = hasDbAdminRole || isConfiguredAdminEmail;

    return {
      isAdmin,
      user,
      profile: profile ? {
        id: profile.id,
        username: profile.username || 'Admin',
        email: profile.email || user.email,
        avatar_url: profile.avatar_url,
        role: (isAdmin ? 'admin' : 'user'),
        created_at: profile.created_at || new Date().toISOString(),
        last_seen_at: profile.last_seen_at,
      } : (isAdmin ? {
        id: user.id,
        username: user.email?.split('@')[0] || 'Admin',
        email: user.email,
        role: 'admin',
        created_at: new Date().toISOString(),
      } : null),
      error: isAdmin ? undefined : 'Tài khoản không có quyền quản trị viên',
    };
  } catch (err: unknown) {
    if ((err as { digest?: string })?.digest === 'DYNAMIC_SERVER_USAGE') {
      throw err;
    }
    console.error('Lỗi kiểm tra quyền admin:', err);
    return {
      isAdmin: false,
      user: null,
      profile: null,
      error: err instanceof Error ? err.message : 'Lỗi hệ thống',
    };
  }
}
