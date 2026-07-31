import { QUEUES } from '@xnuxuz/shared';
import type { Job } from 'bullmq';
import { runDueBriefings } from '../api-client.js';
import { logger } from '../config.js';
import { getQueue } from '../queues.js';

/** Tiap 15 menit: cukup rapat untuk menghormati jam briefing per user, cukup jarang untuk murah. */
const EVERY_15_MIN = '*/15 * * * *';
const SCHEDULER_ID = 'briefing-sweep';

/**
 * Worker hanya memegang jadwalnya; penentuan siapa yang jatuh tempo dan isi
 * pesannya dikerjakan API (§2).
 */
export async function processDigest(job: Job): Promise<void> {
  const result = await runDueBriefings();
  logger.info({ jobId: job.id, sent: result.sent }, 'Sweep briefing selesai');
}

export async function registerDigestSchedule(): Promise<void> {
  // Job scheduler BullMQ idempoten: id yang sama menimpa jadwal lama, jadi
  // restart worker tidak menumpuk cron ganda.
  await getQueue(QUEUES.digest).upsertJobScheduler(
    SCHEDULER_ID,
    { pattern: EVERY_15_MIN },
    { name: 'briefing-sweep' },
  );
}
