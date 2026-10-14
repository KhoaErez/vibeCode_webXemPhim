"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Hls from "hls.js";
import AuthModal from "@/components/AuthModal";
import JoinRoomModal from "@/components/JoinRoomModal";
import WatchRoomView from "@/components/WatchRoomView";
import FeedbackModal from "@/components/FeedbackModal";
import { createWatchRoom } from "@/lib/room";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import {
  saveWatchProgress,
  getMovieWatchProgress,
  fetchContinueWatchingList,
  deleteWatchProgress,
  formatWatchTime,
  syncLocalProgressToSupabase,
  WatchProgressItem,
} from "@/lib/watchProgress";

// --- Types cho API KKPhim ---
type KKPhimListMovie = {
  name: string;
  slug: string;
  origin_name: string;
  thumb_url: string;
  poster_url: string;
  year: number;
  time?: string;
  quality?: string;
  lang?: string;
  episode_current?: string;
};

type KKPhimDetailMovie = KKPhimListMovie & {
  director: string[];
  actor: string[];
  content: string;
  category: { id: string; name: string; slug: string }[];
};

type KKPhimEpisodeItem = {
  name: string;
  slug: string;
  filename: string;
  link_embed: string;
  link_m3u8: string;
};

type KKPhimEpisodes = {
  server_name: string;
  server_data: KKPhimEpisodeItem[];
}[];

type GenreItem = {
  name: string;
  slug: string;
  type: string;
};

type UserProfile = {
  id: string;
  username: string;
  avatar_url?: string;
  created_at?: string;
};

type WatchRoom = {
  id: string;
  room_code: string;
  host_id: string;
  movie_slug: string;
  movie_name: string;
  status: string;
};

// ==============================================================================
// TRÌNH PHÁT VIDEO HLS PLAYER (TÍCH HỢP LƯU TIẾN ĐỘ & RESUME)
// ==============================================================================
const HlsPlayer = ({
  src,
  movie,
  episode,
  user,
  onNextEpisode,
  onProgressSaved,
}: {
  src: string;
  movie?: KKPhimListMovie | null;
  episode?: KKPhimEpisodeItem | null;
  user: User | null;
  onNextEpisode?: () => void;
  onProgressSaved?: () => void;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [levels, setLevels] = useState<{ height: number; width?: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [isUIActive, setIsUIActive] = useState(true);
  const uiTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastToggleTime = useRef(0);
  const lastSavedTimeRef = useRef(0);
  const isCompletedRef = useRef(false);
  const supabase = createClient();

  // State cho thông báo tiếp tục xem dở & đếm ngược tập tiếp theo
  const [resumePrompt, setResumePrompt] = useState<{ seconds: number; formatted: string } | null>(null);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);

  useEffect(() => {
    const handleActivity = () => {
      setIsUIActive(true);
      if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
      if (!showSettings) {
        uiTimeoutRef.current = setTimeout(() => setIsUIActive(false), 3000);
      }
    };

    handleActivity();
    return () => {
      if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
    };
  }, [showSettings]);

  // Kiểm tra tiến độ đã lưu khi tập phim tải lên
  useEffect(() => {
    isCompletedRef.current = false;
    lastSavedTimeRef.current = 0;

    if (!movie || !episode) return;

    let isMounted = true;
    getMovieWatchProgress(supabase, user, movie.slug, episode.name).then((saved) => {
      if (!isMounted || !saved) return;
      // Chỉ hiện prompt nếu đã xem được trên 10s và chưa xem hết
      if (saved.progress_seconds > 10 && !saved.completed) {
        setResumePrompt({
          seconds: saved.progress_seconds,
          formatted: formatWatchTime(saved.progress_seconds),
        });
      }
    });

    return () => {
      isMounted = false;
      setResumePrompt(null);
      setNextCountdown(null);
    };
  }, [movie, episode, user, supabase]);

  // Tự động ẩn banner tiếp tục xem sau 12 giây nếu người xem không bấm
  useEffect(() => {
    if (!resumePrompt) return;
    const timer = setTimeout(() => {
      setResumePrompt(null);
    }, 12000);
    return () => clearTimeout(timer);
  }, [resumePrompt]);

  // Đếm ngược tự động chuyển tập khi gần hết phim
  useEffect(() => {
    if (nextCountdown === null) return;
    const timer = setInterval(() => {
      setNextCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          if (onNextEpisode) onNextEpisode();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [nextCountdown, onNextEpisode]);

  // Lưu tiến độ khi người dùng rời trang, tắt tab hoặc ẩn trình duyệt
  useEffect(() => {
    const saveCurrentProgress = () => {
      const video = videoRef.current;
      if (!video || !movie || !episode) return;
      const current = video.currentTime;
      const dur = video.duration || 0;
      if (current > 5) {
        const isNearEnd = dur > 60 && dur - current <= 30;
        saveWatchProgress(supabase, user, {
          movie_slug: movie.slug,
          movie_name: movie.name,
          movie_poster: movie.poster_url || movie.thumb_url || '',
          episode_name: episode.name,
          episode_slug: episode.slug || '',
          progress_seconds: isNearEnd ? 0 : current,
          duration_seconds: dur,
          completed: isNearEnd,
        });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveCurrentProgress();
      }
    };

    window.addEventListener('beforeunload', saveCurrentProgress);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', saveCurrentProgress);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      saveCurrentProgress();
    };
  }, [movie, episode, user, supabase]);

  // Khởi tạo nguồn HLS
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    if (Hls.isSupported()) {
      const hls = new Hls({ maxMaxBufferLength: 100 });
      hlsRef.current = hls;

      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setLevels(data.levels);

        const savedQuality = localStorage.getItem('preferred_quality');
        if (savedQuality && savedQuality !== 'auto') {
          const targetHeight = parseInt(savedQuality, 10);
          const index = data.levels.findIndex((l: { height: number }) => l.height === targetHeight);
          if (index !== -1) {
            hls.currentLevel = index;
            setCurrentLevel(index);
          }
        }

        video.play().catch((e) => console.log('Play failed', e));
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch((e) => console.log('Play failed', e));
      });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [src]);

  // Xử lý đổi chất lượng video
  const handleQualityChange = (index: number, height?: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
      setCurrentLevel(index);
      if (index === -1) {
        localStorage.setItem('preferred_quality', 'auto');
      } else if (height) {
        localStorage.setItem('preferred_quality', height.toString());
      }
    }
    setShowSettings(false);
  };

  // Xử lý đổi tốc độ phát
  const handleSpeedChange = (rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      setPlaybackRate(rate);
    }
    setShowSettings(false);
  };

  // Throttle cập nhật tiến độ xem khi đang phát (mỗi 12 giây)
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !movie || !episode) return;
    const current = video.currentTime;
    const dur = video.duration || 0;

    // Khi cách đoạn kết dưới 30 giây: đánh dấu xem xong để tránh sau này mở lại ngay kết thúc
    if (dur > 60 && dur - current <= 30) {
      if (!isCompletedRef.current) {
        isCompletedRef.current = true;
        saveWatchProgress(supabase, user, {
          movie_slug: movie.slug,
          movie_name: movie.name,
          movie_poster: movie.poster_url || movie.thumb_url || '',
          episode_name: episode.name,
          episode_slug: episode.slug || '',
          progress_seconds: 0,
          duration_seconds: dur,
          completed: true,
        });
        onProgressSaved?.();

        if (onNextEpisode && nextCountdown === null) {
          setNextCountdown(10);
        }
      }
      return;
    }

    // Ghi tiến độ định kỳ mỗi 12 giây
    if (Math.abs(current - lastSavedTimeRef.current) >= 12 && current > 5) {
      lastSavedTimeRef.current = current;
      saveWatchProgress(supabase, user, {
        movie_slug: movie.slug,
        movie_name: movie.name,
        movie_poster: movie.poster_url || movie.thumb_url || '',
        episode_name: episode.name,
        episode_slug: episode.slug || '',
        progress_seconds: current,
        duration_seconds: dur,
        completed: false,
      });
      onProgressSaved?.();
    }
  };

  // Ghi tiến độ ngay khi tạm dừng video
  const handlePause = () => {
    lastToggleTime.current = Date.now();
    const video = videoRef.current;
    if (!video || !movie || !episode) return;
    const current = video.currentTime;
    const dur = video.duration || 0;
    if (current > 5 && (dur === 0 || dur - current > 30)) {
      saveWatchProgress(supabase, user, {
        movie_slug: movie.slug,
        movie_name: movie.name,
        movie_poster: movie.poster_url || movie.thumb_url || '',
        episode_name: episode.name,
        episode_slug: episode.slug || '',
        progress_seconds: current,
        duration_seconds: dur,
        completed: false,
      });
      lastSavedTimeRef.current = current;
      onProgressSaved?.();
    }
  };

  // Xử lý khi video kết thúc
  const handleEnded = () => {
    lastToggleTime.current = Date.now();
    const video = videoRef.current;
    if (!video || !movie || !episode) return;

    saveWatchProgress(supabase, user, {
      movie_slug: movie.slug,
      movie_name: movie.name,
      movie_poster: movie.poster_url || movie.thumb_url || '',
      episode_name: episode.name,
      episode_slug: episode.slug || '',
      progress_seconds: 0,
      duration_seconds: video.duration || 0,
      completed: true,
    });
    onProgressSaved?.();

    if (onNextEpisode) {
      onNextEpisode();
    }
  };

  return (
    <div
      className="relative w-full h-full group bg-black rounded-2xl"
      onMouseMove={() => {
        setIsUIActive(true);
        if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
        if (!showSettings) uiTimeoutRef.current = setTimeout(() => setIsUIActive(false), 3000);
      }}
      onTouchStart={() => {
        setIsUIActive(true);
        if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
        if (!showSettings) uiTimeoutRef.current = setTimeout(() => setIsUIActive(false), 3000);
      }}
      onClick={() => {
        setIsUIActive(true);
        if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
        if (!showSettings) uiTimeoutRef.current = setTimeout(() => setIsUIActive(false), 3000);
      }}
    >
      <video
        ref={videoRef}
        className="cursor-pointer w-full h-full object-contain rounded-2xl"
        controls
        playsInline
        autoPlay
        onPlay={() => {
          lastToggleTime.current = Date.now();
        }}
        onPause={handlePause}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onSeeking={() => {
          lastToggleTime.current = Date.now();
        }}
        onSeeked={() => {
          lastToggleTime.current = Date.now();
        }}
        onVolumeChange={() => {
          lastToggleTime.current = Date.now();
        }}
        onRateChange={() => {
          lastToggleTime.current = Date.now();
        }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          if (rect.height - (e.clientY - rect.top) < 70) return;

          setTimeout(() => {
            if (Date.now() - lastToggleTime.current < 150) return;
            if (videoRef.current) {
              if (videoRef.current.paused) videoRef.current.play();
              else videoRef.current.pause();
            }
          }, 50);
        }}
        onTouchEnd={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const touch = e.changedTouches[0];
          if (rect.height - (touch.clientY - rect.top) < 70) return;

          setTimeout(() => {
            if (Date.now() - lastToggleTime.current < 150) return;
            if (videoRef.current) {
              if (videoRef.current.paused) videoRef.current.play();
              else videoRef.current.pause();
            }
          }, 50);
        }}
      />

      {/* Thông báo tiếp tục xem dở (Floating Resume Prompt) */}
      {resumePrompt && (
        <div className="absolute bottom-16 left-4 right-4 sm:left-6 sm:right-auto sm:max-w-md z-40 bg-zinc-900/95 backdrop-blur-md border border-orange-500/40 rounded-2xl p-4 shadow-2xl animate-in fade-in slide-in-from-bottom-3 duration-300">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0 border border-orange-500/30">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white font-bold text-sm leading-tight mb-1">
                Bạn đang xem dở tại <span className="text-orange-400 font-extrabold">{resumePrompt.formatted}</span>
              </div>
              <p className="text-zinc-400 text-xs mb-3">Bạn có muốn tiếp tục xem từ thời điểm này không?</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = resumePrompt.seconds;
                      videoRef.current.play().catch(() => {});
                    }
                    setResumePrompt(null);
                  }}
                  className="cursor-pointer px-4 py-1.5 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-lg transition-all shadow-md shadow-orange-500/20 flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Tiếp tục xem
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = 0;
                    }
                    setResumePrompt(null);
                  }}
                  className="cursor-pointer px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-semibold text-xs rounded-lg transition-colors border border-white/5"
                >
                  Xem lại từ đầu
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setResumePrompt(null)}
              className="cursor-pointer text-zinc-500 hover:text-white p-1"
              title="Đóng thông báo"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Banner đếm ngược chuyển tập kế tiếp */}
      {nextCountdown !== null && onNextEpisode && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-zinc-900/95 backdrop-blur-md border border-orange-500/50 rounded-2xl px-5 py-3 shadow-2xl flex items-center gap-4 animate-in fade-in zoom-in-95">
          <span className="text-white text-xs sm:text-sm font-semibold">
            Tập tiếp theo sau <strong className="text-orange-400 font-extrabold">{nextCountdown}s</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              setNextCountdown(null);
              onNextEpisode();
            }}
            className="cursor-pointer px-3 py-1 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-lg shadow-md"
          >
            Chuyển ngay
          </button>
          <button
            type="button"
            onClick={() => setNextCountdown(null)}
            className="cursor-pointer text-zinc-400 hover:text-white text-xs"
          >
            Hủy
          </button>
        </div>
      )}

      {/* Nút Cài đặt Chất lượng & Tốc độ */}
      <div className="absolute top-4 right-4 z-50">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`cursor-pointer w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur text-white flex items-center justify-center transition-all md:opacity-0 md:group-hover:opacity-100 ${
            isUIActive || showSettings ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          title="Cài đặt phát"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {showSettings && (
          <div className="absolute top-12 right-0 bg-black/90 backdrop-blur-md rounded-xl p-3 border border-white/10 w-56 animate-in fade-in zoom-in-95 shadow-2xl">
            {levels.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] font-bold text-zinc-400 mb-2 uppercase tracking-wider">Chất lượng</div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => handleQualityChange(-1)}
                    className={`cursor-pointer px-2 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      currentLevel === -1 ? 'bg-orange-500 text-white' : 'bg-white/5 text-zinc-300 hover:bg-white/10'
                    }`}
                  >
                    Auto
                  </button>
                  {levels.slice().reverse().map((level, idx) => {
                    const originalIndex = levels.length - 1 - idx;
                    const getQualityLabel = (l: { height: number; width?: number }) => {
                      if ((l.width && l.width >= 1900) || l.height >= 1000 || l.height === 804) return '1080p';
                      if ((l.width && l.width >= 1200) || l.height >= 700 || l.height === 536) return '720p';
                      if ((l.width && l.width >= 800) || l.height >= 480 || l.height === 358) return '480p';
                      return `${l.height}p`;
                    };
                    return (
                      <button
                        key={originalIndex}
                        onClick={() => handleQualityChange(originalIndex, level.height)}
                        className={`cursor-pointer px-2 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                          currentLevel === originalIndex ? 'bg-orange-500 text-white' : 'bg-white/5 text-zinc-300 hover:bg-white/10'
                        }`}
                      >
                        {getQualityLabel(level)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <div className="text-[10px] font-bold text-zinc-400 mb-2 uppercase tracking-wider">Tốc độ</div>
              <div className="grid grid-cols-3 gap-1.5">
                {[0.5, 1, 1.25, 1.5, 2].map((rate) => (
                  <button
                    key={`speed-${rate}`}
                    onClick={() => handleSpeedChange(rate)}
                    className={`cursor-pointer px-2 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      playbackRate === rate ? 'bg-orange-500 text-white' : 'bg-white/5 text-zinc-300 hover:bg-white/10'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ==============================================================================
