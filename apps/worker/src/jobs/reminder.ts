import { QUEUES } from '@xnuxuz/shared';
import type { Job } from 'bullmq';
import { logger } from '../config.js';
import { getQueue } from '../queues.js';

export type ReminderJob = {
  userId: string;
  refType: 'event' | 'task';
  refId: string;
  title: string;
};

/**
 * Reminder dijadwalkan dengan job id deterministik `reminder:{refId}:{fireAt}`
 * supaya penjadwalan ulang tidak pernah menghasilkan dua notifikasi (§3.6).
 */
export async function processReminder(job: Job<ReminderJob>): Promise<void> {
  const { userId, refType, refId, title } = job.data;

  await getQueue(QUEUES.notification).add(
    'dispatch',
    {
      userId,
      payload: {
        idempotencyKey: `reminder:${refId}:${job.id ?? 'unknown'}`,
        title: 'Pengingat',
        body: title,
        data: { refType, refId },
      },
    },
    { jobId: `notif:${refId}:${job.id ?? 'unknown'}` },
  );

  logger.info({ jobId: job.id, userId, refType, refId }, 'Reminder diteruskan ke notifikasi');
}
