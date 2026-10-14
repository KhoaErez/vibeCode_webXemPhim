import { NextResponse } from 'next/server';

// Anti-spam in-memory rate limiting: max 3 requests per 5 minutes per IP
const rateLimitMap = new Map<string, { count: number; firstRequestTime: number }>();
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 3;

// Simple HTML escaping to prevent HTML injection in emails
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const ALLOWED_TYPES = [
  'Góp ý giao diện',
  'Đề xuất tính năng',
  'Báo lỗi video',
  'Lỗi phụ đề / âm thanh',
  'Sai thông tin phim',
  'Khác',
];

export async function POST(request: Request) {
  try {
    // 1. Rate limiting by IP or forwarded IP
    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'unknown-ip';

    const now = Date.now();
    const clientRecord = rateLimitMap.get(clientIp);

    if (clientRecord) {
      if (now - clientRecord.firstRequestTime < RATE_LIMIT_WINDOW_MS) {
        if (clientRecord.count >= RATE_LIMIT_MAX_REQUESTS) {
          const remainingMinutes = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - clientRecord.firstRequestTime)) / 60000);
          return NextResponse.json(
            { error: `Bạn gửi góp ý quá nhanh. Vui lòng đợi ${remainingMinutes} phút trước khi gửi tiếp để chống spam.` },
            { status: 429 }
          );
        }
        clientRecord.count += 1;
      } else {
        rateLimitMap.set(clientIp, { count: 1, firstRequestTime: now });
      }
    } else {
      rateLimitMap.set(clientIp, { count: 1, firstRequestTime: now });
    }

    // Clean up old entries periodically
    if (rateLimitMap.size > 1000) {
      for (const [ip, record] of rateLimitMap.entries()) {
        if (now - record.firstRequestTime > RATE_LIMIT_WINDOW_MS) {
          rateLimitMap.delete(ip);
        }
      }
    }

    // 2. Parse and validate request body
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
    }

    const {
      subject,
      type,
      content,
      movieName,
      episodeName,
      movieUrl,
      userEmail,
      userId,
    } = body;

    // Validate type
    if (!type || !ALLOWED_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Loại góp ý không hợp lệ.' }, { status: 400 });
    }

    // Validate subject
    if (!subject || typeof subject !== 'string' || subject.trim().length < 3) {
      return NextResponse.json({ error: 'Tiêu đề góp ý phải có ít nhất 3 ký tự.' }, { status: 400 });
    }
    if (subject.trim().length > 150) {
      return NextResponse.json({ error: 'Tiêu đề góp ý không được vượt quá 150 ký tự.' }, { status: 400 });
    }

    // Validate content
    if (!content || typeof content !== 'string' || content.trim().length < 10) {
      return NextResponse.json({ error: 'Nội dung góp ý chi tiết phải có ít nhất 10 ký tự.' }, { status: 400 });
    }
    if (content.trim().length > 2500) {
      return NextResponse.json({ error: 'Nội dung góp ý không được vượt quá 2500 ký tự.' }, { status: 400 });
    }

    // Validate sender email format if provided
    if (userEmail && typeof userEmail === 'string') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(userEmail.trim())) {
        return NextResponse.json({ error: 'Địa chỉ email người gửi không đúng định dạng.' }, { status: 400 });
      }
    }

    // 3. Check environment configuration
    const resendApiKey = process.env.RESEND_API_KEY;
    const receiverEmail = process.env.FEEDBACK_RECEIVER_EMAIL;
    const senderEmail = process.env.FEEDBACK_SENDER_EMAIL || 'Rạp Nhà Feedback <onboarding@resend.dev>';

    if (!resendApiKey) {
      return NextResponse.json(
        {
          error:
            'Chưa cấu hình dịch vụ gửi email (thiếu biến môi trường RESEND_API_KEY). Vui lòng liên hệ quản trị viên để thiết lập.',
        },
        { status: 500 }
      );
    }

    if (!receiverEmail) {
      return NextResponse.json(
        {
          error:
            'Chưa cấu hình địa chỉ email nhận góp ý (thiếu biến môi trường FEEDBACK_RECEIVER_EMAIL). Vui lòng liên hệ quản trị viên.',
        },
        { status: 500 }
      );
    }

    // 4. Construct email HTML
    const sanitizedSubject = escapeHtml(subject.trim());
    const sanitizedType = escapeHtml(type);
    const sanitizedContent = escapeHtml(content.trim()).replace(/\n/g, '<br />');
    const sanitizedMovieName = movieName ? escapeHtml(String(movieName).trim()) : null;
    const sanitizedEpisodeName = episodeName ? escapeHtml(String(episodeName).trim()) : null;
    const sanitizedMovieUrl = movieUrl ? escapeHtml(String(movieUrl).trim()) : null;
    const sanitizedUserEmail = userEmail ? escapeHtml(String(userEmail).trim()) : null;
    const sanitizedUserId = userId ? escapeHtml(String(userId).trim()) : null;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>[Rạp Nhà] ${sanitizedSubject}</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; color: #f4f4f5; margin: 0; padding: 24px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #18181b; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 20px 24px; color: #ffffff;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">🍿 RẠP NHÀ - GÓP Ý TỪ NGƯỜI XEM</h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">Hệ thống thông báo góp ý & báo lỗi phim tự động</p>
            </div>

            <!-- Content Area -->
            <div style="padding: 24px;">
              <!-- Metadata Badge -->
              <div style="margin-bottom: 20px;">
                <span style="display: inline-block; background-color: rgba(249, 115, 22, 0.15); color: #f97316; border: 1px solid rgba(249, 115, 22, 0.3); padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase;">
                  ${sanitizedType}
                </span>
                <span style="display: inline-block; margin-left: 8px; color: #a1a1aa; font-size: 12px;">
                  ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                </span>
              </div>

              <!-- Subject -->
              <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 700; color: #ffffff;">
                ${sanitizedSubject}
              </h2>

              <!-- Details Grid -->
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background-color: #27272a; border-radius: 8px; overflow: hidden; font-size: 13px;">
                ${
                  sanitizedUserEmail
                    ? `<tr>
                        <td style="padding: 10px 14px; color: #a1a1aa; border-bottom: 1px solid rgba(255,255,255,0.05); width: 140px;">Người gửi:</td>
                        <td style="padding: 10px 14px; color: #ffffff; border-bottom: 1px solid rgba(255,255,255,0.05); font-weight: 600;">${sanitizedUserEmail}</td>
                      </tr>`
                    : `<tr>
                        <td style="padding: 10px 14px; color: #a1a1aa; border-bottom: 1px solid rgba(255,255,255,0.05); width: 140px;">Người gửi:</td>
                        <td style="padding: 10px 14px; color: #a1a1aa; border-bottom: 1px solid rgba(255,255,255,0.05); font-style: italic;">Khách vãng lai (Chưa đăng nhập / ẩn danh)</td>
                      </tr>`
                }
                ${
                  sanitizedUserId
                    ? `<tr>
                        <td style="padding: 10px 14px; color: #a1a1aa; border-bottom: 1px solid rgba(255,255,255,0.05);">User ID:</td>
                        <td style="padding: 10px 14px; color: #d4d4d8; font-family: monospace; font-size: 12px; border-bottom: 1px solid rgba(255,255,255,0.05);">${sanitizedUserId}</td>
                      </tr>`
                    : ''
                }
                ${
                  sanitizedMovieName
                    ? `<tr>
                        <td style="padding: 10px 14px; color: #a1a1aa; border-bottom: 1px solid rgba(255,255,255,0.05);">Phim liên quan:</td>
                        <td style="padding: 10px 14px; color: #f97316; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.05);">${sanitizedMovieName} ${
                        sanitizedEpisodeName ? `(${sanitizedEpisodeName})` : ''
                      }</td>
                      </tr>`
                    : ''
                }
                ${
                  sanitizedMovieUrl
                    ? `<tr>
                        <td style="padding: 10px 14px; color: #a1a1aa;">Đường dẫn xem:</td>
                        <td style="padding: 10px 14px; color: #38bdf8;"><a href="${sanitizedMovieUrl}" style="color: #38bdf8; text-decoration: underline;" target="_blank">${sanitizedMovieUrl}</a></td>
                      </tr>`
                    : ''
                }
              </table>

              <!-- Main Content Box -->
              <div style="background-color: #09090b; border: 1px solid rgba(255,255,255,0.1); border-left: 4px solid #f97316; border-radius: 8px; padding: 16px; margin-bottom: 24px; color: #e4e4e7; line-height: 1.6; font-size: 14px;">
                ${sanitizedContent}
              </div>

              <!-- Footer -->
              <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px; font-size: 12px; color: #71717a; text-align: center;">
                Email được gửi tự động từ biểu mẫu góp ý trên website <strong>Rạp Nhà</strong>.
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    // 5. Send email via Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: senderEmail,
        to: [receiverEmail],
        reply_to: userEmail && typeof userEmail === 'string' ? userEmail.trim() : undefined,
        subject: `[Rạp Nhà] [${type}] ${subject.trim()}`,
        html: emailHtml,
      }),
    });

    const resendData = await resendResponse.json().catch(() => ({}));

    if (!resendResponse.ok) {
      console.error('Resend API error:', resendResponse.status, resendData);
      const errorMessage =
        resendData?.message ||
        resendData?.error?.message ||
        `Gửi email thất bại (Mã lỗi ${resendResponse.status}).`;
      return NextResponse.json(
        {
          error: `Không thể gửi email đến quản trị viên: ${errorMessage}`,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Cảm ơn bạn! Góp ý của bạn đã được gửi thành công đến hòm thư quản trị viên.',
      id: resendData?.id,
    });
  } catch (error: unknown) {
    console.error('Unexpected error in feedback API:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống';
    return NextResponse.json({ error: `Đã có lỗi xảy ra: ${message}` }, { status: 500 });
  }
}
