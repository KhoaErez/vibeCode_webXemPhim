-- ==============================================================================
-- RẠP NHÀ - SUPABASE DATABASE MIGRATION SCRIPT
-- ==============================================================================
-- Hướng dẫn:
-- 1. Mở trang quản trị Supabase: https://supabase.com/dashboard/project/pyefmwwjtsabrcprbnrb
-- 2. Vào mục "SQL Editor" ở menu bên trái.
-- 3. Tạo một "New query", dán toàn bộ đoạn mã bên dưới và nhấn "Run".
-- ==============================================================================

-- 1. BẢNG TIẾN ĐỘ XEM PHIM (watch_progress)
-- Cho phép lưu trữ và khôi phục tiến độ xem của từng tài khoản một cách an toàn.
CREATE TABLE IF NOT EXISTS public.watch_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    movie_slug TEXT NOT NULL,
    movie_name TEXT NOT NULL,
    movie_poster TEXT,
    episode_name TEXT NOT NULL,
    episode_slug TEXT,
    progress_seconds NUMERIC NOT NULL DEFAULT 0,
    duration_seconds NUMERIC DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT watch_progress_user_movie_episode_key UNIQUE (user_id, movie_slug, episode_name)
);

-- Index tăng tốc truy vấn danh sách "Tiếp tục xem" theo thời gian cập nhật gần nhất
CREATE INDEX IF NOT EXISTS idx_watch_progress_user_updated 
ON public.watch_progress(user_id, updated_at DESC);

-- Index tìm nhanh tiến độ của một phim cụ thể
CREATE INDEX IF NOT EXISTS idx_watch_progress_user_movie 
ON public.watch_progress(user_id, movie_slug);

-- Bật Row Level Security (RLS) để đảm bảo mỗi tài khoản chỉ xem/sửa tiến độ của chính mình
ALTER TABLE public.watch_progress ENABLE ROW LEVEL SECURITY;

-- Các chính sách RLS an toàn
DROP POLICY IF EXISTS "Users can view own watch progress" ON public.watch_progress;
CREATE POLICY "Users can view own watch progress" 
ON public.watch_progress FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own watch progress" ON public.watch_progress;
CREATE POLICY "Users can insert own watch progress" 
ON public.watch_progress FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own watch progress" ON public.watch_progress;
CREATE POLICY "Users can update own watch progress" 
ON public.watch_progress FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own watch progress" ON public.watch_progress;
CREATE POLICY "Users can delete own watch progress" 
ON public.watch_progress FOR DELETE 
TO authenticated 
USING (auth.uid() = user_id);

-- 2. BẢO ĐẢM QUYỀN TRÊN BẢNG PROFILES CHO NGƯỜI DÙNG GOOGLE OAUTH
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Public profiles are viewable by everyone') THEN
        CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can update own profile') THEN
        CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can insert own profile') THEN
        CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
    END IF;
END $$;