// DANH SÁCH THỂ LOẠI & UTILITIES
// ==============================================================================
const genresMap: GenreItem[] = [
  { name: "Tất cả", slug: "phim-moi-cap-nhat", type: "latest" },
  { name: "Chính kịch", slug: "chinh-kich", type: "the-loai" },
  { name: "Hồi hộp", slug: "tam-ly", type: "the-loai" },
  { name: "Hoạt hình", slug: "hoat-hinh", type: "the-loai" },
  { name: "Phiêu lưu", slug: "phieu-luu", type: "the-loai" },
  { name: "Viễn tưởng", slug: "vien-tuong", type: "the-loai" },
  { name: "Hành động", slug: "hanh-dong", type: "the-loai" },
  { name: "Lãng mạn", slug: "tinh-cam", type: "the-loai" },
  { name: "Hài hước", slug: "hai-huoc", type: "the-loai" },
];

const getImage = (url: string | undefined) => {
  if (!url) return undefined;
  return url.startsWith("http") ? url : `https://phimimg.com/${url}`;
};

const getScore = (slug: string) => {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  }
  return (6.5 + (Math.abs(hash) % 30) / 10).toFixed(1);
};

const MovieCard = ({
  movie,
  onSelectMovie,
  className = "",
}: {
  movie: KKPhimListMovie;
  onSelectMovie: (m: KKPhimListMovie) => void;
  className?: string;
}) => (
  <button
    onClick={() => onSelectMovie(movie)}
    className={`text-left group outline-none cursor-pointer flex flex-col ${className}`}
  >
    <div className="aspect-poster w-full rounded-xl mb-3 relative overflow-hidden flex flex-col justify-end shadow-md transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl group-focus-visible:ring-2 ring-orange-500/50 bg-zinc-900 border border-white/5">
      <img
        src={getImage(movie.thumb_url || movie.poster_url)}
        alt={movie.name}
        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-transparent to-transparent opacity-80 group-hover:opacity-100 transition-opacity"></div>

      <div className="absolute top-2 left-2 bg-zinc-950/80 backdrop-blur-sm text-orange-500 border border-orange-500/30 text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1">
        ★ {getScore(movie.slug)}
      </div>
      {movie.episode_current && (
        <div className="absolute top-2 right-2 bg-orange-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded shadow-sm z-20">
          {movie.episode_current}
        </div>
      )}

      {/* Bottom Badges */}
      <div className="absolute bottom-0 left-0 w-full p-2 flex justify-between items-center z-20 gap-1">
        {movie.lang && (
          <span className="text-[9px] font-medium uppercase tracking-wider text-white bg-white/20 backdrop-blur-md px-1.5 py-0.5 rounded truncate max-w-[70%]">
            {movie.lang}
          </span>
        )}
        {movie.quality && (
          <span className="text-[9px] font-medium uppercase tracking-wider text-orange-400 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded ml-auto">
            {movie.quality}
          </span>
        )}
      </div>
    </div>
    <h3 className="font-semibold text-sm leading-tight mb-1 line-clamp-1 group-hover:text-orange-500 transition-colors text-white mt-2">
      {movie.name}
    </h3>
  </button>
);

