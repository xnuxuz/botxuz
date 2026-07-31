/** Semua timestamp disimpan UTC di DB; konversi ke zona ini di edge/client. */
export const DEFAULT_TIMEZONE = 'Asia/Jakarta';

/** Versi API. Semua route hidup di bawah prefix ini sejak hari pertama. */
export const API_PREFIX = '/api/v1';

/** Umur access token (detik) — pendek, di-refresh lewat refresh token. */
export const ACCESS_TOKEN_TTL_SEC = 15 * 60;

/** Umur refresh token (detik) — dirotasi tiap pakai, revocation list di Redis. */
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;

/** Domain kategori — satu tabel categories dipakai tiga modul. */
export const CATEGORY_DOMAINS = ['task', 'finance', 'event'] as const;
export type CategoryDomain = (typeof CATEGORY_DOMAINS)[number];

/** Channel notifikasi yang didukung NotificationService. */
export const NOTIFICATION_CHANNELS = ['telegram', 'email', 'push', 'whatsapp'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_PRIORITIES = ['low', 'normal', 'high'] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

/** Ambang alert budget — kirim peringatan Telegram saat terlampaui. */
export const BUDGET_ALERT_THRESHOLDS = [0.8, 1.0] as const;

/** Nama queue BullMQ. Satu tempat supaya producer & consumer tidak beda string. */
export const QUEUES = {
  reminder: 'reminder',
  recurring: 'recurring',
  digest: 'digest',
  memory: 'memory',
  notification: 'notification',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
