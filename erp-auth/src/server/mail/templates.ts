import 'server-only';

import type { Mail } from '@/server/mail/mailer';

/** The OTP mail never contains the old PIN, a link, or any account detail. */
export function pinResetOtpMail(to: string, code: string, ttlMinutes: number): Mail {
  const subject = 'رمز إعادة تعيين رمز الدخول';
  const text = [
    'مرحباً،',
    '',
    `رمز التحقق الخاص بك هو: ${code}`,
    `صالح لمدة ${ttlMinutes} دقيقة، ويُستخدم مرة واحدة فقط.`,
    '',
    'إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة ولا تشاركها مع أحد.',
  ].join('\n');

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
  <body style="margin:0;padding:24px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f5f5f7;">
    <table role="presentation" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;">
      <tr><td>
        <p style="margin:0 0 16px;font-size:16px;">مرحباً،</p>
        <p style="margin:0 0 8px;font-size:14px;">رمز التحقق الخاص بك:</p>
        <p style="margin:0 0 16px;font-size:34px;font-weight:700;letter-spacing:10px;direction:ltr;text-align:center;">${code}</p>
        <p style="margin:0 0 8px;font-size:14px;">صالح لمدة ${ttlMinutes} دقيقة، ويُستخدم مرة واحدة فقط.</p>
        <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة ولا تشاركها مع أحد.</p>
      </td></tr>
    </table>
  </body>
</html>`;

  return { to, subject, text, html };
}
