import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/**
 * Repo ini memakai satu .env di root workspace, bukan satu per app. dotenv
 * hanya melihat cwd, jadi root dicari dengan menelusuri ke atas sampai ketemu
 * pnpm-workspace.yaml. Dipanggil sekali di awal tiap entrypoint.
 */
export function loadRootEnv(startDir: string = process.cwd()): string | null {
  let current = resolve(startDir);

  while (true) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) {
      const envPath = join(current, '.env');
      if (existsSync(envPath)) {
        loadDotenv({ path: envPath, quiet: true });
        return envPath;
      }
      return null;
    }

    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Skema env dipakai bersama api & worker. Proses gagal cepat saat boot
 * kalau ada yang kurang — lebih baik crash di startup daripada jam 3 pagi.
 */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  TZ: z.string().default('UTC'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL wajib diisi'),
  REDIS_URL: z.string().min(1, 'REDIS_URL wajib diisi'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET minimal 32 karakter'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET minimal 32 karakter'),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;

/** Parse env dengan pesan error yang kebaca manusia. */
export function parseEnv<T extends z.ZodType>(
  schema: T,
  source: unknown = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Konfigurasi environment tidak valid:\n${issues}`);
  }

  return result.data;
}
