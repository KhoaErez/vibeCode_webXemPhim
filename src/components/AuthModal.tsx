import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type AuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess?: () => void;
};

export default function AuthModal({ isOpen, onClose, onAuthSuccess }: AuthModalProps) {
  const translateAuthError = (message: string) => {
    if (message.includes('security purposes, you can only request this after')) {
      const seconds = message.match(/\d+/)?.[0] || '60';
      return `Hệ thống chống spam: Vui lòng đợi ${seconds} giây nữa rồi bấm Đăng Ký lại.`;
    }
    if (message.includes('User already registered')) return 'Tài khoản (Email) này đã tồn tại!';
    if (message.includes('Invalid login credentials')) return 'Email hoặc mật khẩu không chính xác!';
    if (message.includes('Password should be at least')) return 'Mật khẩu quá ngắn, vui lòng đặt ít nhất 6 ký tự!';
    if (message.includes('Email not confirmed')) return 'Tài khoản chưa được kích hoạt. Vui lòng kiểm tra hòm thư Email (hoặc mục Thư Rác/Spam) để xác thực!';
    if (message.includes('Rate limit exceeded')) return 'Bạn thao tác quá nhanh, vui lòng chờ một lát rồi thử lại!';
    if (message.includes('Unable to validate email address')) return 'Địa chỉ email không hợp lệ!';
    if (message.includes('popup') || message.includes('cancelled')) return 'Đã hủy đăng nhập Google.';
    return message;
  };

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const supabase = createClient();

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const currentPath = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/';
      const redirectUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(currentPath)}`;
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : 'Đã có lỗi khi đăng nhập bằng Google';
      setError(translateAuthError(rawMessage));
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'register') {
        if (password !== confirmPassword) {
          throw new Error('Mật khẩu nhập lại không khớp!');
        }
        if (!username.trim()) {
           throw new Error('Vui lòng nhập tên hiển thị!');
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: username.trim(),
            }
          }
        });
        if (error) throw error;
        onAuthSuccess?.();
        onClose();
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        onAuthSuccess?.();
        onClose();
      }
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : 'Đã có lỗi xảy ra';
      setError(translateAuthError(rawMessage));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md p-6 sm:p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
        <button onClick={onClose} className="cursor-pointer absolute top-4 right-4 text-zinc-400 hover:text-white">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        
        <h2 className="text-2xl font-bold text-white mb-6 text-center">
          {mode === 'login' ? 'Đăng Nhập' : 'Tạo Tài Khoản'}
        </h2>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-xl text-sm mb-6">
            {error}
          </div>
        )}

        {/* Google OAuth Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading || googleLoading}
          className="cursor-pointer w-full bg-zinc-800 hover:bg-zinc-750 border border-white/10 text-white font-semibold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-3 shadow-md hover:border-white/20 disabled:opacity-50"
        >
          {googleLoading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
          )}
          <span>{googleLoading ? 'Đang chuyển hướng...' : 'Tiếp tục với Google'}</span>
        </button>

        {/* Divider */}
        <div className="flex items-center my-5">
          <div className="flex-1 border-t border-white/10"></div>
          <span className="px-3 text-zinc-500 text-xs font-semibold uppercase tracking-wider">HOẶC</span>
          <div className="flex-1 border-t border-white/10"></div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === 'register' && (
            <div>
              <label className="block text-zinc-400 text-sm font-medium mb-1.5">Tên hiển thị</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)} required className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500" placeholder="Tên của bạn" />
            </div>
          )}
          
          <div>
            <label className="block text-zinc-400 text-sm font-medium mb-1.5">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500" placeholder="email@example.com" />
          </div>

          <div>
            <label className="block text-zinc-400 text-sm font-medium mb-1.5">Mật khẩu</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500" placeholder="••••••••" minLength={6} />
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-zinc-400 text-sm font-medium mb-1.5">Nhập lại mật khẩu</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500" placeholder="••••••••" minLength={6} />
            </div>
          )}

          <button type="submit" disabled={loading || googleLoading} className="cursor-pointer w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl mt-2 transition-colors disabled:opacity-50">
            {loading ? 'Đang xử lý...' : (mode === 'login' ? 'Đăng Nhập' : 'Đăng Ký')}
          </button>
        </form>

        <div className="mt-6 text-center text-zinc-400 text-sm">
          {mode === 'login' ? 'Chưa có tài khoản? ' : 'Đã có tài khoản? '}
          <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }} className="cursor-pointer text-orange-500 font-bold hover:underline">
            {mode === 'login' ? 'Đăng ký ngay' : 'Đăng nhập'}
          </button>
        </div>
      </div>
    </div>
  );
}
