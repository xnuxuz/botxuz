import {
  NOTIF_TYPES,
  type NotificationChannel,
  type NotificationPayload,
  type NotificationPriority,
  type NotifType,
  notificationPayloadSchema,
} from '@xnuxuz/shared';
import type { Job } from 'bullmq';
import { logger } from '../config.js';
import { notifications } from '../notify.js';
import { getQueue, QUEUES } from '../queues.js';

export type NotificationJob = {
  userId: string;
  notifType?: NotifType;
  channels?: NotificationChannel[];
  priority?: NotificationPriority;
  bypassQuietHours?: boolean;
  payload: NotificationPayload;
};

/**
 * Satu-satunya consumer yang memanggil NotificationService. Job gagal sengaja
 * dilempar ulang supaya BullMQ yang mengurus retry + backoff, bukan kode ini.
 */
export async function processNotification(job: Job<NotificationJob>): Promise<void> {
  const { userId, notifType = NOTIF_TYPES.system, channels, priority, bypassQuietHours } = job.data;
  const payload = notificationPayloadSchema.parse(job.data.payload);

  const result = await notifications.send(userId, payload, {
    notifType,
    channels,
    priority,
    bypassQuietHours,
  });

  if (result.status === 'sent') {
    logger.info({ jobId: job.id, userId, channel: result.channel }, 'Notifikasi terkirim');
    return;
  }

  if (result.status === 'deferred') {
    // Quiet hours: jangan dibuang, jadwalkan ulang tepat setelah jendelanya lewat.
    const delay = Math.max(result.retryAt.getTime() - Date.now(), 0);
    await getQueue(QUEUES.notification).add('deferred', job.data, {
      delay,
      jobId: `${payload.idempotencyKey}:deferred`,
    });
    logger.info(
      { jobId: job.id, userId, retryAt: result.retryAt },
      'Notifikasi ditunda (quiet hours)',
    );
    return;
  }

  const detail = result.errors.map((entry) => `${entry.channel}: ${entry.error}`).join('; ');
  throw new Error(`Semua channel gagal — ${detail}`);
}
