import { disconnectDb } from '@xnuxuz/db';
import { QUEUES } from '@xnuxuz/shared';
import type { Worker } from 'bullmq';
import { startTelegramBot } from './bot/telegram.js';
import { env, logger } from './config.js';
import { processDigest, registerDigestSchedule } from './jobs/digest.js';
import { processNotification } from './jobs/notification.js';
import { processReminder } from './jobs/reminder.js';
import { closeQueues, createWorker } from './queues.js';

async function main(): Promise<void> {
  const workers: Worker[] = [
    createWorker(QUEUES.reminder, processReminder),
    createWorker(QUEUES.notification, processNotification),
    createWorker(QUEUES.digest, processDigest),
  ];

  await registerDigestSchedule();

  for (const worker of workers) {
    worker.on('failed', (job, error) => {
      logger.error({ queue: worker.name, jobId: job?.id, err: error }, 'Job gagal');
    });
  }

  const bot = startTelegramBot();

  logger.info(
    { queues: workers.map((worker) => worker.name), concurrency: env.WORKER_CONCURRENCY },
    'Worker siap',
  );

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Mematikan worker');
    await Promise.allSettled([
      bot?.stop(),
      ...workers.map((worker) => worker.close()),
      closeQueues(),
      disconnectDb(),
    ]);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Gagal menjalankan worker');
  process.exit(1);
});
