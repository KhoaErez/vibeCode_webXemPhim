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
    return message; // fallback
  };

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  if (!isOpen) return null;

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
              username: username,
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

          <button type="submit" disabled={loading} className="cursor-pointer w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl mt-2 transition-colors disabled:opacity-50">
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
