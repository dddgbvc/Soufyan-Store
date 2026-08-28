import 'server-only';

import { config } from '@/server/config';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/**
 * Development transport. Prints a redacted notice; the OTP itself is written
 * only when explicitly opted in, so a shared terminal never leaks live codes.
 */
class ConsoleMailer implements Mailer {
  async send(mail: Mail): Promise<void> {
    const preview = process.env.MAIL_DEBUG_SHOW_BODY === 'true' ? `\n${mail.text}` : ' (set MAIL_DEBUG_SHOW_BODY=true to print)';
    console.info(`[mail] → ${mail.to} · ${mail.subject}${preview}`);
  }
}

class ResendMailer implements Mailer {
  constructor(private readonly apiKey: string) {}

  async send(mail: Mail): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: config.mail.from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
    });

    if (!response.ok) {
      // The body may echo the recipient; keep it out of the log.
      throw new Error(`Mail provider rejected the message (HTTP ${response.status})`);
    }
  }
}

let cached: Mailer | null = null;

export function getMailer(): Mailer {
  if (cached) return cached;

  if (config.mail.provider === 'resend') {
    if (!config.mail.resendApiKey) {
      throw new Error('MAIL_PROVIDER=resend requires RESEND_API_KEY');
    }
    cached = new ResendMailer(config.mail.resendApiKey);
  } else {
    cached = new ConsoleMailer();
  }

  return cached;
}

/** Test seam: lets the suite capture mail without touching the network. */
export function setMailer(mailer: Mailer | null): void {
  cached = mailer;
}
