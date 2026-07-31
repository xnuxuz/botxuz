import { Redis } from 'ioredis';
import { env } from './env.js';

/**
 * Satu koneksi Redis untuk cache, rate limit store, dan refresh token
 * revocation list. BullMQ punya koneksi sendiri di worker.
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

/**
 * Idempoten: RedisStore milik rate limiter sudah memicu koneksi saat modulnya
 * di-import, jadi connect() kedua kali akan melempar error kalau tidak dicek.
 */
export async function connectRedis(): Promise<void> {
  if (redis.status === 'wait') {
    await redis.connect();
    return;
  }
  if (redis.status !== 'ready') {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      redis.once('ready', resolvePromise);
      redis.once('error', rejectPromise);
    });
  }
}

export async function pingRedis(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
