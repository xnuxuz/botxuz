import { z } from 'zod';
import { NOTIFICATION_CHANNELS, NOTIFICATION_PRIORITIES } from './constants.js';

/**
 * Kontrak NotificationService (REQUIREMENT §3.6).
 * Semua modul kirim notifikasi lewat sini, tidak pernah manggil Telegram/SMTP langsung.
 */
export const notificationPayloadSchema = z.object({
  /** Kunci idempotensi — BullMQ pakai ini sebagai job id supaya reminder tidak double-fire. */
  idempotencyKey: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  /** Data tambahan per-channel, mis. inline button Telegram. */
  data: z.record(z.string(), z.unknown()).optional(),
});

export type NotificationPayload = z.infer<typeof notificationPayloadSchema>;

export const notificationOptionsSchema = z.object({
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)).nonempty().optional(),
  priority: z.enum(NOTIFICATION_PRIORITIES).default('normal'),
  /** Kalau true, quiet hours user diabaikan. */
  bypassQuietHours: z.boolean().default(false),
});

export type NotificationOptions = z.input<typeof notificationOptionsSchema>;

export type DeliveryResult = {
  channel: (typeof NOTIFICATION_CHANNELS)[number];
  ok: boolean;
  error?: string;
};

/** Adapter per channel. Tambah channel = tambah adapter, tanpa sentuh modul lain. */
export interface NotificationAdapter {
  readonly channel: (typeof NOTIFICATION_CHANNELS)[number];
  isConfigured(): boolean;
  send(userId: string, payload: NotificationPayload): Promise<void>;
}
