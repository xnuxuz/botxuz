import { API_PREFIX } from '@xnuxuz/shared';
import cors from 'cors';
import express, { type Express, Router } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './http/errors.js';
import { healthRouter } from './http/health.js';
import { globalRateLimit } from './http/rate-limit.js';

export function createApp(): Express {
  const app = express();

  // Di belakang Caddy — percaya satu hop proxy supaya rate limit baca IP asli.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger }));

  // Health check di luar prefix versi dan di luar rate limit — monitor
  // eksternal tidak boleh ikut kena limit.
  app.use(healthRouter);

  app.use(globalRateLimit);

  const v1 = Router();
  // Modul (auth, schedule, grinding, finance, ai) didaftarkan di sini per fase.
  v1.get('/', (_req, res) => {
    res.json({ ok: true, data: { version: 'v1', modules: [] } });
  });
  app.use(API_PREFIX, v1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
