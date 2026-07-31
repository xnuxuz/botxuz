import { baseEnvSchema, loadRootEnv, parseEnv } from '@xnuxuz/shared';
import { z } from 'zod';

loadRootEnv();

const apiEnvSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3011),
  /** Origin yang boleh akses API — web dashboard dan mobile dev server. */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3010')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  /** Opsional di fase 0 — modul AI baru aktif di fase 2. */
  GROQ_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export const env: ApiEnv = parseEnv(apiEnvSchema);
