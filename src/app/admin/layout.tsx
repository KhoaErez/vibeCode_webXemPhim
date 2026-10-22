import Link from 'next/link';
import { verifyAdminSession } from '@/lib/adminAuth';
import AdminLayoutShell from '@/components/admin/AdminLayoutShell';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Bảng Điều Khiển Quản Trị | Rạp Nhà',
  description: 'Hệ thống quản lý tài khoản, theo dõi realtime, thống kê và phản hồi khán giả.',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await verifyAdminSession();

  // 1. Nếu chưa đăng nhập hoặc không có quyền Admin -> Hiển thị màn hình 403 / Đăng nhập an toàn
  if (!auth.isAdmin) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 text-center">
        <div className="max-w-md w-full bg-zinc-900 border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="w-20 h-20 bg-red-500/10 border border-red-500/30 text-red-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8V7z"
              />
            </svg>
          </div>

          <span className="inline-block px-3 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 font-extrabold text-xs uppercase tracking-wider mb-3">
            {auth.user ? '403 Truy Cập Bị Từ Chối' : 'Yêu Cầu Xác Thực'}
          </span>

          <h2 className="text-2xl font-extrabold text-white mb-2">
            {auth.user ? 'Khu Vực Quản Trị Viên' : 'Chưa Đăng Nhập'}
          </h2>

          <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
            {auth.user
              ? `Tài khoản (${auth.user.email}) chưa được cấp quyền Quản trị viên (Admin). Vui lòng liên hệ quản trị hệ thống nếu bạn cần phân quyền.`
              : 'Trang này chỉ dành riêng cho Quản trị viên hệ thống Rạp Nhà. Vui lòng đăng nhập với tài khoản được cấp quyền.'}
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/"
              className="flex-1 px-5 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-sm transition-colors border border-white/5 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Về Trang Chủ</span>
            </Link>

            {!auth.user && (
              <Link
                href="/?auth=login"
                className="flex-1 px-5 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm transition-colors shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2"
              >
                <span>Đăng Nhập</span>
                <span>&rarr;</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 2. Nếu đã xác thực quyền Admin hợp lệ -> Render giao diện Admin
  return <AdminLayoutShell profile={auth.profile}>{children}</AdminLayoutShell>;
}
