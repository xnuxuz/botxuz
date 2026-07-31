import { pingDb } from '@xnuxuz/db';
import { Router } from 'express';
import { env } from '../config/env.js';
import { pingRedis } from '../config/redis.js';
import { db } from '../db.js';

export const healthRouter: Router = Router();

const startedAt = Date.now();

/** Liveness — dipakai Docker healthcheck, tidak menyentuh dependency. */
healthRouter.get('/health', (_req, res) => {
  res.json({
    ok: true,
    data: { status: 'up', uptimeSec: Math.floor((Date.now() - startedAt) / 1000) },
  });
});

/** Readiness — dipakai UptimeRobot; 503 kalau dependency mati (REQUIREMENT §5.3). */
healthRouter.get('/health/ready', async (_req, res) => {
  const [database, cache] = await Promise.all([pingDb(db), pingRedis()]);
  const ready = database && cache;

  res.status(ready ? 200 : 503).json({
    ok: ready,
    data: {
      status: ready ? 'ready' : 'degraded',
      env: env.NODE_ENV,
      checks: { database, redis: cache },
    },
  });
});
