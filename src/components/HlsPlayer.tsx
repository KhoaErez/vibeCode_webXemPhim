"use client";

import { useState, useEffect, useRef } from "react";
import Hls from "hls.js";
import { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  saveWatchProgress,
  getMovieWatchProgress,
  formatWatchTime,
} from "@/lib/watchProgress";
import type { KKPhimListMovie, KKPhimEpisodeItem } from "@/types/movie";

export default function HlsPlayer({
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
}) {
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

  // Khởi tạo nguồn HLS với cấu hình tối ưu bộ nhớ & mạng
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let nativeListener: (() => void) | null = null;

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 30 * 1024 * 1024,
        backBufferLength: 30,
        capLevelToPlayerSize: true,
        enableWorker: true,
        lowLatencyMode: false,
      });
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

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      nativeListener = () => {
        video.play().catch((e) => console.log('Play failed', e));
      };
      video.addEventListener('loadedmetadata', nativeListener);
    }

    return () => {
      if (nativeListener && video) {
        video.removeEventListener('loadedmetadata', nativeListener);
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
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

  // Throttle cập nhật tiến độ xem khi đang phát (mỗi 12 giây) - không re-fetch UI để tránh giật lag video
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

    // Ghi tiến độ định kỳ mỗi 12 giây ngầm mà không gây gián đoạn luồng phát
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
    }
  };

  // Ghi tiến độ ngay khi tạm dừng video & thông báo cập nhật
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
                  className="cursor-pointer min-h-[44px] px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-orange-500/20 flex items-center gap-1.5 touch-target"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
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
                  className="cursor-pointer min-h-[44px] px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-semibold text-xs rounded-xl transition-colors border border-white/5 touch-target"
                >
                  Xem lại từ đầu
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setResumePrompt(null)}
              className="cursor-pointer text-zinc-500 hover:text-white p-2 min-w-[40px] min-h-[40px] flex items-center justify-center touch-target"
              title="Đóng thông báo"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            className="cursor-pointer min-h-[40px] px-3.5 py-1.5 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-xl shadow-md touch-target flex items-center"
          >
            Chuyển ngay
          </button>
          <button
            type="button"
            onClick={() => setNextCountdown(null)}
            className="cursor-pointer min-h-[40px] text-zinc-400 hover:text-white text-xs px-2 touch-target flex items-center"
          >
            Hủy
          </button>
        </div>
      )}

      {/* Nút Cài đặt Chất lượng & Tốc độ */}
      <div className="absolute top-4 right-4 z-50">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`cursor-pointer w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-black/60 hover:bg-black/80 backdrop-blur text-white flex items-center justify-center transition-all touch-target md:opacity-0 md:group-hover:opacity-100 ${
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
          <div className="absolute top-12 right-0 bg-black/92 backdrop-blur-md rounded-2xl p-3 border border-white/10 w-64 max-w-[calc(100vw-32px)] animate-in fade-in zoom-in-95 shadow-2xl">
            {levels.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] font-bold text-zinc-400 mb-2 uppercase tracking-wider">Chất lượng</div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => handleQualityChange(-1)}
                    className={`cursor-pointer min-h-[38px] px-2 py-2 rounded-xl text-xs font-bold transition-colors touch-target ${
                      currentLevel === -1 ? 'bg-orange-500 text-white shadow-md' : 'bg-white/5 text-zinc-300 hover:bg-white/10'
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
                        className={`cursor-pointer min-h-[38px] px-2 py-2 rounded-xl text-xs font-bold transition-colors touch-target ${
                          currentLevel === originalIndex ? 'bg-orange-500 text-white shadow-md' : 'bg-white/5 text-zinc-300 hover:bg-white/10'
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
                    className={`cursor-pointer min-h-[38px] px-2 py-2 rounded-xl text-xs font-bold transition-colors touch-target ${
                      playbackRate === rate ? 'bg-orange-500 text-white shadow-md' : 'bg-white/5 text-zinc-300 hover:bg-white/10'
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
}
