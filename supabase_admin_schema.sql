-- ==============================================================================
-- RẠP NHÀ - SUPABASE DATABASE MIGRATION SCRIPT FOR ADMIN DASHBOARD
-- ==============================================================================
-- Hướng dẫn áp dụng:
-- 1. Đăng nhập Supabase Console: https://supabase.com/dashboard/project/pyefmwwjtsabrcprbnrb
-- 2. Chọn mục "SQL Editor" ở menu bên trái.
-- 3. Tạo một "New query", dán toàn bộ nội dung script này vào và bấm "Run".
-- Script an toàn (Idempotent), không làm mất dữ liệu hiện có.
-- ==============================================================================

-- 1. CẬP NHẬT BẢNG PROFILES (Thêm role, email, last_seen_at)
DO $$
BEGIN
    -- Thêm cột email nếu chưa có
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'email') THEN
        ALTER TABLE public.profiles ADD COLUMN email TEXT;
    END IF;

    -- Thêm cột role nếu chưa có (mặc định là 'user')
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'role') THEN
        ALTER TABLE public.profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'));
    END IF;

    -- Thêm cột last_seen_at nếu chưa có
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'last_seen_at') THEN
        ALTER TABLE public.profiles ADD COLUMN last_seen_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- Tạo index tìm kiếm và sắp xếp cho profiles
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON public.profiles(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles(created_at DESC);

-- Đồng bộ email từ auth.users vào profiles nếu bị thiếu
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND (p.email IS NULL OR p.email = '');

-- 2. HÀM KIỂM TRA QUYỀN ADMIN (SECURITY DEFINER)
-- Hàm này chạy với quyền cao nhất để kiểm tra xem auth.uid() hiện tại có phải admin không
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- 3. BẢO VỆ CỘT ROLE (CHỐNG NGƯỜI DÙNG TỰ NÂNG QUYỀN THÀNH ADMIN)
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Nếu trường role bị thay đổi
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Chỉ cho phép thay đổi nếu người thực hiện là admin hiện tại hoặc là service_role
    IF NOT (public.is_admin() OR auth.jwt() ->> 'role' = 'service_role') THEN
      NEW.role := OLD.role; -- Giữ nguyên role cũ, không cho phép tự sửa
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_role();

-- 4. BẢNG GÓP Ý & BÁO LỖI (feedbacks)
CREATE TABLE IF NOT EXISTS public.feedbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    user_name TEXT,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    category TEXT NOT NULL,
    subject TEXT NOT NULL,
    content TEXT NOT NULL,
    movie_name TEXT,
    episode_name TEXT,
    movie_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'closed')),
    admin_notes TEXT,
    admin_reply TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index cho feedbacks
CREATE INDEX IF NOT EXISTS idx_feedbacks_status ON public.feedbacks(status);
CREATE INDEX IF NOT EXISTS idx_feedbacks_created_at ON public.feedbacks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedbacks_category ON public.feedbacks(category);
CREATE INDEX IF NOT EXISTS idx_feedbacks_user_id ON public.feedbacks(user_id);

-- Bật RLS cho feedbacks
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;

-- Ai cũng có thể gửi góp ý (kể cả khách vãng lai và thành viên)
DROP POLICY IF EXISTS "Anyone can insert feedback" ON public.feedbacks;
CREATE POLICY "Anyone can insert feedback"
ON public.feedbacks FOR INSERT
TO public
WITH CHECK (true);

-- Người dùng xem được góp ý của chính họ, Admin xem được tất cả
DROP POLICY IF EXISTS "Users can view own feedback or admin views all" ON public.feedbacks;
CREATE POLICY "Users can view own feedback or admin views all"
ON public.feedbacks FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin());

-- Khách vãng lai gửi ẩn danh thì không xem lại danh sách qua client query
-- Chỉ Admin mới có quyền cập nhật trạng thái / ghi chú / phản hồi feedback
DROP POLICY IF EXISTS "Only admin can update feedback" ON public.feedbacks;
CREATE POLICY "Only admin can update feedback"
ON public.feedbacks FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Chỉ Admin mới có quyền xóa feedback
DROP POLICY IF EXISTS "Only admin can delete feedback" ON public.feedbacks;
CREATE POLICY "Only admin can delete feedback"
ON public.feedbacks FOR DELETE
TO authenticated
USING (public.is_admin());

-- 5. BẢNG THỐNG KÊ LƯỢT TRUY CẬP (page_views)
CREATE TABLE IF NOT EXISTS public.page_views (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    path TEXT NOT NULL,
    movie_slug TEXT,
    movie_name TEXT,
    device_type TEXT DEFAULT 'desktop',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index tăng tốc truy vấn thống kê ngày / tuần / tháng
CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON public.page_views(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_user ON public.page_views(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_movie ON public.page_views(movie_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_session ON public.page_views(session_id, created_at DESC);

-- Bật RLS cho page_views
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

-- Cho phép client ghi nhận lượt truy cập
DROP POLICY IF EXISTS "Anyone can insert page views" ON public.page_views;
CREATE POLICY "Anyone can insert page views"
ON public.page_views FOR INSERT
TO public
WITH CHECK (true);

-- Chỉ Admin mới có quyền xem thống kê page_views
DROP POLICY IF EXISTS "Only admin can view page views" ON public.page_views;
CREATE POLICY "Only admin can view page views"
ON public.page_views FOR SELECT
TO authenticated
USING (public.is_admin());

-- 6. TỰ ĐỘNG ĐỒNG BỘ USER MỚI VÀO PROFILES (Tối ưu Auth Trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email, avatar_url, role, created_at, last_seen_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', 'https://api.dicebear.com/7.x/avataaars/svg?seed=' || NEW.id::text),
    'user',
    NEW.created_at,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      last_seen_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. GÁN QUYỀN ADMIN BAN ĐẦU CHO EMAIL QUẢN TRỊ VIÊN
-- Tự động đặt role = 'admin' cho email quản trị viên khoadev27@gmail.com nếu đã tồn tại
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'khoadev27@gmail.com'
   OR id IN (SELECT id FROM auth.users WHERE email = 'khoadev27@gmail.com');

-- 8. CHO PHÉP ADMIN XEM TOÀN BỘ PROFILES ĐỂ QUẢN LÝ THÀNH VIÊN
-- Bổ sung policy để Admin có thể xem toàn bộ thành viên
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (true); -- profiles đã có Public profiles are viewable by everyone, đảm bảo luôn đọc được

DROP POLICY IF EXISTS "Admins can update user role" ON public.profiles;
CREATE POLICY "Admins can update user role"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id OR public.is_admin())
WITH CHECK (auth.uid() = id OR public.is_admin());
