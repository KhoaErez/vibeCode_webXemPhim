'use client';

import React, { useEffect, useState } from 'react';
import KpiCard from '@/components/admin/KpiCard';
import SvgTrafficChart from '@/components/admin/SvgTrafficChart';
import { useAdminPresence } from '@/components/admin/AdminPresenceContext';
import { formatWatchTime } from '@/lib/watchProgress';
import type { AdminDashboardKPIs, TrafficDataPoint, PopularMovieStat } from '@/types/admin';

export default function AdminOverviewPage() {
  const { presenceStats } = useAdminPresence();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [kpis, setKpis] = useState<AdminDashboardKPIs | null>(null);
  const [trafficDaily, setTrafficDaily] = useState<TrafficDataPoint[]>([]);
  const [popularMovies, setPopularMovies] = useState<PopularMovieStat[]>([]);
  const [deviceStats, setDeviceStats] = useState({ desktop: 0, mobile: 0, tablet: 0 });

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/stats');
      if (!res.ok) {
        throw new Error(`Lỗi máy chủ (${res.status})`);
      }
      const data = await res.json();
      if (data.success) {
        setKpis(data.kpis);
        setTrafficDaily(data.trafficDaily || []);
        setPopularMovies(data.popularMovies || []);
        if (data.deviceStats) setDeviceStats(data.deviceStats);
      } else {
        throw new Error(data.error || 'Không thể lấy dữ liệu thống kê');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const totalDeviceViews = deviceStats.desktop + deviceStats.mobile + deviceStats.tablet || 1;
  const desktopPct = Math.round((deviceStats.desktop / totalDeviceViews) * 100);
  const mobilePct = Math.round((deviceStats.mobile / totalDeviceViews) * 100);
  const tabletPct = Math.max(0, 100 - desktopPct - mobilePct);

  return (
    <div className="flex flex-col gap-8">
      {/* Top Banner / Welcome & Quick Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-900/60 border border-white/5 rounded-2xl p-5 sm:p-6 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">📊</span>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Tổng Quan Hệ Thống Rạp Nhà
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400">
            Dữ liệu hoạt động thời gian thực từ Supabase Realtime & lịch sử xem phim
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchStats}
            disabled={loading}
            className="cursor-pointer px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-white/10 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <svg
              className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{loading ? 'Đang cập nhật...' : 'Làm mới số liệu'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-3">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* 5 Core KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* KPI 1: Realtime Online */}
        <KpiCard
          className="col-span-2 sm:col-span-1"
          title="Đang Online Realtime"
          value={presenceStats.totalOnline}
          subtext={`${presenceStats.membersOnline} thành viên / ${presenceStats.guestsOnline} khách`}
          highlight={true}
          badge={{
            text: 'Live WebSocket',
            variant: 'success',
          }}
          icon={
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          }
        />

        {/* KPI 2: Total Accounts */}
        <KpiCard
          title="Tổng Tài Khoản"
          value={kpis?.totalUsers || 0}
          subtext={`+${kpis?.newUsers7Days || 0} mới trong 7 ngày qua`}
          badge={{
            text: `+${kpis?.newUsersToday || 0} hôm nay`,
            variant: 'orange',
          }}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        />

        {/* KPI 3: Lượt truy cập */}
        <KpiCard
          title="Lượt Xem Hôm Nay"
          value={kpis?.pageViewsToday || 0}
          subtext={`${kpis?.pageViews7Days || 0} lượt trong tuần này`}
          badge={{
            text: `${kpis?.memberViewsToday || 0} từ thành viên`,
            variant: 'info',
          }}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          }
        />

        {/* KPI 4: Phản hồi & Báo lỗi */}
        <KpiCard
          title="Góp Ý Chờ Xử Lý"
          value={kpis?.pendingFeedbacks || 0}
          subtext={`Đã giải quyết: ${kpis?.resolvedFeedbacks || 0}`}
          badge={{
            text: kpis?.pendingFeedbacks ? 'Cần xem ngay' : 'Đã sạch',
            variant: kpis?.pendingFeedbacks ? 'warning' : 'success',
          }}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          }
        />

        {/* KPI 5: Tổng thời gian xem */}
        <KpiCard
          title="Tổng Thời Gian Xem"
          value={formatWatchTime(kpis?.totalWatchSeconds || 0)}
          subtext="Tích lũy từ watch_progress thực tế"
          badge={{
            text: 'Dữ liệu thực',
            variant: 'purple',
          }}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Traffic Chart */}
      <SvgTrafficChart
        data={trafficDaily}
        title="Biến Thiên Lượt Truy Cập 7 Ngày Gần Nhất"
        subtitle="Dữ liệu ghi nhận thực tế từ các phiên truy cập của Thành viên và Khách vãng lai"
      />

      {/* Grid: Popular Movies & Device Distribution / Live Users */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2/3): Top Phim Phổ Biến Nhất */}
        <div className="lg:col-span-2 bg-zinc-900/90 border border-white/5 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>🔥</span> Top Phim Được Xem Nhiều Nhất
              </h3>
              <p className="text-xs text-zinc-400">
                Thống kê dựa trên lượt lưu tiến độ xem thực tế từ người dùng
              </p>
            </div>
            <span className="text-xs text-orange-400 font-semibold font-mono">
              {popularMovies.length} phim
            </span>
          </div>

          {popularMovies.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 text-sm">
              Chưa có dữ liệu lịch sử xem phim từ khán giả.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-zinc-400 font-semibold uppercase tracking-wider">
                    <th className="pb-3 pl-1">#</th>
                    <th className="pb-3">Tên phim</th>
                    <th className="pb-3 text-center">Lượt xem</th>
                    <th className="pb-3 text-right">Tổng thời lượng</th>
                    <th className="pb-3 text-right pr-1">Xem xong</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {popularMovies.map((movie, index) => (
                    <tr key={movie.movie_slug} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 pl-1 font-mono font-bold text-zinc-500">
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`}
                      </td>
                      <td className="py-3 font-semibold text-white">
                        <div className="truncate max-w-[220px] sm:max-w-[280px]" title={movie.movie_name}>
                          {movie.movie_name}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono">{movie.movie_slug}</div>
                      </td>
                      <td className="py-3 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 font-bold font-mono">
                          {movie.view_count}
                        </span>
                      </td>
                      <td className="py-3 text-right font-mono text-zinc-300">
                        {formatWatchTime(movie.total_watch_seconds)}
                      </td>
                      <td className="py-3 text-right pr-1 font-mono text-emerald-400 font-semibold">
                        {movie.completed_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column (1/3): Phân Bổ Thiết Bị & Live Online Users */}
        <div className="flex flex-col gap-6">
          {/* Thiết bị truy cập */}
          <div className="bg-zinc-900/90 border border-white/5 rounded-2xl p-5 sm:p-6 shadow-xl">
            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <span>📱</span> Thiết Bị Truy Cập
            </h3>
            <p className="text-xs text-zinc-400 mb-4">Tỷ lệ theo loại thiết bị người dùng</p>

            <div className="flex flex-col gap-3">
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-zinc-300 flex items-center gap-1.5">
                    <span>💻</span> Máy tính (Desktop)
                  </span>
                  <span className="text-white font-mono">{desktopPct}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full transition-all duration-500"
                    style={{ width: `${desktopPct}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-zinc-300 flex items-center gap-1.5">
                    <span>📱</span> Điện thoại (Mobile)
                  </span>
                  <span className="text-white font-mono">{mobilePct}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-sky-400 rounded-full transition-all duration-500"
                    style={{ width: `${mobilePct}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-zinc-300 flex items-center gap-1.5">
                    <span>📟</span> Máy tính bảng (Tablet)
                  </span>
                  <span className="text-white font-mono">{tabletPct}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                    style={{ width: `${tabletPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Danh sách người dùng online tức thời */}
          <div className="bg-zinc-900/90 border border-white/5 rounded-2xl p-5 sm:p-6 shadow-xl flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span>Phiên Đang Xem Phim</span>
              </h3>
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-bold">
                {presenceStats.totalOnline} kết nối
              </span>
            </div>

            <div className="flex-1 overflow-y-auto max-h-56 custom-scrollbar flex flex-col gap-2">
              {presenceStats.users.length === 0 ? (
                <div className="py-8 text-center text-zinc-500 text-xs">
                  Đang lắng nghe kết nối Supabase WebSocket...
                </div>
              ) : (
                presenceStats.users.slice(0, 10).map((u) => (
                  <div
                    key={u.presenceKey}
                    className="flex items-center justify-between p-2 rounded-xl bg-zinc-950/60 border border-white/5 text-xs"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      {u.avatarUrl ? (
                        <img
                          src={u.avatarUrl}
                          alt="Avatar"
                          className="w-6 h-6 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                            u.isGuest
                              ? 'bg-zinc-800 text-zinc-400'
                              : 'bg-orange-500/20 text-orange-400'
                          }`}
                        >
                          {u.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span
                        className={`truncate font-medium ${
                          u.isGuest ? 'text-zinc-400' : 'text-white font-semibold'
                        }`}
                      >
                        {u.username}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-zinc-500 uppercase">{u.device}</span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          u.isGuest
                            ? 'bg-zinc-800 text-zinc-400'
                            : 'bg-emerald-500/15 text-emerald-400'
                        }`}
                      >
                        {u.isGuest ? 'Khách' : 'Thành viên'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
