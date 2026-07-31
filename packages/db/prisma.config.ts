import { fileURLToPath } from 'node:url';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';
import { toPoolConfig } from './src/url.ts';

// .env tunggal ada di root repo, bukan per package.
loadEnv({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

/**
 * Prisma 7 memindahkan connection URL dari schema.prisma ke sini. Adapter yang
 * sama dipakai CLI (migrate, studio) dan runtime client.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  // Schema engine (migrate/db push) butuh URL mentah, terpisah dari adapter runtime.
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
  adapter: () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL belum diset — cek .env di root repo');
    return Promise.resolve(new PrismaMariaDb(toPoolConfig(url, 2)));
  },
});
