import { QUEUES } from '@xnuxuz/shared';
import type { Job } from 'bullmq';
import { runFinanceDaily } from '../api-client.js';
import { logger } from '../config.js';
import { getQueue } from '../queues.js';

/**
 * 00:10 UTC = 07:10 WIB. Sengaja lewat beberapa menit dari tengah malam supaya
 * transaksi yang dicatat tepat pergantian hari tidak terlewat.
 */
const DAILY_0010_UTC = '10 0 * * *';
const SCHEDULER_ID = 'finance-daily';

export async function processRecurring(job: Job): Promise<void> {
  const result = await runFinanceDaily();
  logger.info(
    { jobId: job.id, created: result.created, alerts: result.alerts },
    'Job harian finance selesai',
  );
}

export async function registerRecurringSchedule(): Promise<void> {
  await getQueue(QUEUES.recurring).upsertJobScheduler(
    SCHEDULER_ID,
    { pattern: DAILY_0010_UTC },
    { name: 'finance-daily' },
  );
}
