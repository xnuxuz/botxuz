import { baseEnvSchema, loadRootEnv, parseEnv } from '@xnuxuz/shared';
import { pino } from 'pino';
import { z } from 'zod';

loadRootEnv();

const workerEnvSchema = baseEnvSchema.extend({
  /** Worker memanggil API, bukan menulis DB langsung untuk logic bisnis. */
  API_BASE_URL: z.url().default('http://localhost:3011'),

  /** Kosong = bot tidak dijalankan; worker tetap memproses queue. */
  TELEGRAM_BOT_TOKEN: z.string().optional(),

  /** Jumlah job paralel per worker. Kecil saja — VPS-nya 4 vCPU. */
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(4),

  /** SMTP opsional: kalau kosong, adapter email dianggap tidak terkonfigurasi. */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export const env: WorkerEnv = parseEnv(workerEnvSchema);

export const logger = pino({
  level: env.LOG_LEVEL,
  name: 'worker',
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
});
