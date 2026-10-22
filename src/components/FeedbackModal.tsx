'use client';

import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { useScrollLock } from '@/hooks/useScrollLock';

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
  'Báo lỗi video',
  'Lỗi phụ đề / âm thanh',
  'Tốc độ tải chậm',
  'Góp ý giao diện',
  'Đề xuất tính năng',
  'Sai thông tin phim',
  'Khác',
];

const RATING_LABELS: Record<number, string> = {
  1: 'Rất tệ 😞',
  2: 'Tạm được 😐',
  3: 'Hài lòng 🙂',
  4: 'Rất tốt 😊',
  5: 'Tuyệt vời! 🌟',
};

export default function FeedbackModal({
  isOpen,
  onClose,
  user,
  movieContext,
}: FeedbackModalProps) {
  const [type, setType] = useState(() => (movieContext ? 'Báo lỗi video' : 'Góp ý giao diện'));
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
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

  useScrollLock(isOpen);

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
        rating,
        subject: subject.trim(),
        content: content.trim(),
        userEmail: email.trim() || undefined,
        userId: user?.id,
        userName: user?.user_metadata?.full_name || user?.user_metadata?.name || undefined,
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
    setRating(5);
    if (!movieContext) {
      setSubject('');
      setType('Góp ý giao diện');
    }
  };

  const activeRating = hoverRating || rating;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-lg p-6 sm:p-8 shadow-2xl relative animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="cursor-pointer absolute top-3.5 right-3.5 text-zinc-400 hover:text-white transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-white/5 touch-target"
          title="Đóng"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {success ? (
          <div className="text-center py-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Đã ghi nhận góp ý!</h3>
            <p className="text-zinc-300 text-sm mb-6 max-w-sm mx-auto leading-relaxed">
              Ý kiến của bạn đã được lưu vào hệ thống và chuyển thẳng đến ban quản trị Rạp Nhà. Cảm ơn sự đồng hành quý báu của bạn!
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
              <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-500 flex items-center justify-center font-bold text-lg border border-orange-500/30 shrink-0">
                💬
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight">
                  Góp Ý & Báo Lỗi
                </h2>
                <p className="text-zinc-400 text-xs sm:text-sm">
                  Đánh giá trải nghiệm và phản hồi trực tiếp tới ban quản trị Rạp Nhà
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
              {/* Star Rating Section */}
              <div className="bg-zinc-950/80 border border-white/5 rounded-xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-2.5">
                <div>
                  <span className="block text-zinc-300 text-xs font-bold uppercase tracking-wider">
                    Đánh giá trải nghiệm
                  </span>
                  <span className="text-xs text-orange-400 font-medium">
                    {RATING_LABELS[activeRating] || 'Chọn mức độ hài lòng'}
                  </span>
                </div>

                <div className="flex items-center gap-1 sm:gap-1.5" onMouseLeave={() => setHoverRating(0)}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      className="cursor-pointer min-w-[40px] min-h-[40px] p-1.5 transition-transform hover:scale-125 focus:outline-none touch-target flex items-center justify-center rounded-lg hover:bg-white/5"
                      title={`${star} sao`}
                    >
                      <svg
                        className={`w-7 h-7 transition-colors duration-150 ${
                          star <= activeRating ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]' : 'text-zinc-700'
                        }`}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>

              {/* Type Selection */}
              <div>
                <label className="block text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">
                  Phân loại góp ý <span className="text-orange-500">*</span>
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
                    Tiêu đề <span className="text-orange-500">*</span>
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
                  placeholder="Ví dụ: Tập 5 bị mất tiếng, Thêm tính năng lưu danh sách xem sau..."
                />
              </div>

              {/* Sender Email (Optional) */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider">
                    Email của bạn <span className="text-zinc-500 lowercase font-normal">(không bắt buộc)</span>
                  </label>
                  {user && (
                    <span className="text-[11px] text-emerald-400">Đã đăng nhập ({user.email})</span>
                  )}
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
                  placeholder="Để ban quản trị có thể phản hồi cho bạn"
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
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl p-4 text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none leading-relaxed"
                  placeholder="Mô tả cụ thể sự cố bạn gặp phải hoặc ý tưởng cải tiến của bạn để ban quản trị Rạp Nhà hỗ trợ nhanh nhất..."
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
                    <span>Đang gửi phản hồi...</span>
                  </>
                ) : cooldown > 0 ? (
                  <span>Vui lòng đợi {cooldown}s...</span>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    <span>Gửi Góp Ý ({rating} ★)</span>
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