const MovieRow = ({
  title,
  url,
  onSelectMovie,
}: {
  title: string;
  url: string;
  onSelectMovie: (m: KKPhimListMovie) => void;
}) => {
  const [movies, setMovies] = useState<KKPhimListMovie[]>([]);
  useEffect(() => {
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setMovies(data?.data?.items || data?.items || []);
      })
      .catch((err) => console.warn('Lỗi tải hàng phim:', err));
  }, [url]);

  if (movies.length === 0) return null;
  return (
    <div className="mb-10 w-full">
      <h2 className="text-xl md:text-2xl font-bold text-white mb-4 flex items-center justify-between group cursor-pointer border-l-4 border-orange-500 pl-3">
        {title}
        <svg className="w-5 h-5 text-zinc-500 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </h2>
      <div className="flex overflow-x-auto gap-4 snap-x custom-scrollbar pb-4" style={{ WebkitOverflowScrolling: 'touch' }}>
        {movies.map((m) => (
          <MovieCard key={m.slug} movie={m} onSelectMovie={onSelectMovie} className="w-[140px] md:w-[180px] lg:w-[200px] shrink-0 snap-start" />
        ))}
      </div>
    </div>
  );
};

// ==============================================================================
// TRANG CHỦ HOME COMPONENT
// ==============================================================================
export default function Home() {
  const [movies, setMovies] = useState<KKPhimListMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentGenre, setCurrentGenre] = useState<GenreItem>(genresMap[0]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [currentSort, setCurrentSort] = useState("rating");

  // Auth states
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isJoinRoomOpen, setIsJoinRoomOpen] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<WatchRoom | null>(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [showRoomWarningModal, setShowRoomWarningModal] = useState(false);
  const [showAuthWarningModal, setShowAuthWarningModal] = useState(false);
  const [authErrorToast, setAuthErrorToast] = useState<string | null>(null);
  const supabase = createClient();

  // Watch Progress states (Tính năng 1)
  const [continueWatching, setContinueWatching] = useState<WatchProgressItem[]>([]);
  const [movieProgress, setMovieProgress] = useState<WatchProgressItem | null>(null);

  // Feedback states (Tính năng 2)
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackMovieContext, setFeedbackMovieContext] = useState<{
    name: string;
    episode?: string;
    url?: string;
  } | null>(null);

  const handleNavigationAttempt = (e?: React.MouseEvent) => {
    if (currentRoom) {
      if (e && e.preventDefault) e.preventDefault();
      setShowRoomWarningModal(true);
      return false;
    }
    return true;
  };

  // Lắng nghe phiên đăng nhập Supabase Auth & Google OAuth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setUserProfile(null);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setUserProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // Kiểm tra lỗi xác thực OAuth từ URL query params
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const authErr = params.get('auth_error');
      if (authErr) {
        const decoded = decodeURIComponent(authErr);
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
        setTimeout(() => setAuthErrorToast(decoded), 0);
      }
    }
  }, []);

  // Tải hồ sơ người dùng hoặc tạo hồ sơ mới cho người dùng Google
  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
      .then(async ({ data }) => {
        if (!isMounted) return;
        if (data) {
          if (!data.username && user.email) {
            const fallbackUsername = user.email.split('@')[0];
            await supabase.from('profiles').update({ username: fallbackUsername }).eq('id', user.id);
            data.username = fallbackUsername;
          }
          setUserProfile(data);
        } else {
          // Người dùng Google lần đầu đăng nhập: tạo hồ sơ tài khoản tự động
          const rawName = user.user_metadata?.full_name || user.user_metadata?.name;
          const fallbackUsername = user.email ? user.email.split('@')[0] : 'Khán giả';
          const username = rawName && rawName.trim() ? rawName.trim() : fallbackUsername;
          const avatarUrl =
            user.user_metadata?.avatar_url ||
            user.user_metadata?.picture ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`;

          const newProfile = { id: user.id, username, avatar_url: avatarUrl };
          await supabase.from('profiles').insert(newProfile);
          if (isMounted) setUserProfile(newProfile);
        }
      });

    // Đồng bộ dữ liệu xem phim dở từ LocalStorage lên Supabase
    syncLocalProgressToSupabase(supabase, user);

    return () => {
      isMounted = false;
    };
  }, [user, supabase]);

  // Tải danh sách phim tiếp tục xem dở (Continue Watching)
  const refreshContinueWatching = useCallback(async () => {
    const list = await fetchContinueWatchingList(supabase, user);
    setContinueWatching(list);
  }, [supabase, user]);

  useEffect(() => {
    let isMounted = true;
    fetchContinueWatchingList(supabase, user).then((list) => {
      if (isMounted) setContinueWatching(list);
    });
    return () => {
      isMounted = false;
    };
  }, [supabase, user]);

  // API Quốc gia
  const [countries, setCountries] = useState<{ name: string; slug: string }[]>([]);
  useEffect(() => {
    fetch("https://phimapi.com/quoc-gia")
      .then((res) => res.json())
      .then((data) => {
        if (data?.data?.items) {
          setCountries(data.data.items);
        }
      })
      .catch(console.error);
  }, []);

  // Hero featured movie state
  const [featuredMovie, setFeaturedMovie] = useState<KKPhimListMovie | null>(null);

  // Scroll state for header
  const [isScrolled, setIsScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<KKPhimListMovie[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Detail Page states
  const [selectedMovie, setSelectedMovie] = useState<KKPhimListMovie | null>(null);
  const [movieDetail, setMovieDetail] = useState<KKPhimDetailMovie | null>(null);
  const [episodesDetail, setEpisodesDetail] = useState<KKPhimEpisodes | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Player states
  const [currentEpisode, setCurrentEpisode] = useState<KKPhimEpisodeItem | null>(null);
  const [playing, setPlaying] = useState(false);
  const [episodeChunk, setEpisodeChunk] = useState(0);

  // Mobile Menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mobileExpandedSection, setMobileExpandedSection] = useState<string | null>(null);

  // Tải tiến độ xem khi chọn một phim cụ thể
  useEffect(() => {
    if (!selectedMovie) return;
    let isMounted = true;
    getMovieWatchProgress(supabase, user, selectedMovie.slug).then((p) => {
      if (isMounted) setMovieProgress(p);
    });
    return () => {
      isMounted = false;
      setMovieProgress(null);
    };
  }, [selectedMovie, user, supabase]);

  // Fetch Danh sách phim chính
  useEffect(() => {
    const fetchMovies = async () => {
      setLoading(true);
      try {
        let url = `https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=${currentPage}`;
        if (currentGenre.type === "the-loai") {
          url = `https://phimapi.com/v1/api/the-loai/${currentGenre.slug}?page=${currentPage}`;
        } else if (currentGenre.type === "quoc-gia") {
          url = `https://phimapi.com/v1/api/quoc-gia/${currentGenre.slug}?page=${currentPage}`;
        } else if (currentGenre.type === "danh-sach") {
          url = `https://phimapi.com/v1/api/danh-sach/${currentGenre.slug}?page=${currentPage}`;
        }
        const res = await fetch(url);
        const data = await res.json();

        const items = data?.data?.items || data?.items || [];
        setMovies(items);

        const total = data?.data?.params?.pagination?.totalPages || data?.pagination?.totalPages || 1;
        setTotalPages(total);

        if (items.length > 0) {
          const bestMovie = [...items].sort((a, b) => parseFloat(getScore(b.slug)) - parseFloat(getScore(a.slug)))[0];
          setFeaturedMovie(bestMovie);
        } else {
          setFeaturedMovie(null);
        }
      } catch (error) {
        console.error("Lỗi khi tải phim:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchMovies();
  }, [currentGenre, currentPage]);

  const sortedMovies = [...movies].sort((a, b) => {
    const yearA = Number(a.year) || 0;
    const yearB = Number(b.year) || 0;
    if (currentSort === 'newest') return yearB - yearA;
    if (currentSort === 'az') return a.name.localeCompare(b.name);
    if (currentSort === 'rating') return parseFloat(getScore(b.slug)) - parseFloat(getScore(a.slug));
    return 0;
  });

  useEffect(() => {
    if (sortedMovies.length > 0 && featuredMovie) {
      const exists = sortedMovies.find((m) => m.slug === featuredMovie.slug);
      if (!exists) {
        setTimeout(() => setFeaturedMovie(sortedMovies[0]), 0);
      }
    }
  }, [sortedMovies, featuredMovie]);

  // Live Search
  useEffect(() => {
    if (!searchQuery.trim()) {
      return;
    }

    const searchTimer = setTimeout(async () => {
      setIsSearching(true);
      setShowDropdown(true);
      try {
        const res = await fetch(`https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        const items = data?.data?.items || [];
        setSearchResults(items);
      } catch (err) {
        console.error("Lỗi khi tìm kiếm:", err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(searchTimer);
  }, [searchQuery]);

  const handleSelectMovie = async (movie: KKPhimListMovie) => {
    setSelectedMovie(movie);
    setMovieDetail(null);
    setEpisodesDetail(null);
    setPlaying(false);
    setCurrentEpisode(null);
    setEpisodeChunk(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    setDetailLoading(true);
    try {
      const res = await fetch(`https://phimapi.com/phim/${movie.slug}`);
      const data = await res.json();
      if (data.status) {
        setMovieDetail(data.movie);
        setEpisodesDetail(data.episodes);
      }
    } catch (error) {
      console.error("Lỗi khi tải chi tiết phim:", error);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCloseMovie = () => {
    setSelectedMovie(null);
    setMovieDetail(null);
    setEpisodesDetail(null);
    setPlaying(false);
    setCurrentEpisode(null);
    setEpisodeChunk(0);
    refreshContinueWatching();
  };

  const handleGenreChange = (genre: GenreItem) => {
    setCurrentGenre(genre);
    setCurrentPage(1);
    handleCloseMovie();
  };

  const playEpisode = (episode: KKPhimEpisodeItem) => {
    setCurrentEpisode(episode);
    setPlaying(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const playFirstEpisode = () => {
    if (episodesDetail && episodesDetail[0]?.server_data?.length > 0) {
      playEpisode(episodesDetail[0].server_data[0]);
    }
  };

  // Chuyển sang tập tiếp theo trong danh sách phim bộ
  const handleNextEpisode = () => {
    if (!episodesDetail || !episodesDetail[0]?.server_data || !currentEpisode) return;
    const all = episodesDetail[0].server_data;
    const currentIndex = all.findIndex((ep) => ep.name === currentEpisode.name);
    if (currentIndex >= 0 && currentIndex < all.length - 1) {
      playEpisode(all[currentIndex + 1]);
    }
  };

  // Mở phim và tiếp tục đúng tập, đúng thời điểm từ mục "Tiếp tục xem"
  const handleResumeFromContinueWatching = async (item: WatchProgressItem) => {
    if (!handleNavigationAttempt()) return;

    const movieObj: KKPhimListMovie = {
      name: item.movie_name,
      slug: item.movie_slug,
      origin_name: '',
      thumb_url: item.movie_poster || '',
      poster_url: item.movie_poster || '',
      year: new Date().getFullYear(),
    };

    setSelectedMovie(movieObj);
    setMovieDetail(null);
    setEpisodesDetail(null);
    setPlaying(false);
    setCurrentEpisode(null);
    setEpisodeChunk(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    setDetailLoading(true);
    try {
      const res = await fetch(`https://phimapi.com/phim/${item.movie_slug}`);
      const data = await res.json();
      if (data.status) {
        setMovieDetail(data.movie);
        setEpisodesDetail(data.episodes);

        const allEpisodes = data.episodes?.[0]?.server_data || [];
        const targetEpisode =
          allEpisodes.find((ep: KKPhimEpisodeItem) => ep.name === item.episode_name) || allEpisodes[0];

        if (targetEpisode) {
          setCurrentEpisode(targetEpisode);
          setPlaying(true);
        }
      }
    } catch (err) {
      console.error("Lỗi khi mở phim tiếp tục xem:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  // Xóa tiến độ một phim khỏi danh sách xem dở
  const handleDeleteProgress = async (movieSlug: string, episodeName?: string) => {
    await deleteWatchProgress(supabase, user, movieSlug, episodeName);
    setContinueWatching((prev) => prev.filter((p) => p.movie_slug !== movieSlug));
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 relative selection:bg-orange-500/30 selection:text-orange-200">
      {/* Toast thông báo lỗi OAuth nếu có */}
      {authErrorToast && (
        <div className="fixed bottom-6 right-6 z-[120] bg-zinc-900 border border-red-500/50 rounded-2xl p-4 shadow-2xl flex items-start gap-3 max-w-md animate-in slide-in-from-bottom-5">
          <div className="w-8 h-8 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1 text-sm text-zinc-200">
            <div className="font-bold text-white mb-0.5">Thông báo xác thực</div>
            <div>{authErrorToast}</div>
          </div>
          <button
            onClick={() => setAuthErrorToast(null)}
            className="cursor-pointer text-zinc-400 hover:text-white p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header - Transparent to Solid on Scroll */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-500 ${
          isScrolled
            ? 'bg-zinc-950/95 backdrop-blur-md shadow-2xl border-b border-white/5'
            : 'bg-gradient-to-b from-black/80 via-black/30 to-transparent'
        }`}
      >
        <div className="max-w-[95%] mx-auto px-4 py-4 flex flex-col xl:flex-row items-center gap-4 2xl:gap-6 justify-between">
          <div className="flex flex-col md:flex-row items-center gap-4 w-full xl:w-auto shrink-0">
            <div className="flex items-center justify-between w-full md:w-auto">
              <div className="flex items-center gap-3">
                <button
                  className="xl:hidden text-zinc-300 hover:text-white cursor-pointer"
                  onClick={() => {
                    if (!handleNavigationAttempt()) return;
                    setIsMobileMenuOpen(true);
                  }}
                >
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (!handleNavigationAttempt(e)) return;
                    handleGenreChange(genresMap[0]);
                  }}
                  className="cursor-pointer text-3xl font-extrabold tracking-wide text-white shrink-0 hover:opacity-80 transition-opacity"
                >
                  Rạp<span className="text-orange-500">Nhà</span>
                </a>
              </div>
            </div>

            {/* Search Bar */}
            <div className="w-full md:w-[240px] 2xl:w-[320px] relative shrink">
              <input
                type="search"
                placeholder="Tìm kiếm phim, diễn viên..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => {
                  if (searchResults.length > 0) setShowDropdown(true);
                }}
                className="w-full bg-zinc-900/80 backdrop-blur-md text-white text-xs md:text-sm px-4 py-2 rounded-full border border-white/10 focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder-zinc-400"
              />
              {isSearching && (
                <div className="absolute right-3 top-2.5">
                  <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}

              {/* Live Search Dropdown */}
              {showDropdown && searchResults.length > 0 && (
                <div className="absolute top-12 left-0 right-0 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl p-2 z-50 max-h-80 overflow-y-auto custom-scrollbar">
                  {searchResults.map((m) => (
                    <div
                      key={m.slug}
                      onClick={() => {
                        handleSelectMovie(m);
                        setShowDropdown(false);
                        setSearchQuery("");
                      }}
                      className="cursor-pointer flex items-center gap-3 p-2 hover:bg-zinc-800 rounded-xl transition-colors"
                    >
                      <img
                        src={getImage(m.thumb_url || m.poster_url)}
                        alt={m.name}
                        className="w-10 h-14 object-cover rounded-lg shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-white text-xs md:text-sm font-semibold truncate">{m.name}</div>
                        <div className="text-zinc-400 text-[11px] truncate">{m.origin_name} ({m.year})</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Navigation Links (Desktop) */}
          <nav className="hidden xl:flex items-center gap-3 2xl:gap-6 text-[12px] 2xl:text-sm font-semibold text-zinc-300 whitespace-nowrap shrink">
            <button
              onClick={(e) => {
                if (!handleNavigationAttempt(e)) return;
                handleGenreChange(genresMap[0]);
              }}
              className={`cursor-pointer hover:text-white transition-colors ${
                currentGenre.slug === genresMap[0].slug ? 'text-white' : ''
              }`}
            >
              Trang Chủ
            </button>
            {genresMap.slice(1, 6).map((g) => (
              <button
                key={g.slug}
                onClick={(e) => {
                  if (!handleNavigationAttempt(e)) return;
                  handleGenreChange(g);
                }}
                className={`cursor-pointer hover:text-white transition-colors ${
                  currentGenre.slug === g.slug ? 'text-orange-500' : ''
                }`}
              >
                {g.name}
              </button>
            ))}
            <div className="relative group py-2">
              <button
                className={`cursor-pointer transition-colors flex items-center gap-1 ${
                  currentGenre.type === 'quoc-gia' ? 'text-orange-500' : 'hover:text-white'
                }`}
              >
                Quốc gia
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div className="absolute top-full right-0 w-64 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 grid grid-cols-2 p-2 gap-1">
                {countries.map((c) => (
                  <button
                    key={c.slug}
                    onClick={(e) => {
                      if (!handleNavigationAttempt(e)) return;
                      handleGenreChange({ name: c.name, slug: c.slug, type: "quoc-gia" });
                    }}
                    className={`cursor-pointer text-left px-3 py-2 rounded-lg text-xs font-semibold hover:bg-zinc-800 transition-colors ${
                      currentGenre.slug === c.slug ? 'text-orange-500' : 'text-zinc-300 hover:text-white'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          </nav>

          {/* User Auth & Actions Section (Desktop) */}
          <div className="hidden xl:flex items-center gap-2 2xl:gap-3 shrink min-w-0">
            {/* Nút Góp Ý (Tính năng 2) */}
            <button
              onClick={() => {
                setFeedbackMovieContext(
                  selectedMovie
                    ? {
                        name: selectedMovie.name,
                        episode: currentEpisode?.name,
                        url: typeof window !== 'undefined' ? window.location.href : '',
                      }
                    : null
                );
                setIsFeedbackOpen(true);
              }}
              className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 xl:py-2 rounded-full hover:bg-white/10 text-zinc-300 hover:text-white font-semibold text-xs xl:text-sm transition-colors whitespace-nowrap bg-zinc-900/60 backdrop-blur-xl border border-white/10 shadow-xl shrink-0"
              title="Gửi góp ý hoặc báo lỗi phim"
            >
              <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <span>Góp ý</span>
            </button>

            {/* Nút Xem Chung */}
            <button
              onClick={(e) => {
                if (!handleNavigationAttempt(e)) return;
                if (!user) {
                  setShowAuthWarningModal(true);
                } else {
                  setIsJoinRoomOpen(true);
                }
              }}
              className="cursor-pointer flex items-center gap-1.5 px-3 xl:px-4 py-1.5 xl:py-2 rounded-full hover:bg-white/10 text-white font-bold text-xs xl:text-sm transition-colors whitespace-nowrap bg-zinc-900/60 backdrop-blur-xl border border-white/10 shadow-xl shrink-0"
              title="Tham gia phòng xem chung"
            >
              <svg className="w-4 h-4 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Vào phòng
            </button>

            {user ? (
              <div className="flex items-center bg-zinc-200 rounded-full py-1.5 pl-3 pr-2 xl:pr-3 shadow-lg shrink min-w-0 gap-2">
                <div className="flex items-center gap-2 cursor-pointer group shrink min-w-0" title="Tài khoản của bạn">
                  {userProfile?.avatar_url ? (
                    <img src={userProfile.avatar_url} alt="Avatar" className="w-5 h-5 rounded-full object-cover shrink-0" />
                  ) : (
                    <svg className="w-4 h-4 xl:w-5 xl:h-5 text-zinc-900 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span
                    className="text-zinc-900 font-bold text-[13px] xl:text-sm truncate block min-w-0 max-w-[120px]"
                    title={userProfile?.username || user?.email?.split('@')[0]}
                  >
                    {userProfile?.username || user?.email?.split('@')[0]}
                  </span>
                </div>

                <div className="w-px h-4 bg-zinc-400 mx-1 shrink-0"></div>

                <button
                  onClick={async () => await supabase.auth.signOut()}
                  className="cursor-pointer p-1 rounded-full text-zinc-500 hover:text-zinc-900 hover:bg-zinc-300 transition-colors shrink-0"
                  title="Đăng xuất"
                >
                  <svg className="w-3.5 h-3.5 xl:w-4 xl:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="cursor-pointer px-4 xl:px-5 py-2 bg-zinc-200 hover:bg-white text-zinc-900 font-bold text-xs xl:text-sm rounded-full transition-all flex items-center gap-2 shadow-lg hover:scale-105 whitespace-nowrap shrink-0"
              >
                <svg className="w-4 h-4 xl:w-5 xl:h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                Đăng nhập
              </button>
            )}
          </div>
        </div>

        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-[90] xl:hidden bg-black/60 backdrop-blur-sm"
              onClick={() => setIsMobileMenuOpen(false)}
            ></div>

            <div className="absolute top-[75px] left-4 right-4 z-[100] xl:hidden bg-[#2b304c] text-white rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
              {user ? (
                <div className="w-full bg-zinc-200 text-zinc-900 font-bold py-3 px-4 rounded-full flex items-center justify-between mb-6 shadow-lg min-w-0">
                  <div className="flex items-center gap-3 shrink min-w-0">
                    {userProfile?.avatar_url ? (
                      <img src={userProfile.avatar_url} alt="Avatar" className="w-6 h-6 rounded-full object-cover shrink-0" />
                    ) : (
                      <svg className="w-5 h-5 text-zinc-900 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                      </svg>
                    )}
                    <span
                      className="text-zinc-900 font-bold text-[15px] truncate block min-w-0"
                      title={userProfile?.username || user?.email?.split('@')[0]}
                    >
                      {userProfile?.username || user?.email?.split('@')[0]}
                    </span>
                  </div>
                  <button
                    onClick={async () => await supabase.auth.signOut()}
                    className="cursor-pointer text-zinc-500 hover:text-zinc-900 bg-zinc-300/50 p-1.5 rounded-full transition-colors shrink-0"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setIsAuthModalOpen(true);
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full bg-zinc-200 text-zinc-900 font-bold py-3 rounded-full flex items-center justify-center gap-2 mb-6 cursor-pointer shadow-lg hover:bg-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                  </svg>
                  Đăng nhập
                </button>
              )}

              <div className="grid grid-cols-2 gap-y-6 gap-x-4 text-sm font-bold text-white mb-6">
                <button
                  onClick={() => {
                    handleGenreChange(genresMap[0]);
                    setIsMobileMenuOpen(false);
                  }}
                  className="text-left hover:text-orange-400 cursor-pointer transition-colors"
                >
                  Chủ Đề
                </button>

                {/* Thể loại */}
                <div className="flex flex-col col-span-1">
                  <button
                    onClick={() => setMobileExpandedSection((prev) => (prev === 'the-loai' ? null : 'the-loai'))}
                    className="text-left hover:text-orange-400 cursor-pointer transition-colors flex items-center justify-between"
                  >
                    Thể loại
                    <svg className={`w-4 h-4 transition-transform duration-200 ${mobileExpandedSection === 'the-loai' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {mobileExpandedSection === 'the-loai' && (
                    <div className="mt-4 flex flex-col gap-4 pl-2 border-l border-white/10 max-h-48 overflow-y-auto custom-scrollbar">
                      {genresMap.slice(1).map((g) => (
                        <button
                          key={g.slug}
                          onClick={() => {
                            handleGenreChange(g);
                            setIsMobileMenuOpen(false);
                          }}
                          className={`cursor-pointer text-left text-xs font-semibold hover:text-white ${
                            currentGenre.slug === g.slug ? 'text-orange-400' : 'text-zinc-300'
                          }`}
                        >
                          {g.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    handleGenreChange({ name: "Phim Lẻ", slug: "phim-le", type: "danh-sach" });
                    setIsMobileMenuOpen(false);
                  }}
                  className="text-left hover:text-orange-400 cursor-pointer transition-colors"
                >
                  Phim Lẻ
                </button>

                <button
                  onClick={() => {
                    handleGenreChange({ name: "Phim Bộ", slug: "phim-bo", type: "danh-sach" });
                    setIsMobileMenuOpen(false);
                  }}
                  className="text-left hover:text-orange-400 cursor-pointer transition-colors"
                >
                  Phim Bộ
                </button>

                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    if (!user) {
                      setShowAuthWarningModal(true);
                    } else {
                      setIsJoinRoomOpen(true);
                    }
                  }}
                  className="text-left hover:text-orange-400 cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  <span className="bg-yellow-500 text-black text-[9px] px-1.5 py-0.5 rounded font-black">NEW</span>
                  Xem Chung
                </button>

                {/* Nút Góp ý trên mobile */}
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setFeedbackMovieContext(
                      selectedMovie
                        ? {
                            name: selectedMovie.name,
                            episode: currentEpisode?.name,
                            url: typeof window !== 'undefined' ? window.location.href : '',
                          }
                        : null
                    );
                    setIsFeedbackOpen(true);
                  }}
                  className="text-left text-orange-400 hover:text-orange-300 cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  💬 Góp Ý & Báo Lỗi
                </button>

                {/* Quốc gia */}
                <div className="flex flex-col col-span-1">
                  <button
                    onClick={() => setMobileExpandedSection((prev) => (prev === 'quoc-gia' ? null : 'quoc-gia'))}
                    className="text-left hover:text-orange-400 cursor-pointer transition-colors flex items-center justify-between"
                  >
                    Quốc gia
                    <svg className={`w-4 h-4 transition-transform duration-200 ${mobileExpandedSection === 'quoc-gia' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {mobileExpandedSection === 'quoc-gia' && (
                    <div className="mt-4 flex flex-col gap-4 pl-2 border-l border-white/10 max-h-48 overflow-y-auto custom-scrollbar">
                      {countries.map((c) => (
                        <button
                          key={c.slug}
                          onClick={() => {
                            handleGenreChange({ name: c.name, slug: c.slug, type: "quoc-gia" });
                            setIsMobileMenuOpen(false);
                          }}
                          className={`cursor-pointer text-left text-xs font-semibold hover:text-white ${
                            currentGenre.slug === c.slug ? 'text-orange-400' : 'text-zinc-300'
                          }`}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </header>

      {currentRoom ? (
        <WatchRoomView room={currentRoom} user={user!} onLeave={() => setCurrentRoom(null)} />
      ) : selectedMovie ? (
        /* ---------------------------------
           DETAIL VIEW (TRANG XEM CHI TIẾT & PLAYER)
           --------------------------------- */
        <div className="pt-[140px] lg:pt-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 relative z-10 animate-in fade-in duration-500">
          <button
            onClick={handleCloseMovie}
            className="cursor-pointer flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 border border-white/5 text-zinc-300 hover:text-white hover:bg-zinc-800 mb-6 transition-all w-fit"
          >
            <span>&larr;</span> Quay lại
          </button>

          {/* Custom Video Player Area */}
          <div className="w-full aspect-video bg-zinc-950 rounded-2xl relative mb-12 shadow-2xl border border-white/5 group flex items-center justify-center">
            {playing && currentEpisode ? (
              <div className="w-full h-full bg-black rounded-2xl">
                {currentEpisode.link_m3u8 ? (
                  <HlsPlayer
                    src={currentEpisode.link_m3u8}
                    movie={selectedMovie}
                    episode={currentEpisode}
                    user={user}
                    onNextEpisode={handleNextEpisode}
                    onProgressSaved={refreshContinueWatching}
                  />
                ) : (
                  <iframe
                    src={currentEpisode.link_embed}
                    className="w-full h-full border-0 rounded-2xl"
                    allowFullScreen
                    title={currentEpisode.name}
                  />
                )}
              </div>
            ) : (
              <>
                <img
                  src={getImage(selectedMovie.poster_url || selectedMovie.thumb_url)}
                  className="absolute inset-0 w-full h-full object-cover opacity-50 blur-sm scale-105"
                  alt="Cover"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <button
                    onClick={playFirstEpisode}
                    className="cursor-pointer w-20 h-20 bg-orange-500 rounded-full flex items-center justify-center text-white hover:scale-110 transition-transform shadow-[0_0_30px_rgba(245,158,11,0.4)]"
                  >
                    <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                </div>
                <div className="absolute top-4 right-4 bg-zinc-950/80 backdrop-blur text-orange-500 text-xs px-3 py-1.5 rounded-full border border-orange-500/50 font-bold">
                  Trình phát tự động lưu tiến độ
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Left Column (2/3) */}
            <div className="lg:col-span-2">
              <h1 className="text-4xl md:text-5xl font-black text-white mb-6 leading-tight">{selectedMovie.name}</h1>

              {detailLoading ? (
                <div className="py-12 animate-pulse space-y-6">
                  <div className="flex gap-2">
                    <div className="w-20 h-8 bg-zinc-800 rounded-full"></div>
                    <div className="w-20 h-8 bg-zinc-800 rounded-full"></div>
                  </div>
                  <div className="w-full h-24 bg-zinc-800 rounded-xl"></div>
                </div>
              ) : (
                <>
                  {/* Badges */}
                  <div className="flex flex-wrap gap-3 mb-8">
                    <span className="px-4 py-1.5 bg-orange-500 text-white rounded-full font-bold text-sm shadow-md">
                      ★ {getScore(selectedMovie.slug)}
                    </span>
                    {movieDetail?.year && (
                      <span className="px-4 py-1.5 bg-zinc-900 border border-white/10 text-zinc-300 rounded-full font-medium text-sm">
                        {movieDetail.year}
                      </span>
                    )}
                    {movieDetail?.time && movieDetail.time !== "Đang cập nhật" && (
                      <span className="px-4 py-1.5 bg-zinc-900 border border-white/10 text-zinc-300 rounded-full font-medium text-sm">
                        {movieDetail.time}
                      </span>
                    )}
                    {movieDetail?.category?.slice(0, 3).map((c) => (
                      <span key={c.name} className="px-4 py-1.5 bg-zinc-900 border border-white/10 text-zinc-300 rounded-full font-medium text-sm">
                        {c.name}
                      </span>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-4 mb-10">
                    {/* Nút Tiếp Tục Xem Dở nếu có tiến độ */}
                    {movieProgress && movieProgress.progress_seconds > 10 && !movieProgress.completed ? (
                      <button
                        onClick={() => {
                          if (episodesDetail && episodesDetail[0]?.server_data) {
                            const ep =
                              episodesDetail[0].server_data.find((e) => e.name === movieProgress.episode_name) ||
                              episodesDetail[0].server_data[0];
                            playEpisode(ep);
                          }
                        }}
                        className="cursor-pointer px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-orange-500/25 flex items-center gap-2 hover:scale-105"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        <span>
                          Tiếp tục xem: Tập {movieProgress.episode_name} ({formatWatchTime(movieProgress.progress_seconds)})
                        </span>
                      </button>
                    ) : null}

                    <button
                      onClick={playFirstEpisode}
                      className={`cursor-pointer px-8 py-3 rounded-xl font-semibold transition-colors shadow-lg flex items-center gap-2 ${
                        movieProgress && movieProgress.progress_seconds > 10 && !movieProgress.completed
                          ? 'bg-zinc-900 border border-white/10 text-zinc-100 hover:bg-zinc-800'
                          : 'bg-orange-500 text-white hover:bg-orange-600 shadow-orange-500/20'
                      }`}
                    >
                      {playing ? 'Đang phát' : 'Xem từ đầu'}
                    </button>

                    {/* Nút Báo Lỗi / Góp Ý gắn liền với phim này */}
                    <button
                      onClick={() => {
                        setFeedbackMovieContext({
                          name: selectedMovie.name,
                          episode: currentEpisode ? currentEpisode.name : undefined,
                          url: typeof window !== 'undefined' ? window.location.href : '',
                        });
                        setIsFeedbackOpen(true);
                      }}
                      className="cursor-pointer px-5 py-3 bg-zinc-900 border border-white/10 hover:border-white/20 text-zinc-300 hover:text-white font-medium rounded-xl transition-colors flex items-center gap-2"
                      title="Báo lỗi video hoặc góp ý phim này"
                    >
                      <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>Báo lỗi / Góp ý</span>
                    </button>

                    <button className="cursor-pointer px-8 py-3 bg-zinc-900 border border-white/10 text-zinc-100 font-semibold rounded-xl hover:bg-zinc-800 transition-colors flex items-center gap-2">
                      ♡ Yêu thích
                    </button>

                    {user && (
                      <button
                        onClick={async () => {
                          setIsCreatingRoom(true);
                          try {
                            const room = await createWatchRoom(user.id, selectedMovie);
                            setCurrentRoom(room);
                          } catch (e: unknown) {
                            alert(e instanceof Error ? e.message : 'Lỗi tạo phòng!');
                          }
                          setIsCreatingRoom(false);
                        }}
                        disabled={isCreatingRoom}
                        className="cursor-pointer px-8 py-3 bg-gradient-to-r from-orange-500 to-pink-500 text-white font-semibold rounded-xl hover:scale-105 transition-all shadow-lg shadow-pink-500/20 flex items-center gap-2 disabled:opacity-50"
                      >
                        {isCreatingRoom ? 'Đang tạo phòng...' : 'Xem cùng nhau'}
                      </button>
                    )}
                  </div>

                  {/* Episodes Selector */}
                  {episodesDetail && episodesDetail[0]?.server_data?.length > 0 && (() => {
                    const allEpisodes = episodesDetail[0].server_data;
                    const CHUNK_SIZE = 500;
                    const numChunks = Math.ceil(allEpisodes.length / CHUNK_SIZE);
                    const currentEpisodes = allEpisodes.slice(episodeChunk * CHUNK_SIZE, (episodeChunk + 1) * CHUNK_SIZE);

                    return (
                      <div className="mb-10">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
                          <h3 className="text-xl font-bold text-white shrink-0">Chọn tập</h3>
                          {numChunks > 1 && (
                            <div className="flex gap-2 bg-zinc-900 rounded-lg p-1 overflow-x-auto custom-scrollbar w-full sm:w-auto">
                              {Array.from({ length: numChunks }).map((_, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => setEpisodeChunk(idx)}
                                  className={`cursor-pointer px-4 py-1.5 rounded-md text-sm font-semibold transition-colors whitespace-nowrap ${
                                    episodeChunk === idx
                                      ? 'bg-orange-500 text-white shadow-md'
                                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                                  }`}
                                >
                                  {idx * CHUNK_SIZE + 1} - {Math.min((idx + 1) * CHUNK_SIZE, allEpisodes.length)}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                          {currentEpisodes.map((ep) => {
                            const isWatchingThis =
                              movieProgress?.episode_name === ep.name &&
                              movieProgress.progress_seconds > 10 &&
                              !movieProgress.completed;
                            const isCompletedThis =
                              movieProgress?.episode_name === ep.name && movieProgress.completed;

                            return (
                              <button
                                key={ep.name}
                                onClick={() => playEpisode(ep)}
                                className={`cursor-pointer px-5 py-2.5 rounded-xl font-semibold border transition-all flex items-center gap-2 ${
                                  currentEpisode?.name === ep.name
                                    ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                                    : isWatchingThis
                                    ? 'bg-orange-500/15 text-orange-300 border-orange-500/40 hover:bg-orange-500/25'
                                    : 'bg-zinc-900 text-zinc-300 border-white/10 hover:bg-zinc-800'
                                }`}
                              >
                                <span>
                                  {ep.name.toLowerCase().startsWith('tập') || ep.name.toLowerCase().startsWith('tap')
                                    ? ep.name
                                    : `Tập ${ep.name}`}
                                </span>
                                {isWatchingThis && (
                                  <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" title="Đang xem dở" />
                                )}
                                {isCompletedThis && (
                                  <span className="text-emerald-400 text-xs" title="Đã xem xong">✓</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Nội dung */}
                  <div className="mb-10">
                    <h3 className="text-xl font-bold text-white mb-4">Nội dung</h3>
                    <p
                      className="text-zinc-400 leading-relaxed text-lg bg-zinc-900/50 p-6 rounded-2xl border border-white/5"
                      dangerouslySetInnerHTML={{ __html: movieDetail?.content || 'Đang cập nhật' }}
                    ></p>
                  </div>

                  {/* Diễn viên */}
                  <div className="mb-10">
                    <h3 className="text-xl font-bold text-white mb-4">Diễn viên</h3>
                    <div className="flex flex-wrap gap-6">
                      {movieDetail?.actor && movieDetail.actor.length > 0 && movieDetail.actor[0] !== "" ? (
                        movieDetail.actor.map((cast, i) => {
                          const name = cast.trim();
                          if (!name) return null;
                          const initials = name.substring(0, 2).toUpperCase();
                          const colors = [
                            'bg-indigo-500',
                            'bg-purple-500',
                            'bg-pink-500',
                            'bg-rose-500',
                            'bg-orange-500',
                            'bg-green-500',
                          ];
                          const colorClass = colors[name.charCodeAt(0) % colors.length];

                          return (
                            <div key={i} className="flex items-center gap-3">
                              <div
                                className={`w-12 h-12 rounded-full ${colorClass} text-white flex items-center justify-center font-bold text-lg shadow-md`}
                              >
                                {initials}
                              </div>
                              <span className="text-zinc-300 font-medium w-24 leading-tight">{name}</span>
                            </div>
                          );
                        })
                      ) : (
                        <span className="text-zinc-500">Đang cập nhật</span>
                      )}
                    </div>
                  </div>

                  {/* Thông tin */}
                  <div className="mb-10">
                    <h3 className="text-xl font-bold text-white mb-4">Thông tin</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8 text-zinc-300">
                      <div className="grid grid-cols-[100px_1fr] gap-4">
                        <span className="text-zinc-500">Đạo diễn</span>
                        <span className="font-medium text-white">{movieDetail?.director?.join(', ') || "Đang cập nhật"}</span>
                      </div>
                      <div className="grid grid-cols-[100px_1fr] gap-4">
                        <span className="text-zinc-500">Năm p.hành</span>
                        <span className="font-medium text-white">{movieDetail?.year || selectedMovie.year}</span>
                      </div>
                      <div className="grid grid-cols-[100px_1fr] gap-4">
                        <span className="text-zinc-500">Thời lượng</span>
                        <span className="font-medium text-white">{movieDetail?.time || selectedMovie.time || 'Đang cập nhật'}</span>
                      </div>
                      <div className="grid grid-cols-[100px_1fr] gap-4">
                        <span className="text-zinc-500">Thể loại</span>
                        <span className="font-medium text-white">{movieDetail?.category?.map((c) => c.name).join(', ') || "Đang cập nhật"}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Right Column (1/3) */}
            <div>
              <h3 className="text-xl font-bold text-white mb-6">Phim tương tự</h3>
              <div className="flex flex-col gap-5">
                {movies
                  .filter((m) => m.slug !== selectedMovie.slug)
                  .slice(0, 5)
                  .map((movie) => (
                    <div
                      key={movie.slug}
                      onClick={() => handleSelectMovie(movie)}
                      className="cursor-pointer flex gap-4 p-3 rounded-2xl bg-zinc-900 border border-white/5 hover:border-orange-500/30 transition-all group"
                    >
                      <img
                        src={getImage(movie.thumb_url || movie.poster_url)}
                        alt={movie.name}
                        className="w-16 h-24 object-cover rounded-xl shrink-0 group-hover:scale-105 transition-transform"
                      />
                      <div className="min-w-0 flex flex-col justify-center">
                        <h4 className="text-white font-bold text-sm line-clamp-1 group-hover:text-orange-400 transition-colors">
                          {movie.name}
                        </h4>
                        <div className="text-zinc-500 text-xs mt-1">{movie.year}</div>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-orange-400 font-bold text-xs">★ {getScore(movie.slug)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ---------------------------------
           HOMEPAGE VIEW
           --------------------------------- */
        <main className="min-h-screen">
          {loading ? (
            <div className="animate-pulse w-full pt-20 px-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="flex flex-col gap-3">
                    <div className="aspect-poster w-full bg-zinc-900 rounded-2xl"></div>
                    <div className="h-5 bg-zinc-900 rounded-lg w-full"></div>
                    <div className="h-4 bg-zinc-900 rounded-lg w-2/3"></div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Full Bleed Hero Section */}
              {featuredMovie && (
                <section className="relative w-full h-[75vh] md:h-[85vh] lg:h-screen overflow-hidden group bg-zinc-950">
                  <img
                    src={getImage(featuredMovie.thumb_url || featuredMovie.poster_url)}
                    alt={featuredMovie.name}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-[15s] group-hover:scale-105 opacity-90"
                  />

                  <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent w-full md:w-2/3 z-0"></div>
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent h-1/2 top-auto bottom-0 z-0"></div>

                  <div className="absolute inset-0 flex flex-col justify-end md:justify-center px-6 md:px-16 w-full md:w-3/4 lg:w-1/2 z-10 pt-[140px] md:pt-20 pb-[120px] md:pb-0">
                    <h1 className="text-4xl md:text-5xl lg:text-7xl font-extrabold tracking-tight mb-8 text-white drop-shadow-2xl leading-tight max-w-4xl">
                      {featuredMovie.name}
                    </h1>

                    <div className="flex flex-wrap items-center gap-2.5 mb-10 text-xs md:text-sm font-bold uppercase tracking-wider">
                      <span className="px-3 py-1.5 rounded-md bg-orange-500 text-white shadow-lg shadow-orange-500/30">
                        ★ {getScore(featuredMovie.slug)}
                      </span>
                      {featuredMovie.quality && (
                        <span className="px-3 py-1.5 rounded-md bg-white/15 backdrop-blur-md text-white drop-shadow-sm">
                          {featuredMovie.quality}
                        </span>
                      )}
                      {featuredMovie.lang && (
                        <span className="px-3 py-1.5 rounded-md bg-white/15 backdrop-blur-md text-white drop-shadow-sm">
                          {featuredMovie.lang}
                        </span>
                      )}
                      {featuredMovie.year && (
                        <span className="px-3 py-1.5 rounded-md bg-white/15 backdrop-blur-md text-zinc-100 drop-shadow-sm">
                          Năm {featuredMovie.year}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 md:gap-5">
                      <button
                        onClick={() => handleSelectMovie(featuredMovie)}
                        className="cursor-pointer w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-tr from-yellow-500 to-yellow-300 hover:scale-105 text-zinc-950 flex items-center justify-center transition-all shadow-[0_8px_30px_rgba(234,179,8,0.4)]"
                      >
                        <svg className="w-7 h-7 md:w-9 md:h-9 ml-1.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M7 4v16l14-8z" />
                        </svg>
                      </button>

                      <button className="cursor-pointer w-12 h-12 md:w-14 md:h-14 rounded-full bg-zinc-800/60 backdrop-blur-xl hover:bg-zinc-700/80 text-white flex items-center justify-center transition-colors shadow-lg">
                        <svg className="w-5 h-5 md:w-6 md:h-6" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                        </svg>
                      </button>

                      <button
                        onClick={() => handleSelectMovie(featuredMovie)}
                        className="cursor-pointer w-12 h-12 md:w-14 md:h-14 rounded-full bg-zinc-800/60 backdrop-blur-xl hover:bg-zinc-700/80 text-white flex items-center justify-center transition-colors shadow-lg"
                      >
                        <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className="absolute bottom-6 left-6 right-6 md:left-auto md:right-12 z-20 flex gap-3 overflow-x-auto custom-scrollbar pb-2">
                    {sortedMovies.slice(0, 5).map((m) => (
                      <div
                        key={m.slug}
                        onClick={() => setFeaturedMovie(m)}
                        className={`w-28 h-16 md:w-40 md:h-24 flex-shrink-0 rounded-lg overflow-hidden cursor-pointer transition-all duration-300 border-2 ${
                          featuredMovie.slug === m.slug
                            ? 'border-white scale-110 shadow-xl z-10'
                            : 'border-transparent opacity-50 hover:opacity-100 hover:scale-105'
                        }`}
                      >
                        <img src={getImage(m.thumb_url || m.poster_url)} className="w-full h-full object-cover" alt={m.name} />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* MỤC "TIẾP TỤC XEM" (CONTINUE WATCHING) CHO NGƯỜI DÙNG */}
              {continueWatching.length > 0 && (
                <div className="max-w-[95%] mx-auto px-4 pt-10 pb-4 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2 border-l-4 border-orange-500 pl-3">
                      <span>Tiếp tục xem</span>
                      <span className="text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-full font-bold">
                        {continueWatching.length}
                      </span>
                    </h2>
                  </div>
                  <div className="flex overflow-x-auto gap-4 snap-x custom-scrollbar pb-4" style={{ WebkitOverflowScrolling: 'touch' }}>
                    {continueWatching.map((item) => {
                      const percent =
                        item.duration_seconds > 0
                          ? Math.min(100, Math.round((item.progress_seconds / item.duration_seconds) * 100))
                          : 0;
                      return (
                        <div
                          key={`${item.movie_slug}-${item.episode_name}`}
                          className="w-[180px] sm:w-[220px] md:w-[240px] shrink-0 snap-start bg-zinc-900 border border-white/5 rounded-2xl overflow-hidden group hover:border-orange-500/50 transition-all shadow-lg flex flex-col relative"
                        >
                          <div
                            className="relative aspect-video w-full bg-zinc-950 overflow-hidden cursor-pointer"
                            onClick={() => handleResumeFromContinueWatching(item)}
                          >
                            <img
                              src={getImage(item.movie_poster || '')}
                              alt={item.movie_name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="w-12 h-12 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                                <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </div>
                            </div>

                            <span className="absolute top-2 left-2 bg-black/70 backdrop-blur-md border border-white/10 text-white text-[11px] font-bold px-2 py-0.5 rounded-md">
                              {item.episode_name.toLowerCase().startsWith('tập') ? item.episode_name : `Tập ${item.episode_name}`}
                            </span>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteProgress(item.movie_slug, item.episode_name);
                              }}
                              className="cursor-pointer absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 hover:bg-red-600 text-zinc-300 hover:text-white flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                              title="Xóa khỏi danh sách xem dở"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>

                            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-zinc-800">
                              <div
                                className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-r-full"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>

                          <div className="p-3 flex-1 flex flex-col justify-between">
                            <div>
                              <h3
                                onClick={() => handleResumeFromContinueWatching(item)}
                                className="text-white font-bold text-sm line-clamp-1 group-hover:text-orange-400 transition-colors cursor-pointer"
                                title={item.movie_name}
                              >
                                {item.movie_name}
                              </h3>
                              <div className="flex items-center justify-between text-[11px] text-zinc-400 mt-1">
                                <span>Đã xem {percent}%</span>
                                <span>{formatWatchTime(item.progress_seconds)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Lưới phim theo thể loại */}
              {currentGenre.slug === genresMap[0].slug ? (
                <div className="max-w-[95%] mx-auto px-4 pt-6 pb-2">
                  <MovieRow title="Phim Hành Động mới" url="https://phimapi.com/v1/api/the-loai/hanh-dong?limit=10" onSelectMovie={handleSelectMovie} />
                  <MovieRow title="Phim Hàn Quốc mới" url="https://phimapi.com/v1/api/quoc-gia/han-quoc?limit=10" onSelectMovie={handleSelectMovie} />
                  <MovieRow title="Phim Âu-Mỹ mới" url="https://phimapi.com/v1/api/quoc-gia/au-my?limit=10" onSelectMovie={handleSelectMovie} />
                  <MovieRow title="Phim Điện Ảnh Mới Cóóng" url="https://phimapi.com/v1/api/danh-sach/phim-le?limit=10" onSelectMovie={handleSelectMovie} />
                  <MovieRow title="Anime Mới Nhất" url="https://phimapi.com/v1/api/danh-sach/hoat-hinh?limit=10" onSelectMovie={handleSelectMovie} />
                </div>
              ) : (
                <div className="max-w-[95%] mx-auto px-4 pt-28 pb-12">
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl md:text-3xl font-bold text-white border-l-4 border-orange-500 pl-3">
                      {currentGenre.name}
                    </h2>
                    <div className="flex items-center gap-2">
                      <select
                        value={currentSort}
                        onChange={(e) => setCurrentSort(e.target.value)}
                        className="bg-zinc-900 border border-white/10 text-zinc-300 text-xs sm:text-sm rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-orange-500"
                      >
                        <option value="rating">Điểm cao nhất</option>
                        <option value="newest">Phim mới nhất</option>
                        <option value="az">Theo tên A-Z</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                    {sortedMovies.map((m) => (
                      <MovieCard key={m.slug} movie={m} onSelectMovie={handleSelectMovie} />
                    ))}
                  </div>

                  {/* Phân trang */}
                  {totalPages > 1 && (
                    <div className="mt-12 flex justify-center">
                      <div className="flex items-center gap-1.5 sm:gap-2 bg-zinc-900/80 backdrop-blur-md p-1.5 sm:p-2 rounded-2xl border border-white/5 shadow-xl max-w-full overflow-x-auto custom-scrollbar">
                        <button
                          onClick={() => {
                            setCurrentPage((prev) => Math.max(1, prev - 1));
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          disabled={currentPage === 1}
                          className="cursor-pointer shrink-0 px-2 sm:px-4 py-2 min-w-[36px] min-h-[36px] sm:min-h-[40px] rounded-xl bg-zinc-800 text-zinc-300 font-semibold hover:bg-zinc-700 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1 sm:gap-2"
                        >
                          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                          <span className="hidden sm:inline">Trang trước</span>
                        </button>

                        <div className="flex items-center gap-1 sm:gap-1.5">
                          {(() => {
                            const pages = [];
                            let start = Math.max(1, currentPage - 1);
                            let end = Math.min(totalPages, currentPage + 1);

                            if (start === 1 && end < totalPages) end = Math.min(totalPages, 3);
                            if (end === totalPages && start > 1) start = Math.max(1, totalPages - 2);

                            if (start > 1) {
                              pages.push(
                                <button
                                  key={1}
                                  onClick={() => {
                                    setCurrentPage(1);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                  className="shrink-0 cursor-pointer w-8 h-8 sm:w-10 sm:h-10 text-xs sm:text-base rounded-xl font-bold flex items-center justify-center transition-all bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                                >
                                  1
                                </button>
                              );
                              if (start > 2) pages.push(<span key="dots1" className="shrink-0 text-zinc-500 font-bold px-0.5 sm:px-1">...</span>);
                            }

                            for (let i = start; i <= end; i++) {
                              pages.push(
                                <button
                                  key={i}
                                  onClick={() => {
                                    setCurrentPage(i);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                  className={`shrink-0 cursor-pointer w-8 h-8 sm:w-10 sm:h-10 text-xs sm:text-base rounded-xl font-bold flex items-center justify-center transition-all ${
                                    currentPage === i
                                      ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                                      : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                                  }`}
                                >
                                  {i}
                                </button>
                              );
                            }

                            if (end < totalPages) {
                              if (end < totalPages - 1) pages.push(<span key="dots2" className="shrink-0 text-zinc-500 font-bold px-0.5 sm:px-1">...</span>);
                              pages.push(
                                <button
                                  key={totalPages}
                                  onClick={() => {
                                    setCurrentPage(totalPages);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                  className="shrink-0 cursor-pointer w-8 h-8 sm:w-10 sm:h-10 text-xs sm:text-base rounded-xl font-bold flex items-center justify-center transition-all bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                                >
                                  {totalPages}
                                </button>
                              );
                            }
                            return pages;
                          })()}
                        </div>

                        <button
                          onClick={() => {
                            setCurrentPage((prev) => Math.min(totalPages, prev + 1));
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          disabled={currentPage === totalPages}
                          className="cursor-pointer shrink-0 px-2 sm:px-4 py-2 min-w-[36px] min-h-[36px] sm:min-h-[40px] rounded-xl bg-zinc-800 text-zinc-300 font-semibold hover:bg-zinc-700 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1 sm:gap-2"
                        >
                          <span className="hidden sm:inline">Trang sau</span>
                          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      )}

      {/* Footer */}
      <footer className="pt-8 pb-10 px-4 flex flex-col items-center justify-center text-center bg-zinc-950 border-t border-white/5">
        <p className="text-zinc-400 text-xs md:text-sm max-w-4xl mb-4 leading-relaxed">
          Trang web này là một dự án cá nhân phi thương mại, được xây dựng hoàn toàn với mục đích học tập và nghiên cứu. Tất cả nội dung video đều được thu thập tự động từ các nguồn chia sẻ cộng đồng trên Internet. Nếu có bất kỳ vấn đề nào liên quan đến bản quyền, vui lòng thông báo cho chúng tôi để được gỡ bỏ kịp thời. Xin chân thành cảm ơn!
        </p>

        {/* Nút gửi góp ý ở Footer */}
        <div className="mb-4 flex items-center justify-center gap-4 text-xs">
          <button
            onClick={() => {
              setFeedbackMovieContext(null);
              setIsFeedbackOpen(true);
            }}
            className="cursor-pointer text-orange-400 hover:text-orange-300 font-semibold flex items-center gap-1.5 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <span>Gửi góp ý / Báo lỗi cho quản trị viên</span>
          </button>
        </div>

        <div className="text-white font-bold text-sm md:text-base">
          © 2025 Tran Doan Khoa.
        </div>
      </footer>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .custom-scrollbar::-webkit-scrollbar {
          height: 6px;
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(245, 158, 11, 0.5);
        }
      `,
        }}
      />

      {/* Modal cảnh báo đang xem chung */}
      {showRoomWarningModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200 px-4">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-orange-500/20 text-orange-500 rounded-full flex items-center justify-center mb-6">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Đang Xem Chung</h3>
            <p className="text-zinc-400 text-sm mb-8">Bạn đang ở chế độ xem chung. Vui lòng rời khỏi hoặc giải tán phòng hiện tại để tiếp tục tìm kiếm và chọn phim khác.</p>
            <button
              onClick={() => setShowRoomWarningModal(false)}
              className="cursor-pointer w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl transition-all border border-white/5"
            >
              Đã Hiểu
            </button>
          </div>
        </div>
      )}

      {/* Modal yêu cầu đăng nhập */}
      {showAuthWarningModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200 px-4">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-blue-500/20 text-blue-500 rounded-full flex items-center justify-center mb-6">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8V7z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Yêu Cầu Đăng Nhập</h3>
            <p className="text-zinc-400 text-sm mb-8">Vui lòng đăng nhập để sử dụng tính năng Xem Chung.</p>
            <div className="flex w-full gap-3">
              <button
                onClick={() => setShowAuthWarningModal(false)}
                className="cursor-pointer flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl transition-all border border-white/5"
              >
                Đóng
              </button>
              <button
                onClick={() => {
                  setShowAuthWarningModal(false);
                  setIsAuthModalOpen(true);
                }}
                className="cursor-pointer flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all"
              >
                Đăng Nhập
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={() => {
          setIsAuthModalOpen(false);
          refreshContinueWatching();
        }}
      />

      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        user={user}
        movieContext={feedbackMovieContext}
      />

      {user && (
        <JoinRoomModal
          isOpen={isJoinRoomOpen}
          onClose={() => setIsJoinRoomOpen(false)}
          userId={user.id}
          onJoinSuccess={(room) => setCurrentRoom(room as unknown as WatchRoom)}
        />
      )}
    </div>
  );
}
