import type { WorkSession } from '@xnuxuz/db';
import { db } from '../../db.js';
import { AppError } from '../../http/errors.js';
import { assertCategoryOwned } from '../category/ownership.js';

/** Sesi lebih panjang dari ini hampir pasti timer yang lupa distop. */
const MAX_SESSION_MIN = 16 * 60;

function minutesBetween(from: Date, to: Date): number {
  return Math.max(Math.round((to.getTime() - from.getTime()) / 60_000), 0);
}

export type StartInput = {
  taskId?: string | null;
  categoryId?: string | null;
  note?: string | null;
};

/**
 * Timer: hanya boleh ada satu sesi terbuka per user. Kalau tidak, "stop" jadi
 * ambigu dan total jam bisa dihitung dobel.
 */
export async function startSession(userId: string, input: StartInput): Promise<WorkSession> {
  const open = await db.workSession.findFirst({ where: { userId, endedAt: null } });
  if (open) throw AppError.conflict('Masih ada sesi berjalan — stop dulu sebelum mulai yang baru');

  const categoryId = await resolveCategory(userId, input);

  return db.workSession.create({
    data: {
      userId,
      taskId: input.taskId ?? null,
      categoryId,
      startedAt: new Date(),
      note: input.note ?? null,
    },
  });
}

export async function stopSession(userId: string, note?: string | null): Promise<WorkSession> {
  const open = await db.workSession.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: 'desc' },
  });
  if (!open) throw AppError.notFound('Tidak ada sesi yang sedang berjalan');

  const endedAt = new Date();

  return db.workSession.update({
    where: { id: open.id },
    data: {
      endedAt,
      durationMin: minutesBetween(open.startedAt, endedAt),
      ...(note === undefined ? {} : { note }),
    },
  });
}

export async function getRunningSession(userId: string): Promise<WorkSession | null> {
  return db.workSession.findFirst({ where: { userId, endedAt: null } });
}

export type ManualInput = {
  taskId?: string | null;
  categoryId?: string | null;
  startedAt: string;
  endedAt: string;
  note?: string | null;
};

/** Entri manual untuk sesi yang lupa ditimer (§3.3). */
export async function logSession(userId: string, input: ManualInput): Promise<WorkSession> {
  const startedAt = new Date(input.startedAt);
  const endedAt = new Date(input.endedAt);

  if (endedAt <= startedAt) throw AppError.badRequest('endedAt harus setelah startedAt');

  const durationMin = minutesBetween(startedAt, endedAt);
  if (durationMin > MAX_SESSION_MIN) {
    throw AppError.badRequest(`Durasi sesi maksimal ${MAX_SESSION_MIN / 60} jam`);
  }

  const categoryId = await resolveCategory(userId, input);

  return db.workSession.create({
    data: {
      userId,
      taskId: input.taskId ?? null,
      categoryId,
      startedAt,
      endedAt,
      durationMin,
      note: input.note ?? null,
    },
  });
}

export async function deleteSession(userId: string, id: string): Promise<void> {
  const result = await db.workSession.deleteMany({ where: { id, userId } });
  if (result.count === 0) throw AppError.notFound('Sesi tidak ditemukan');
}

export async function listSessions(
  userId: string,
  query: { from?: string; to?: string; categoryId?: string; limit: number },
): Promise<WorkSession[]> {
  return db.workSession.findMany({
    where: {
      userId,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.from || query.to
        ? {
            startedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    },
    orderBy: { startedAt: 'desc' },
    take: query.limit,
  });
}

/**
 * Kategori diwarisi dari task kalau tidak disebut eksplisit — user yang menimer
 * sebuah task tidak perlu memilih kategori dua kali.
 */
async function resolveCategory(
  userId: string,
  input: { taskId?: string | null; categoryId?: string | null },
): Promise<string | null> {
  if (input.categoryId) {
    await assertCategoryOwned(userId, input.categoryId, 'task');
    return input.categoryId;
  }

  if (!input.taskId) return null;

  const task = await db.task.findFirst({
    where: { id: input.taskId, userId },
    select: { categoryId: true },
  });
  if (!task) throw AppError.badRequest('Task tidak ditemukan');

  return task.categoryId;
}
