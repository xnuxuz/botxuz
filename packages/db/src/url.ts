import type { PoolConfig } from 'mariadb';

/**
 * DATABASE_URL memakai skema `mysql://` (konvensi Prisma), tapi connector
 * mariadb hanya mem-parse skema `mariadb://`. Jadi URL diurai sendiri di sini —
 * sekalian tempat menyetel batas pool, yang penting di VPS 4GB.
 */
export function toPoolConfig(databaseUrl: string, connectionLimit = 10): PoolConfig {
  const url = new URL(databaseUrl);

  if (url.protocol !== 'mysql:' && url.protocol !== 'mariadb:') {
    throw new Error(`Skema DATABASE_URL tidak didukung: ${url.protocol}`);
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) {
    throw new Error('DATABASE_URL tidak menyebutkan nama database');
  }

  return {
    host: decodeURIComponent(url.hostname),
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    connectionLimit,
    // Timestamp disimpan & dibaca sebagai UTC (REQUIREMENT §5.2).
    timezone: 'Z',
  };
}
