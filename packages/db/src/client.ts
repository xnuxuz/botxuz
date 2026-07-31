import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client.js';
import { toPoolConfig } from './url.js';

export type Db = PrismaClient;

let instance: PrismaClient | null = null;

/**
 * Satu PrismaClient per proses. Prisma 7 memakai driver adapter, jadi pool
 * MySQL dikelola di sini — bukan di dalam engine Rust seperti versi lama.
 */
export function createDb(databaseUrl: string): PrismaClient {
  const adapter = new PrismaMariaDb(toPoolConfig(databaseUrl));
  return new PrismaClient({ adapter });
}

export function getDb(databaseUrl: string): PrismaClient {
  instance ??= createDb(databaseUrl);
  return instance;
}

export async function disconnectDb(): Promise<void> {
  if (instance) {
    await instance.$disconnect();
    instance = null;
  }
}

/** Dipakai health check — murah, tidak menyentuh tabel apa pun. */
export async function pingDb(db: PrismaClient): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
