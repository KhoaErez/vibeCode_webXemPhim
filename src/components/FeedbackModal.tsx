import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';

type FeedbackModalProps = {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  movieContext?: {
    name: string;
    episode?: string;
    url?: string;
  } | null;
};

const FEEDBACK_TYPES = [
  'Góp ý giao diện',
  'Đề xuất tính năng',
  'Báo lỗi video',
  'Lỗi phụ đề / âm thanh',
  'Sai thông tin phim',
  'Khác',
];

export default function FeedbackModal({
  isOpen,
  onClose,
  user,
  movieContext,
}: FeedbackModalProps) {
  const [type, setType] = useState(() => (movieContext ? 'Báo lỗi video' : 'Góp ý giao diện'));
  const [subject, setSubject] = useState(() =>
    movieContext ? `Lỗi phim: ${movieContext.name} - ${movieContext.episode || 'Tập 1'}` : ''
  );
  const [content, setContent] = useState('');
  const [email, setEmail] = useState(() => user?.email || '');
  const [includeMovieContext, setIncludeMovieContext] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (cooldown > 0) {
      setError(`Vui lòng đợi ${cooldown} giây trước khi gửi tiếp.`);
      return;
    }

    if (subject.trim().length < 3) {
      setError('Tiêu đề góp ý phải có ít nhất 3 ký tự.');
      return;
    }

    if (content.trim().length < 10) {
      setError('Nội dung góp ý chi tiết phải có ít nhất 10 ký tự.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        type,
        subject: subject.trim(),
        content: content.trim(),
        userEmail: email.trim() || undefined,
        userId: user?.id,
        movieName: includeMovieContext && movieContext ? movieContext.name : undefined,
        episodeName: includeMovieContext && movieContext ? movieContext.episode : undefined,
        movieUrl: includeMovieContext && movieContext ? movieContext.url : undefined,
      };

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || `Lỗi máy chủ (${res.status})`);
      }

      setSuccess(true);
      setCooldown(30); // 30s cooldown against rapid resubmission
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể gửi góp ý lúc này.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSuccess(false);
    setError('');
    setContent('');
    if (!movieContext) {
      setSubject('');
      setType('Góp ý giao diện');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-lg p-6 sm:p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="cursor-pointer absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
          title="Đóng"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {success ? (
          <div className="text-center py-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-500/30">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Đã gửi góp ý thành công!</h3>
            <p className="text-zinc-300 text-sm mb-6 max-w-sm mx-auto leading-relaxed">
              Ý kiến của bạn đã được chuyển thẳng tới hòm thư của quản trị viên Rạp Nhà. Xin chân thành cảm ơn sự đóng góp của bạn!
            </p>
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={resetForm}
                className="cursor-pointer px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-sm transition-colors border border-white/5"
              >
                Gửi góp ý khác
              </button>
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm transition-colors shadow-lg shadow-orange-500/20"
              >
                Đóng
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-500 flex items-center justify-center font-bold text-lg border border-orange-500/30">
                💬
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight">
                  Góp Ý & Báo Lỗi
                </h2>
                <p className="text-zinc-400 text-xs sm:text-sm">
                  Gửi trực tiếp phản hồi tới ban quản trị Rạp Nhà
                </p>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl text-sm mb-5 flex items-start gap-2">
                <svg className="w-5 h-5 shrink-0 mt-0.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Context Notice if opened from movie */}
            {movieContext && (
              <div className="mb-5 p-3 rounded-xl bg-zinc-950/80 border border-orange-500/30 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-zinc-300">
                  <span className="text-orange-400 font-bold">🎬 Phim liên quan:</span>
                  <span className="text-white font-semibold truncate max-w-[200px] sm:max-w-[260px]">
                    {movieContext.name} {movieContext.episode ? `(${movieContext.episode})` : ''}
                  </span>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer text-zinc-400 hover:text-white shrink-0 ml-2">
                  <input
                    type="checkbox"
                    checked={includeMovieContext}
                    onChange={(e) => setIncludeMovieContext(e.target.checked)}
                    className="accent-orange-500 rounded"
                  />
                  <span>Đính kèm</span>
                </label>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* Type Selection */}
              <div>
                <label className="block text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">
                  Loại góp ý <span className="text-orange-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {FEEDBACK_TYPES.map((t) => (
                    <button
                      type="button"
                      key={t}
                      onClick={() => setType(t)}
                      className={`cursor-pointer px-3 py-2 rounded-xl text-xs font-semibold text-center transition-all border ${
                        type === t
                          ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20'
                          : 'bg-zinc-950 text-zinc-300 border-white/10 hover:bg-zinc-800'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider">
                    Chủ đề <span className="text-orange-500">*</span>
                  </label>
                  <span className="text-[11px] text-zinc-500">{subject.length}/150</span>
                </div>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={150}
                  required
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
                  placeholder="Ví dụ: Tập 5 bị mất tiếng, Giao diện mobile bị tràn..."
                />
              </div>

              {/* Sender Email (Optional) */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider">
                    Email của bạn <span className="text-zinc-500 lowercase font-normal">(không bắt buộc)</span>
                  </label>
                  {user && (
                    <span className="text-[11px] text-emerald-400">Đã đăng nhập</span>
                  )}
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
                  placeholder="Để ban quản trị có thể phản hồi nếu cần"
                />
              </div>

              {/* Content */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider">
                    Nội dung chi tiết <span className="text-orange-500">*</span>
                  </label>
                  <span className="text-[11px] text-zinc-500">{content.length}/2500</span>
                </div>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={4}
                  maxLength={2500}
                  required
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl p-4 text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
                  placeholder="Mô tả chi tiết lỗi bạn gặp phải hoặc ý tưởng cải tiến của bạn dành cho Rạp Nhà..."
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || cooldown > 0}
                className="cursor-pointer w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-4 rounded-xl mt-2 transition-all shadow-lg shadow-orange-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Đang gửi đến quản trị viên...</span>
                  </>
                ) : cooldown > 0 ? (
                  <span>Vui lòng đợi {cooldown}s...</span>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    <span>Gửi Góp Ý</span>
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
