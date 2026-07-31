import { ERROR_CODES } from '@xnuxuz/shared';
import rateLimit, { type Store } from 'express-rate-limit';
import { type RedisReply, RedisStore } from 'rate-limit-redis';
import { redis } from '../config/redis.js';

/** Store bersama supaya limit tetap berlaku walau API discale lebih dari satu proses. */
function store(prefix: string): Store {
  return new RedisStore({
    prefix,
    // ioredis.call() menuntut tuple [command, ...args], bukan string[] biasa.
    sendCommand: (...args: string[]) =>
      redis.call(...(args as [string, ...string[]])) as Promise<RedisReply>,
  });
}

const tooMany = {
  ok: false as const,
  error: { code: ERROR_CODES.RATE_LIMITED, message: 'Terlalu banyak request, coba lagi nanti' },
};

export const globalRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
  store: store('rl:global:'),
});

/** Endpoint auth jauh lebih ketat — target utama brute force. */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
  skipSuccessfulRequests: true,
  store: store('rl:auth:'),
});
