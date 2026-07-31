import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { REFRESH_TOKEN_TTL_SEC } from '@xnuxuz/shared';
import { redis } from '../../config/redis.js';

/**
 * Sesi login hidup di Redis, bukan MySQL (REQUIREMENT §3.1): TTL-nya otomatis,
 * dan logout tidak menyisakan baris mati di database.
 *
 *   session:<userId>:<sessionId>  hash   — data sesi, TTL = umur refresh token
 *   sessions:<userId>             set    — indeks untuk device management
 *   session-owner:<sessionId>     string — refresh token opaque tidak memuat
 *                                          userId, jadi pemiliknya dipetakan di sini
 */
const sessionKey = (userId: string, sessionId: string) => `session:${userId}:${sessionId}`;
const indexKey = (userId: string) => `sessions:${userId}`;
const ownerKey = (sessionId: string) => `session-owner:${sessionId}`;

export async function resolveSessionOwner(sessionId: string): Promise<string | null> {
  return redis.get(ownerKey(sessionId));
}

export type SessionInfo = {
  id: string;
  device: string;
  ip: string;
  createdAt: string;
  lastUsedAt: string;
  current?: boolean;
};

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** Perbandingan waktu-konstan supaya panjang prefix yang cocok tidak bocor. */
function secretMatches(stored: string, candidate: string): boolean {
  const a = Buffer.from(stored, 'hex');
  const b = Buffer.from(hashSecret(candidate), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createSession(
  userId: string,
  secret: string,
  meta: { device: string; ip: string },
): Promise<string> {
  const sessionId = randomUUID();
  const now = new Date().toISOString();

  await redis
    .multi()
    .hset(sessionKey(userId, sessionId), {
      secretHash: hashSecret(secret),
      device: meta.device,
      ip: meta.ip,
      createdAt: now,
      lastUsedAt: now,
    })
    .expire(sessionKey(userId, sessionId), REFRESH_TOKEN_TTL_SEC)
    .sadd(indexKey(userId), sessionId)
    .expire(indexKey(userId), REFRESH_TOKEN_TTL_SEC)
    .set(ownerKey(sessionId), userId, 'EX', REFRESH_TOKEN_TTL_SEC)
    .exec();

  return sessionId;
}

export type RotateResult =
  | { status: 'ok' }
  | { status: 'unknown' }
  /** Secret lama dipakai lagi — indikasi token dicuri, semua sesi user dicabut. */
  | { status: 'reused' };

export async function rotateSession(
  userId: string,
  sessionId: string,
  presentedSecret: string,
  nextSecret: string,
  meta: { device: string; ip: string },
): Promise<RotateResult> {
  const key = sessionKey(userId, sessionId);
  const stored = await redis.hget(key, 'secretHash');

  if (!stored) return { status: 'unknown' };

  if (!secretMatches(stored, presentedSecret)) {
    await revokeAllSessions(userId);
    return { status: 'reused' };
  }

  await redis
    .multi()
    .hset(key, {
      secretHash: hashSecret(nextSecret),
      device: meta.device,
      ip: meta.ip,
      lastUsedAt: new Date().toISOString(),
    })
    .expire(key, REFRESH_TOKEN_TTL_SEC)
    .expire(indexKey(userId), REFRESH_TOKEN_TTL_SEC)
    .expire(ownerKey(sessionId), REFRESH_TOKEN_TTL_SEC)
    .exec();

  return { status: 'ok' };
}

export async function isSessionActive(userId: string, sessionId: string): Promise<boolean> {
  return (await redis.exists(sessionKey(userId, sessionId))) === 1;
}

export async function revokeSession(userId: string, sessionId: string): Promise<boolean> {
  const results = (await redis
    .multi()
    .del(sessionKey(userId, sessionId))
    .srem(indexKey(userId), sessionId)
    .del(ownerKey(sessionId))
    .exec()) as [Error | null, unknown][] | null;

  return Number(results?.[0]?.[1] ?? 0) > 0;
}

export async function revokeAllSessions(userId: string): Promise<void> {
  const ids = await redis.smembers(indexKey(userId));
  const pipeline = redis.multi();
  for (const id of ids) {
    pipeline.del(sessionKey(userId, id));
    pipeline.del(ownerKey(id));
  }
  pipeline.del(indexKey(userId));
  await pipeline.exec();
}

/** Daftar device aktif. Anggota yang hash-nya sudah kedaluwarsa ikut dibersihkan. */
export async function listSessions(userId: string, currentId?: string): Promise<SessionInfo[]> {
  const ids = await redis.smembers(indexKey(userId));
  if (ids.length === 0) return [];

  const pipeline = redis.multi();
  for (const id of ids) pipeline.hgetall(sessionKey(userId, id));
  const results = (await pipeline.exec()) ?? [];

  const sessions: SessionInfo[] = [];
  const stale: string[] = [];

  ids.forEach((id, index) => {
    const entry = results[index]?.[1] as Record<string, string> | undefined;
    if (!entry || Object.keys(entry).length === 0) {
      stale.push(id);
      return;
    }
    sessions.push({
      id,
      device: entry.device ?? 'unknown',
      ip: entry.ip ?? '',
      createdAt: entry.createdAt ?? '',
      lastUsedAt: entry.lastUsedAt ?? '',
      current: id === currentId,
    });
  });

  if (stale.length > 0) await redis.srem(indexKey(userId), ...stale);

  return sessions.sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
}
