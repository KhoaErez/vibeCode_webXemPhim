'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useScrollLock } from '@/hooks/useScrollLock';
import type { FeedbackItem, FeedbackStatus } from '@/types/admin';

export default function AdminFeedbacksPage() {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusCounts, setStatusCounts] = useState({
    all: 0,
    pending: 0,
    in_progress: 0,
    resolved: 0,
    closed: 0,
  });

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Selected feedback for detail/reply modal
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null);
  useScrollLock(!!selectedFeedback);
  const [editStatus, setEditStatus] = useState<FeedbackStatus>('pending');
  const [adminNotes, setAdminNotes] = useState('');
  const [adminReply, setAdminReply] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchFeedbacks = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '15',
        status: statusFilter,
        category: categoryFilter,
        rating: ratingFilter,
        search: search.trim(),
      });

      const res = await fetch(`/api/admin/feedbacks?${params.toString()}`);
      if (!res.ok) throw new Error(`Lỗi (${res.status})`);
      const data = await res.json();

      if (data.success) {
        setFeedbacks(data.feedbacks || []);
        if (data.statusCounts) setStatusCounts(data.statusCounts);
        setTotalPages(data.pagination?.totalPages || 1);
      } else {
        throw new Error(data.error || 'Không thể tải danh sách phản hồi');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi tải góp ý');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, categoryFilter, ratingFilter, search]);

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  const handleOpenDetail = (item: FeedbackItem) => {
    setSelectedFeedback(item);
    setEditStatus(item.status);
    setAdminNotes(item.admin_notes || '');
    setAdminReply(item.admin_reply || '');
  };

  const handleUpdateFeedback = async () => {
    if (!selectedFeedback) return;
    setActionLoading(true);

    try {
      const res = await fetch('/api/admin/feedbacks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedFeedback.id,
          status: editStatus,
          admin_notes: adminNotes.trim() || null,
          admin_reply: adminReply.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Cập nhật thất bại');
      }

      setToastMessage({ type: 'success', text: 'Cập nhật phản hồi thành công!' });
      // Update local state
      setFeedbacks((prev) =>
        prev.map((f) =>
          f.id === selectedFeedback.id
            ? {
                ...f,
                status: editStatus,
                admin_notes: adminNotes.trim() || null,
                admin_reply: adminReply.trim() || null,
              }
            : f
        )
      );
      setSelectedFeedback(null);
      // Refresh counts
      fetchFeedbacks();
    } catch (err: unknown) {
      setToastMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi cập nhật',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleQuickResolve = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/feedbacks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'resolved' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Cập nhật thất bại');

      setToastMessage({ type: 'success', text: 'Đã đánh dấu giải quyết!' });
      setFeedbacks((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: 'resolved' } : f))
      );
      fetchFeedbacks();
    } catch (err: unknown) {
      setToastMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi cập nhật',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteFeedback = async (id: string) => {
    if (!window.confirm('Bạn có chắc muốn xóa góp ý này khỏi hệ thống?')) return;
    setActionLoading(true);

    try {
      const res = await fetch(`/api/admin/feedbacks?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Xóa thất bại');

      setToastMessage({ type: 'success', text: 'Đã xóa góp ý thành công.' });
      setFeedbacks((prev) => prev.filter((f) => f.id !== id));
      setSelectedFeedback(null);
      fetchFeedbacks();
    } catch (err: unknown) {
      setToastMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi xóa',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: FeedbackStatus) => {
    switch (status) {
      case 'pending':
        return (
          <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold flex items-center gap-1.5 w-fit">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>Chờ xử lý</span>
          </span>
        );
      case 'in_progress':
        return (
          <span className="px-2.5 py-1 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400 text-xs font-bold flex items-center gap-1.5 w-fit">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            <span>Đang xử lý</span>
          </span>
        );
      case 'resolved':
        return (
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-1.5 w-fit">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Đã giải quyết</span>
          </span>
        );
      case 'closed':
        return (
          <span className="px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 text-xs font-medium w-fit">
            Đã đóng
          </span>
        );
    }
  };

  const getCategoryBadge = (category: string) => {
    if (category.includes('video')) {
      return (
        <span className="px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20 text-[11px] font-semibold">
          🎬 {category}
        </span>
      );
    }
    if (category.includes('phụ đề') || category.includes('âm thanh')) {
      return (
        <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px] font-semibold">
          🔊 {category}
        </span>
      );
    }
    if (category.includes('tính năng')) {
      return (
        <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[11px] font-semibold">
          💡 {category}
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[11px] font-semibold">
        💬 {category}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <span>💬</span> Quản Lý Góp Ý & Báo Lỗi
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400">
            Xem đánh giá 1–5 sao, phân loại lỗi video/phụ đề, xử lý và phản hồi cho khán giả
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 font-bold">
            {statusCounts.pending} góp ý chờ duyệt
          </span>
        </div>
      </div>

      {toastMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-center justify-between animate-in fade-in ${
            toastMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="text-zinc-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/5 pb-4">
        {[
          { key: 'all', label: 'Tất cả', count: statusCounts.all },
          { key: 'pending', label: 'Chờ xử lý', count: statusCounts.pending },
          { key: 'in_progress', label: 'Đang xử lý', count: statusCounts.in_progress },
          { key: 'resolved', label: 'Đã giải quyết', count: statusCounts.resolved },
          { key: 'closed', label: 'Đã đóng', count: statusCounts.closed },
        ].map((tab) => {
          const isActive = statusFilter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setStatusFilter(tab.key);
                setPage(1);
              }}
              className={`cursor-pointer px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                isActive
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-white/5'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isActive ? 'bg-black/20 text-white' : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-zinc-900/90 border border-white/5 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
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
            placeholder="Tìm theo tiêu đề, nội dung, email hoặc tên phim..."
            className="w-full bg-zinc-950 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
          >
            <option value="all">Tất cả phân loại</option>
            <option value="Báo lỗi video">Báo lỗi video</option>
            <option value="Lỗi phụ đề / âm thanh">Lỗi phụ đề / âm thanh</option>
            <option value="Tốc độ tải chậm">Tốc độ tải chậm</option>
            <option value="Góp ý giao diện">Góp ý giao diện</option>
            <option value="Đề xuất tính năng">Đề xuất tính năng</option>
            <option value="Sai thông tin phim">Sai thông tin phim</option>
            <option value="Khác">Khác</option>
          </select>

          {/* Rating Filter */}
          <select
            value={ratingFilter}
            onChange={(e) => {
              setRatingFilter(e.target.value);
              setPage(1);
            }}
            className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
          >
            <option value="all">Tất cả số sao</option>
            <option value="5">⭐⭐⭐⭐⭐ 5 sao</option>
            <option value="4">⭐⭐⭐⭐ 4 sao</option>
            <option value="3">⭐⭐⭐ 3 sao</option>
            <option value="2">⭐⭐ 2 sao</option>
            <option value="1">⭐ 1 sao</option>
          </select>
        </div>
      </div>

      {/* Feedbacks Table */}
      <div className="bg-zinc-900/90 border border-white/5 rounded-2xl shadow-xl overflow-hidden flex flex-col">
        {loading ? (
          <div className="p-12 text-center text-zinc-400 text-sm flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <span>Đang tải danh sách góp ý...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-400 text-sm">{error}</div>
        ) : feedbacks.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 text-sm">
            Không có phản hồi nào phù hợp với bộ lọc.
          </div>
        ) : (
          <>
            {/* Desktop Table View (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-zinc-950/50 text-zinc-400 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3.5 px-4">Đánh giá</th>
                    <th className="py-3.5 px-4">Phân loại</th>
                    <th className="py-3.5 px-4">Tiêu đề & Nội dung</th>
                    <th className="py-3.5 px-4">Người gửi</th>
                    <th className="py-3.5 px-4">Trạng thái</th>
                    <th className="py-3.5 px-4">Thời gian</th>
                    <th className="py-3.5 px-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {feedbacks.map((f) => (
                    <tr
                      key={f.id}
                      onClick={() => handleOpenDetail(f)}
                      className="hover:bg-white/[0.02] transition-colors group cursor-pointer"
                    >
                      {/* Rating */}
                      <td className="py-3.5 px-4 font-mono">
                        {f.rating ? (
                          <span className="text-amber-400 font-bold whitespace-nowrap">
                            {'★'.repeat(f.rating)}
                            <span className="text-zinc-600">{'★'.repeat(5 - f.rating)}</span>
                          </span>
                        ) : (
                          <span className="text-zinc-500 text-[11px]">Không chấm</span>
                        )}
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {getCategoryBadge(f.category)}
                      </td>

                      {/* Subject & Summary */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white max-w-[220px] sm:max-w-[320px] truncate">
                          {f.subject}
                        </div>
                        <div className="text-zinc-400 text-xs max-w-[220px] sm:max-w-[320px] truncate mt-0.5">
                          {f.content}
                        </div>
                        {f.movie_name && (
                          <div className="text-[10px] text-orange-400 mt-1 truncate">
                            🎬 {f.movie_name} {f.episode_name ? `(${f.episode_name})` : ''}
                          </div>
                        )}
                      </td>

                      {/* Sender */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-zinc-200 truncate max-w-[140px]">
                          {f.user_name || 'Khách'}
                        </div>
                        <div className="text-[11px] text-zinc-500 truncate max-w-[140px]">
                          {f.user_email || 'Ẩn danh'}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">{getStatusBadge(f.status)}</td>

                      {/* Date */}
                      <td className="py-3.5 px-4 text-xs font-mono text-zinc-400 whitespace-nowrap">
                        {new Date(f.created_at).toLocaleDateString('vi-VN', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {f.status !== 'resolved' && (
                            <button
                              onClick={(e) => handleQuickResolve(f.id, e)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-semibold transition-colors"
                              title="Đánh dấu đã giải quyết"
                            >
                              ✓ Xong
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenDetail(f)}
                            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                            title="Xem chi tiết & Phản hồi"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List (< md) */}
            <div className="md:hidden divide-y divide-white/5">
              {feedbacks.map((f) => (
                <div
                  key={f.id}
                  onClick={() => handleOpenDetail(f)}
                  className="p-4 hover:bg-white/[0.02] transition-colors flex flex-col gap-2.5 cursor-pointer"
                >
                  {/* Row 1: Stars, Category Badge, Status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {f.rating ? (
                        <span className="text-amber-400 font-bold text-xs whitespace-nowrap">
                          {'★'.repeat(f.rating)}
                          <span className="text-zinc-700">{'★'.repeat(5 - f.rating)}</span>
                        </span>
                      ) : null}
                      {getCategoryBadge(f.category)}
                    </div>
                    <div className="shrink-0">{getStatusBadge(f.status)}</div>
                  </div>

                  {/* Row 2: Subject & Content */}
                  <div>
                    <h3 className="font-bold text-white text-sm line-clamp-1">
                      {f.subject}
                    </h3>
                    <p className="text-zinc-400 text-xs line-clamp-2 mt-0.5 leading-relaxed">
                      {f.content}
                    </p>
                  </div>

                  {/* Row 3: Movie info if linked */}
                  {f.movie_name && (
                    <div className="text-[11px] text-orange-400 flex items-center gap-1.5 truncate bg-orange-500/10 border border-orange-500/20 px-2.5 py-1 rounded-lg w-fit">
                      <span>🎬</span>
                      <span className="font-semibold truncate max-w-[240px]">
                        {f.movie_name} {f.episode_name ? `(${f.episode_name})` : ''}
                      </span>
                    </div>
                  )}

                  {/* Row 4: Sender, Date, Quick Actions */}
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5 text-zinc-400" onClick={(e) => e.stopPropagation()}>
                    <div className="min-w-0">
                      <span className="font-medium text-zinc-300 truncate block max-w-[140px]">
                        {f.user_name || 'Khách ẩn danh'}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {new Date(f.created_at).toLocaleDateString('vi-VN', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {f.status !== 'resolved' && (
                        <button
                          onClick={(e) => handleQuickResolve(f.id, e)}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500 text-emerald-400 hover:text-white border border-emerald-500/30 text-xs font-bold transition-all touch-target flex items-center gap-1"
                        >
                          <span>✓</span>
                          <span>Xong</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenDetail(f)}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors touch-target flex items-center gap-1"
                      >
                        <span>Chi tiết</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Pagination */}
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
                &larr; Trước
              </button>
              <button
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-semibold disabled:opacity-30 transition-colors"
              >
                Tiếp &rarr;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail / Reply Modal */}
      {selectedFeedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl max-w-xl w-full p-6 sm:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setSelectedFeedback(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white"
            >
              ✕
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 font-bold flex items-center justify-center text-lg border border-orange-500/30">
                💬
              </div>
              <div>
                <div className="flex items-center gap-2">
                  {getCategoryBadge(selectedFeedback.category)}
                  {selectedFeedback.rating && (
                    <span className="text-amber-400 font-bold text-xs">
                      {'★'.repeat(selectedFeedback.rating)} ({selectedFeedback.rating}/5)
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-white mt-1">
                  {selectedFeedback.subject}
                </h3>
              </div>
            </div>

            {/* Sender & Movie Context Box */}
            <div className="bg-zinc-950 p-4 rounded-xl border border-white/5 flex flex-col gap-2 text-xs mb-5">
              <div className="flex justify-between">
                <span className="text-zinc-500">Người gửi:</span>
                <span className="font-semibold text-white">
                  {selectedFeedback.user_name || 'Khách vãng lai'}{' '}
                  {selectedFeedback.user_email && `(${selectedFeedback.user_email})`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Thời gian gửi:</span>
                <span className="text-zinc-300 font-mono">
                  {new Date(selectedFeedback.created_at).toLocaleString('vi-VN')}
                </span>
              </div>
              {selectedFeedback.movie_name && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Phim liên quan:</span>
                  <span className="font-semibold text-orange-400">
                    {selectedFeedback.movie_name}{' '}
                    {selectedFeedback.episode_name && `(${selectedFeedback.episode_name})`}
                  </span>
                </div>
              )}
              {selectedFeedback.movie_url && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Link báo lỗi:</span>
                  <a
                    href={selectedFeedback.movie_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-400 underline truncate max-w-[280px]"
                  >
                    {selectedFeedback.movie_url}
                  </a>
                </div>
              )}
            </div>

            {/* Main Content */}
            <div className="mb-6">
              <label className="block text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">
                Nội dung chi tiết từ người dùng
              </label>
              <div className="p-4 rounded-xl bg-zinc-950 border border-white/5 text-zinc-200 text-sm whitespace-pre-wrap leading-relaxed">
                {selectedFeedback.content}
              </div>
            </div>

            {/* Admin Management Controls */}
            <div className="flex flex-col gap-4 border-t border-white/5 pt-5 mb-6">
              {/* Change Status */}
              <div>
                <label className="block text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">
                  Trạng thái xử lý
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'pending', label: 'Chờ xử lý' },
                    { id: 'in_progress', label: 'Đang xử lý' },
                    { id: 'resolved', label: 'Đã giải quyết' },
                    { id: 'closed', label: 'Đã đóng' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setEditStatus(st.id as FeedbackStatus)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                        editStatus === st.id
                          ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20'
                          : 'bg-zinc-950 text-zinc-400 border-white/10 hover:bg-zinc-800'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Admin Notes */}
              <div>
                <label className="block text-zinc-400 text-xs font-bold uppercase tracking-wider mb-1.5">
                  Ghi chú nội bộ (chỉ Admin nhìn thấy)
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={2}
                  placeholder="Ví dụ: Đã kiểm tra server stream KKPhim, lỗi do tập 4 bị hỏng link..."
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
                />
              </div>

              {/* Admin Reply */}
              <div>
                <label className="block text-zinc-400 text-xs font-bold uppercase tracking-wider mb-1.5">
                  Nội dung phản hồi tới khán giả
                </label>
                <textarea
                  value={adminReply}
                  onChange={(e) => setAdminReply(e.target.value)}
                  rows={2}
                  placeholder="Phản hồi cảm ơn hoặc thông báo đã khắc phục lỗi cho người gửi..."
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => handleDeleteFeedback(selectedFeedback.id)}
                className="cursor-pointer px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold text-xs border border-red-500/20 transition-colors"
              >
                Xóa góp ý
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedFeedback(null)}
                  className="cursor-pointer px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs transition-colors"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleUpdateFeedback}
                  className="cursor-pointer px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs transition-all shadow-lg shadow-orange-500/25 disabled:opacity-50"
                >
                  {actionLoading ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
