import { type NotificationPayload, notificationPayloadSchema } from '@xnuxuz/shared';
import type { Job } from 'bullmq';
import { logger } from '../config.js';

export type NotificationJob = {
  userId: string;
  channels?: string[];
  payload: NotificationPayload;
};

/**
 * Consumer queue notifikasi. Dispatch sebenarnya ke adapter (Telegram, email,
 * push) menyusul bersama NotificationService di fase 0 lanjutan.
 */
export async function processNotification(job: Job<NotificationJob>): Promise<void> {
  const { userId, payload } = job.data;
  notificationPayloadSchema.parse(payload);

  logger.info(
    { jobId: job.id, userId, title: payload.title },
    'Notifikasi diterima (adapter belum terpasang)',
  );

  await Promise.resolve();
}
