import type { NotificationAdapter, NotificationPayload } from '@xnuxuz/shared';
import { createTransport, type Transporter } from 'nodemailer';

export type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
};

/**
 * Adapter email (§3.6) — Nodemailer + SMTP (Gmail app password atau Resend).
 * Transport dibuat malas: kalau SMTP tidak dikonfigurasi, package ini tetap
 * bisa di-import tanpa efek samping.
 */
export class EmailAdapter implements NotificationAdapter {
  readonly channel = 'email' as const;

  private transporter: Transporter | null = null;

  constructor(
    private readonly config: SmtpConfig | null,
    private readonly resolveEmail: (userId: string) => Promise<string | null>,
  ) {}

  isConfigured(): boolean {
    return this.config !== null;
  }

  async send(userId: string, payload: NotificationPayload): Promise<void> {
    if (!this.config) throw new Error('SMTP belum dikonfigurasi');

    const to = await this.resolveEmail(userId);
    if (!to) throw new Error('User tidak punya alamat email');

    this.transporter ??= createTransport({
      host: this.config.host,
      port: this.config.port,
      // 465 = TLS implisit; port lain (587) pakai STARTTLS.
      secure: this.config.port === 465,
      auth: { user: this.config.user, pass: this.config.password },
    });

    await this.transporter.sendMail({
      from: this.config.from,
      to,
      subject: payload.title,
      text: payload.body,
    });
  }
}
