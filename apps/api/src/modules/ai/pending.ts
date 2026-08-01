import { randomUUID } from 'node:crypto';
import { redis } from '../../config/redis.js';
import { AppError } from '../../http/errors.js';

/**
 * Aksi write dari AI harus dikonfirmasi user dulu (§3.5). Aksi menunggu di
 * Redis, bukan MySQL: umurnya pendek dan kalau hilang saat restart, konsekuensi
 * terburuknya user mengetik ulang — jauh lebih baik daripada eksekusi tak sengaja.
 */
export const PENDING_TTL_SEC = 15 * 60;

const key = (userId: string, id: string) => `ai-pending:${userId}:${id}`;

export type PendingAction = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  /** Teks asli user — dipakai kalau user memilih "edit". */
  sourceText: string;
  preview: string;
  createdAt: string;
};

export async function savePending(
  userId: string,
  action: Omit<PendingAction, 'id' | 'createdAt'>,
): Promise<PendingAction> {
  const pending: PendingAction = {
    ...action,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };

  await redis.set(key(userId, pending.id), JSON.stringify(pending), 'EX', PENDING_TTL_SEC);
  return pending;
}

/** Mengambil sekaligus menghapus: satu konfirmasi hanya boleh dieksekusi sekali. */
export async function takePending(userId: string, id: string): Promise<PendingAction> {
  const raw = await redis.getdel(key(userId, id));
  if (!raw) throw AppError.notFound('Aksi sudah kedaluwarsa atau sudah diproses');
  return JSON.parse(raw) as PendingAction;
}

export async function dropPending(userId: string, id: string): Promise<boolean> {
  return (await redis.del(key(userId, id))) > 0;
}
