import { pino } from 'pino';
import { env } from './env.js';

/**
 * pino dengan pretty printing hanya saat development; di produksi tetap JSON
 * supaya gampang di-rotate dan di-grep.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'password', '*.passwordHash'],
    remove: true,
  },
});
