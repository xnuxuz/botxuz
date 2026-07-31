import type { Db } from '@xnuxuz/db';
import {
  DEFAULT_NOTIF_CHANNELS,
  type NotificationAdapter,
  type NotificationChannel,
  type NotificationPayload,
  type NotificationPriority,
  type NotifType,
} from '@xnuxuz/shared';
import { EmailAdapter, type SmtpConfig } from './adapters/email.js';
import { TelegramAdapter } from './adapters/telegram.js';
import { isWithinQuietHours, localMinuteOfDay, quietHoursEndAt } from './quiet-hours.js';

export type SendOptions = {
  notifType: NotifType;
  /** Menimpa preferensi user — dipakai sistem, bukan fitur user. */
  channels?: NotificationChannel[];
  priority?: NotificationPriority;
  bypassQuietHours?: boolean;
};

export type SendResult =
  | { status: 'sent'; channel: NotificationChannel }
  /** Kena quiet hours; caller (worker) menjadwalkan ulang ke `retryAt`. */
  | { status: 'deferred'; retryAt: Date }
  | { status: 'failed'; errors: { channel: NotificationChannel; error: string }[] };

type Recipient = {
  timezone: string;
  telegramChatId: string | null;
  email: string;
};

export type NotificationServiceConfig = {
  db: Db;
  telegramBotToken?: string;
  smtp?: SmtpConfig | null;
  logger?: { warn: (obj: unknown, msg: string) => void };
};

/**
 * Satu-satunya pintu keluar notifikasi (REQUIREMENT §3.6). Modul lain tidak
 * pernah memanggil Telegram/SMTP langsung, jadi menambah channel = menambah
 * adapter di sini saja.
 */
export class NotificationService {
  private readonly db: Db;
  private readonly adapters: Map<NotificationChannel, NotificationAdapter>;
  private readonly logger: NotificationServiceConfig['logger'];

  constructor(config: NotificationServiceConfig) {
    this.db = config.db;
    this.logger = config.logger;

    const telegram = new TelegramAdapter(config.telegramBotToken, async (userId) => {
      const user = await this.db.user.findUnique({
        where: { id: userId },
        select: { telegramChatId: true },
      });
      return user?.telegramChatId ?? null;
    });

    const email = new EmailAdapter(config.smtp ?? null, async (userId) => {
      const user = await this.db.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      return user?.email ?? null;
    });

    this.adapters = new Map<NotificationChannel, NotificationAdapter>([
      ['telegram', telegram],
      ['email', email],
    ]);
  }

  /**
   * Mencoba channel sesuai urutan preferensi dan berhenti di yang pertama
   * berhasil — daftar channel berarti fallback, bukan kirim ganda.
   */
  async send(
    userId: string,
    payload: NotificationPayload,
    options: SendOptions,
  ): Promise<SendResult> {
    const priority = options.priority ?? 'normal';
    const recipient = await this.loadRecipient(userId);
    if (!recipient) {
      return { status: 'failed', errors: [{ channel: 'telegram', error: 'User tidak ditemukan' }] };
    }

    const pref = await this.db.notificationPreference.findUnique({
      where: { userId_notifType: { userId, notifType: options.notifType } },
    });

    // Priority high selalu tembus quiet hours (§3.6).
    if (!options.bypassQuietHours && priority !== 'high' && pref) {
      const deferred = this.checkQuietHours(recipient.timezone, pref);
      if (deferred) return deferred;
    }

    const channels =
      options.channels ?? this.channelsOf(pref) ?? DEFAULT_NOTIF_CHANNELS[options.notifType];
    const errors: { channel: NotificationChannel; error: string }[] = [];

    for (const channel of channels) {
      const adapter = this.adapters.get(channel);
      if (!adapter?.isConfigured()) {
        errors.push({ channel, error: 'Adapter tidak tersedia atau belum dikonfigurasi' });
        continue;
      }

      try {
        await adapter.send(userId, payload);
        return { status: 'sent', channel };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ channel, error: message });
        this.logger?.warn({ userId, channel, err: message }, 'Channel gagal, coba fallback');
      }
    }

    return { status: 'failed', errors };
  }

  private async loadRecipient(userId: string): Promise<Recipient | null> {
    return this.db.user.findUnique({
      where: { id: userId },
      select: { timezone: true, telegramChatId: true, email: true },
    });
  }

  private channelsOf(pref: { channelsJson: unknown } | null): NotificationChannel[] | null {
    if (!pref) return null;
    const raw = pref.channelsJson;
    if (!Array.isArray(raw)) return null;
    const channels = raw.filter(
      (value): value is NotificationChannel =>
        typeof value === 'string' && this.adapters.has(value as NotificationChannel),
    );
    return channels.length > 0 ? channels : null;
  }

  private checkQuietHours(
    timezone: string,
    pref: { quietStartMinute: number | null; quietEndMinute: number | null },
  ): SendResult | null {
    const { quietStartMinute, quietEndMinute } = pref;
    if (quietStartMinute === null || quietEndMinute === null) return null;

    const now = new Date();
    const minuteOfDay = localMinuteOfDay(now, timezone);
    const window = { startMinute: quietStartMinute, endMinute: quietEndMinute };

    if (!isWithinQuietHours(minuteOfDay, window)) return null;

    return { status: 'deferred', retryAt: quietHoursEndAt(now, minuteOfDay, window) };
  }
}
