import type { RecurringTransaction } from '@xnuxuz/db';
import { db } from '../../db.js';
import { AppError } from '../../http/errors.js';
import { assertValidRrule, nextOccurrence } from '../../lib/recurrence.js';
import { assertCategoryOwned } from '../category/ownership.js';
import type { CreateRecurringInput } from './schemas.js';
import { createTransaction } from './transactions.js';

type Template = { type: 'income' | 'expense'; amountInt: number; note: string | null };

function templateOf(value: unknown): Template | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (raw.type !== 'income' && raw.type !== 'expense') return null;
  if (typeof raw.amountInt !== 'number' || !Number.isInteger(raw.amountInt)) return null;
  return {
    type: raw.type,
    amountInt: raw.amountInt,
    note: typeof raw.note === 'string' ? raw.note : null,
  };
}

export async function createRecurring(
  userId: string,
  input: CreateRecurringInput,
): Promise<RecurringTransaction> {
  const account = await db.account.findFirst({ where: { id: input.accountId, userId } });
  if (!account) throw AppError.badRequest('Akun tidak ditemukan');
  if (input.categoryId) await assertCategoryOwned(userId, input.categoryId, 'finance');

  const startAt = new Date(input.startAt);
  assertValidRrule(input.rrule, startAt);

  // Kemunculan pertama boleh tepat di startAt, jadi pencarian dimulai sedetik sebelumnya.
  const nextRunAt =
    nextOccurrence(input.rrule, startAt, new Date(startAt.getTime() - 1)) ?? startAt;

  return db.recurringTransaction.create({
    data: {
      userId,
      accountId: input.accountId,
      categoryId: input.categoryId ?? null,
      templateJson: {
        type: input.type,
        amountInt: input.amountInt,
        note: input.note ?? null,
      },
      rrule: input.rrule,
      nextRunAt,
    },
  });
}

export async function listRecurring(userId: string): Promise<RecurringTransaction[]> {
  return db.recurringTransaction.findMany({ where: { userId }, orderBy: { nextRunAt: 'asc' } });
}

export async function setRecurringActive(
  userId: string,
  id: string,
  active: boolean,
): Promise<RecurringTransaction> {
  const result = await db.recurringTransaction.updateMany({
    where: { id, userId },
    data: { active },
  });
  if (result.count === 0) throw AppError.notFound('Recurring tidak ditemukan');

  const row = await db.recurringTransaction.findUnique({ where: { id } });
  if (!row) throw AppError.notFound('Recurring tidak ditemukan');
  return row;
}

export async function deleteRecurring(userId: string, id: string): Promise<void> {
  const result = await db.recurringTransaction.deleteMany({ where: { id, userId } });
  if (result.count === 0) throw AppError.notFound('Recurring tidak ditemukan');
}

/**
 * Menjalankan semua recurring yang sudah jatuh tempo (§3.4). Dipanggil job
 * harian. Kalau worker mati beberapa hari, loop `while` mengejar ketertinggalan
 * satu per satu supaya tidak ada tagihan yang terlewat.
 */
export async function runDueRecurring(now = new Date()): Promise<{ created: number }> {
  const due = await db.recurringTransaction.findMany({
    where: { active: true, nextRunAt: { lte: now } },
  });

  let created = 0;

  for (const row of due) {
    const template = templateOf(row.templateJson);
    if (!template) continue;

    let cursor = row.nextRunAt;

    // Batas 60 iterasi: melindungi dari RRULE rapat (mis. harian) yang tertinggal lama.
    for (let guard = 0; guard < 60 && cursor <= now; guard += 1) {
      await createTransaction(row.userId, {
        accountId: row.accountId,
        type: template.type,
        amountInt: template.amountInt,
        categoryId: row.categoryId,
        note: template.note,
        occurredAt: cursor.toISOString(),
        // Idempoten: rerun job yang sama tidak menghasilkan transaksi ganda.
        // Epoch detik, bukan ISO — kolomnya VarChar(64) dan id-nya sudah 36 karakter.
        clientGeneratedId: `rec-${row.id}-${Math.floor(cursor.getTime() / 1000)}`,
      });
      created += 1;

      const next = nextOccurrence(row.rrule, row.nextRunAt, cursor);
      if (!next) {
        await db.recurringTransaction.update({
          where: { id: row.id },
          data: { active: false },
        });
        cursor = new Date(now.getTime() + 1);
        break;
      }
      cursor = next;
    }

    if (cursor > now) {
      await db.recurringTransaction.update({
        where: { id: row.id },
        data: { nextRunAt: cursor },
      });
    }
  }

  return { created };
}
