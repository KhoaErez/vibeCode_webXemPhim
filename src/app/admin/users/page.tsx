'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAdminPresence } from '@/components/admin/AdminPresenceContext';
import { formatWatchTime } from '@/lib/watchProgress';
import { useScrollLock } from '@/hooks/useScrollLock';
import type { AdminUserProfile, UserRole } from '@/types/admin';

function formatLastSeen(dateStr?: string | null) {
  if (!dateStr) return 'Chưa ghi nhận';
  const d = new Date(dateStr);
  const now = Date.now();
  const diffMin = Math.round((now - d.getTime()) / (1000 * 60));

  if (diffMin < 2) return 'Vừa mới đây';
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays <= 30) return `${diffDays} ngày trước`;
  return d.toLocaleDateString('vi-VN');
}

function computeUserStatus(user: AdminUserProfile, isOnline: boolean): 'online' | 'recent' | 'offline' {
  if (isOnline) return 'online';
  if (!user.last_seen_at) return 'offline';

  const lastSeenTime = new Date(user.last_seen_at).getTime();
  const diffHours = (Date.now() - lastSeenTime) / (1000 * 60 * 60);

  if (diffHours <= 24) return 'recent';
  return 'offline';
}

export default function AdminUsersPage() {
  const { isUserOnline } = useAdminPresence();

  const [users, setUsers] = useState<AdminUserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');

  // Modal xem chi tiết
  const [selectedUser, setSelectedUser] = useState<AdminUserProfile | null>(null);
  useScrollLock(!!selectedUser);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '15',
        search: search.trim(),
        role: roleFilter,
        sortBy,
        order: 'desc',
      });

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (!res.ok) throw new Error(`Lỗi (${res.status})`);
      const data = await res.json();

      if (data.success) {
        setUsers(data.users || []);
        setTotalUsers(data.pagination?.total || 0);
        setTotalPages(data.pagination?.totalPages || 1);
      } else {
        throw new Error(data.error || 'Không thể tải danh sách tài khoản');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi tải người dùng');
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, sortBy]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Phân loại trạng thái thành viên
  const getUserStatus = (user: AdminUserProfile): 'online' | 'recent' | 'offline' => {
    return computeUserStatus(user, isUserOnline(user.id));
  };

  // Lọc theo status filter client-side cho các kết quả đang hiển thị
  const filteredUsers = users.filter((u) => {
    if (statusFilter === 'all') return true;
    const st = getUserStatus(u);
    return st === statusFilter;
  });

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    const confirmText =
      newRole === 'admin'
        ? 'Bạn có chắc muốn cấp quyền Quản trị viên (Admin) cho tài khoản này?'
        : 'Bạn có chắc muốn chuyển tài khoản này về Thành viên thường?';

    if (!window.confirm(confirmText)) return;

    setActionLoading(true);
    setActionMessage(null);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Cập nhật thất bại');
      }

      setActionMessage({ type: 'success', text: data.message || 'Cập nhật thành công!' });
      // Cập nhật lại trong state
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
      if (selectedUser?.id === userId) {
        setSelectedUser((prev) => (prev ? { ...prev, role: newRole } : null));
      }
    } catch (err: unknown) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Không thể thay đổi quyền',
      });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <span>👥</span> Quản Lý Thành Viên
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400">
            Xem danh sách, kiểm tra online realtime, phân quyền quản trị và lịch sử hoạt động
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-zinc-900 border border-white/5 text-xs text-zinc-300 font-mono">
            Tổng cộng: <strong className="text-white">{totalUsers}</strong> tài khoản
          </span>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-center justify-between animate-in fade-in ${
            actionMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button
            onClick={() => setActionMessage(null)}
            className="text-zinc-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-zinc-900/90 border border-white/5 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        {/* Search Input */}
        <div className="relative flex-1">
          <svg
            className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm theo tên hiển thị hoặc email..."
            className="w-full bg-zinc-950 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>

        {/* Filter dropdowns */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
          >
            <option value="all">Tất cả vai trò</option>
            <option value="admin">Quản trị viên (Admin)</option>
            <option value="user">Thành viên thường</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="online">🟢 Đang Online Realtime</option>
            <option value="recent">🟡 Hoạt động gần đây (&lt; 24h)</option>
            <option value="offline">⚪ Offline (&gt; 24h)</option>
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
          >
            <option value="created_at">Mới đăng ký nhất</option>
            <option value="last_seen_at">Hoạt động gần nhất</option>
            <option value="username">Tên A-Z</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-zinc-900/90 border border-white/5 rounded-2xl shadow-xl overflow-hidden flex flex-col">
        {loading ? (
          <div className="p-12 text-center text-zinc-400 text-sm flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <span>Đang tải danh sách thành viên...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-400 text-sm">{error}</div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 text-sm">
            Không tìm thấy thành viên nào phù hợp với bộ lọc.
          </div>
        ) : (
          <>
            {/* Desktop Table View (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-zinc-950/50 text-zinc-400 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3.5 px-4">Thành viên</th>
                    <th className="py-3.5 px-4">Trạng thái</th>
                    <th className="py-3.5 px-4">Vai trò</th>
                    <th className="py-3.5 px-4">Hoạt động cuối</th>
                    <th className="py-3.5 px-4 text-center">Tiến độ xem</th>
                    <th className="py-3.5 px-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredUsers.map((u) => {
                    const status = getUserStatus(u);
                    return (
                      <tr
                        key={u.id}
                        className="hover:bg-white/[0.02] transition-colors group cursor-pointer"
                        onClick={() => setSelectedUser(u)}
                      >
                        {/* Thành viên / Avatar */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            {u.avatar_url ? (
                              <img
                                src={u.avatar_url}
                                alt="Avatar"
                                className="w-9 h-9 rounded-full object-cover border border-white/10 shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-orange-500/20 text-orange-400 font-bold flex items-center justify-center text-sm shrink-0 border border-orange-500/20">
                                {u.username.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-bold text-white truncate max-w-[160px] sm:max-w-[200px]">
                                {u.username}
                              </div>
                              <div className="text-[11px] text-zinc-400 truncate max-w-[160px] sm:max-w-[200px]">
                                {u.email || 'Google OAuth'}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Trạng thái Online */}
                        <td className="py-3.5 px-4">
                          {status === 'online' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              <span>Online</span>
                            </span>
                          ) : status === 'recent' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-semibold">
                              <span className="w-2 h-2 rounded-full bg-amber-500" />
                              <span>Gần đây</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 text-xs">
                              <span className="w-2 h-2 rounded-full bg-zinc-600" />
                              <span>Offline</span>
                            </span>
                          )}
                        </td>

                        {/* Vai trò */}
                        <td className="py-3.5 px-4">
                          {u.role === 'admin' ? (
                            <span className="px-2.5 py-1 rounded-lg bg-orange-500/20 border border-orange-500/30 text-orange-400 text-xs font-black uppercase tracking-wider">
                              Admin
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-400 text-xs font-semibold">
                              Member
                            </span>
                          )}
                        </td>

                        {/* Lần hoạt động cuối */}
                        <td className="py-3.5 px-4 text-xs font-mono text-zinc-300">
                          {formatLastSeen(u.last_seen_at)}
                        </td>

                        {/* Tiến độ xem */}
                        <td className="py-3.5 px-4 text-center">
                          <div className="text-xs font-bold text-white">
                            {u.watch_count || 0} phim
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono">
                            {formatWatchTime(u.total_watch_seconds || 0)}
                          </div>
                        </td>

                        {/* Thao tác */}
                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setSelectedUser(u)}
                              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                              title="Xem chi tiết"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>

                            <button
                              disabled={actionLoading}
                              onClick={() =>
                                handleRoleChange(u.id, u.role === 'admin' ? 'user' : 'admin')
                              }
                              className={`p-1.5 rounded-lg transition-colors text-xs font-semibold ${
                                u.role === 'admin'
                                  ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20'
                                  : 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20'
                              }`}
                              title={u.role === 'admin' ? 'Hạ quyền thành Member' : 'Nâng lên Admin'}
                            >
                              {u.role === 'admin' ? 'Hạ quyền' : 'Nâng Admin'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List (< md) */}
            <div className="md:hidden divide-y divide-white/5">
              {filteredUsers.map((u) => {
                const status = getUserStatus(u);
                return (
                  <div
                    key={u.id}
                    onClick={() => setSelectedUser(u)}
                    className="p-4 hover:bg-white/[0.02] transition-colors flex flex-col gap-3 cursor-pointer"
                  >
                    {/* Top: Avatar, Name, Email, Status Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        {u.avatar_url ? (
                          <img
                            src={u.avatar_url}
                            alt="Avatar"
                            className="w-10 h-10 rounded-full object-cover border border-white/10 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-orange-500/20 text-orange-400 font-bold flex items-center justify-center text-sm shrink-0 border border-orange-500/20">
                            {u.username.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-white text-sm truncate">
                            {u.username}
                          </div>
                          <div className="text-xs text-zinc-400 truncate">
                            {u.email || 'Google OAuth'}
                          </div>
                        </div>
                      </div>

                      {/* Status badge */}
                      <div className="shrink-0">
                        {status === 'online' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span>Online</span>
                          </span>
                        ) : status === 'recent' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[11px] font-semibold">
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                            <span>Gần đây</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 text-[11px]">
                            <span className="w-2 h-2 rounded-full bg-zinc-600" />
                            <span>Offline</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Info pills: Role, Last Active, Watch Stats */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {u.role === 'admin' ? (
                        <span className="px-2 py-0.5 rounded-md bg-orange-500/20 border border-orange-500/30 text-orange-400 font-bold text-[11px]">
                          Admin
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 text-[11px]">
                          Thành viên
                        </span>
                      )}
                      <span className="text-zinc-600">&bull;</span>
                      <span className="text-zinc-400 font-mono text-[11px]">
                        {formatLastSeen(u.last_seen_at)}
                      </span>
                      <span className="text-zinc-600">&bull;</span>
                      <span className="text-zinc-300 font-medium text-[11px]">
                        🎬 {u.watch_count || 0} phim ({formatWatchTime(u.total_watch_seconds || 0)})
                      </span>
                    </div>

                    {/* Action Buttons: 1-touch detail & role management */}
                    <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedUser(u)}
                        className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center justify-center gap-1.5 touch-target"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        <span>Chi tiết</span>
                      </button>
                      <button
                        disabled={actionLoading}
                        onClick={() =>
                          handleRoleChange(u.id, u.role === 'admin' ? 'user' : 'admin')
                        }
                        className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 touch-target ${
                          u.role === 'admin'
                            ? 'bg-zinc-800 text-zinc-400 hover:text-white'
                            : 'bg-orange-500/20 text-orange-400 hover:bg-orange-500 hover:text-white'
                        }`}
                      >
                        <span>{u.role === 'admin' ? 'Hạ quyền' : 'Thăng Admin'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-white/5 bg-zinc-950/60 flex items-center justify-between text-xs">
            <span className="text-zinc-400">
              Trang <strong className="text-white">{page}</strong> trên{' '}
              <strong className="text-white">{totalPages}</strong>
            </span>

            <div className="flex gap-2">
              <button
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-semibold disabled:opacity-30 transition-colors"
              >
                &larr; Trang trước
              </button>
              <button
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-semibold disabled:opacity-30 transition-colors"
              >
                Trang tiếp &rarr;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* User Details Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setSelectedUser(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white"
            >
              ✕
            </button>

            <div className="flex items-center gap-4 mb-6">
              {selectedUser.avatar_url ? (
                <img
                  src={selectedUser.avatar_url}
                  alt="Avatar"
                  className="w-14 h-14 rounded-full object-cover border border-white/10 shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-orange-500/20 text-orange-400 font-black flex items-center justify-center text-xl shrink-0">
                  {selectedUser.username.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h3 className="text-lg font-bold text-white">{selectedUser.username}</h3>
                <p className="text-xs text-zinc-400">{selectedUser.email || 'Google OAuth'}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      selectedUser.role === 'admin'
                        ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {selectedUser.role === 'admin' ? 'Quản Trị Viên' : 'Thành Viên'}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">
                    ID: {selectedUser.id.substring(0, 8)}...
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-zinc-950 rounded-xl p-4 border border-white/5 flex flex-col gap-2.5 text-xs mb-6">
              <div className="flex justify-between">
                <span className="text-zinc-500">Trạng thái hiện tại:</span>
                <span className="font-semibold text-white">
                  {getUserStatus(selectedUser) === 'online'
                    ? '🟢 Đang Online'
                    : getUserStatus(selectedUser) === 'recent'
                    ? '🟡 Hoạt động gần đây'
                    : '⚪ Offline'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Lần hoạt động cuối:</span>
                <span className="font-semibold text-white">
                  {formatLastSeen(selectedUser.last_seen_at)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Ngày tham gia:</span>
                <span className="font-semibold text-white">
                  {new Date(selectedUser.created_at).toLocaleDateString('vi-VN')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Số phim đã xem:</span>
                <span className="font-semibold text-orange-400">
                  {selectedUser.watch_count || 0} phim
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Tổng thời gian xem:</span>
                <span className="font-semibold text-emerald-400 font-mono">
                  {formatWatchTime(selectedUser.total_watch_seconds || 0)}
                </span>
              </div>
            </div>

            <div className="flex gap-2.5">
              <button
                disabled={actionLoading}
                onClick={() =>
                  handleRoleChange(
                    selectedUser.id,
                    selectedUser.role === 'admin' ? 'user' : 'admin'
                  )
                }
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-colors ${
                  selectedUser.role === 'admin'
                    ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30'
                    : 'bg-orange-500 hover:bg-orange-600 text-white'
                }`}
              >
                {selectedUser.role === 'admin' ? 'Hạ quyền xuống Member' : 'Nâng lên Quản trị viên'}
              </button>
              <button
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
