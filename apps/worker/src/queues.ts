import { QUEUES, type QueueName } from '@xnuxuz/shared';
import type { Processor } from 'bullmq';
import { type ConnectionOptions, Queue, Worker } from 'bullmq';
import { env } from './config.js';

/** BullMQ butuh maxRetriesPerRequest null — kalau tidak, blocking command-nya error. */
export const connection: ConnectionOptions = {
  url: env.REDIS_URL,
  maxRetriesPerRequest: null,
};

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 1_000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

const queues = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, { connection, defaultJobOptions });
    queues.set(name, queue);
  }
  return queue;
}

export function createWorker(name: QueueName, processor: Processor): Worker {
  return new Worker(name, processor, {
    connection,
    concurrency: env.WORKER_CONCURRENCY,
  });
}

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([...queues.values()].map((queue) => queue.close()));
  queues.clear();
}

export { QUEUES };
