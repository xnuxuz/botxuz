import type { Transaction } from '@xnuxuz/db';
import { isUniqueViolation } from '@xnuxuz/db';
import { db } from '../../db.js';
import { AppError } from '../../http/errors.js';
import { assertCategoryOwned } from '../category/ownership.js';
import type { CreateTransactionInput, ListTransactionQuery } from './schemas.js';

/**
 * Efek sebuah transaksi terhadap saldo tiap akun. Dipakai dua arah: dengan
 * `sign = 1` saat dibuat, `sign = -1` saat dihapus/diubah — jadi pembalikan
 * saldo tidak pernah ditulis ulang secara manual dan tidak bisa beda rumus.
 */
function balanceDeltas(
  txn: Pick<Transaction, 'type' | 'amountInt' | 'accountId' | 'transferAccountId'>,
  sign: 1 | -1,
): { accountId: string; delta: number }[] {
  const amount = txn.amountInt * sign;

  switch (txn.type) {
    case 'income':
      return [{ accountId: txn.accountId, delta: amount }];
    case 'expense':
      return [{ accountId: txn.accountId, delta: -amount }];
    case 'transfer':
      return txn.transferAccountId
        ? [
            { accountId: txn.accountId, delta: -amount },
            { accountId: txn.transferAccountId, delta: amount },
          ]
        : [{ accountId: txn.accountId, delta: -amount }];
  }
}

async function assertAccountsOwned(userId: string, ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const found = await db.account.count({ where: { userId, id: { in: unique } } });
  if (found !== unique.length) throw AppError.badRequest('Akun tidak ditemukan');
}

export async function createTransaction(
  userId: string,
  input: CreateTransactionInput,
): Promise<Transaction> {
  await assertAccountsOwned(userId, [input.accountId, input.transferAccountId]);
  if (input.categoryId) await assertCategoryOwned(userId, input.categoryId, 'finance');

  const data = {
    userId,
    accountId: input.accountId,
    type: input.type,
    amountInt: input.amountInt,
    categoryId: input.categoryId ?? null,
    note: input.note ?? null,
    occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
    transferAccountId: input.type === 'transfer' ? (input.transferAccountId ?? null) : null,
    clientGeneratedId: input.clientGeneratedId ?? null,
  };

  try {
    // Satu transaksi DB: ledger dan saldo tidak boleh pernah berbeda, bahkan
    // kalau proses mati di tengah jalan.
    return await db.$transaction(async (tx) => {
      const created = await tx.transaction.create({ data });

      for (const { accountId, delta } of balanceDeltas(created, 1)) {
        await tx.account.update({
          where: { id: accountId },
          data: { balanceCached: { increment: delta } },
        });
      }

      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error) && input.clientGeneratedId) {
      // Retry dari client offline: kembalikan baris yang sudah ada, bukan error.
      const existing = await db.transaction.findFirst({
        where: { userId, clientGeneratedId: input.clientGeneratedId },
      });
      if (existing) return existing;
    }
    throw error;
  }
}

export async function listTransactions(
  userId: string,
  query: ListTransactionQuery,
): Promise<Transaction[]> {
  return db.transaction.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(query.accountId
        ? {
            OR: [{ accountId: query.accountId }, { transferAccountId: query.accountId }],
          }
        : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.q ? { note: { contains: query.q } } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    take: query.limit,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
}

export async function getTransaction(userId: string, id: string): Promise<Transaction> {
  const txn = await db.transaction.findFirst({ where: { id, userId, deletedAt: null } });
  if (!txn) throw AppError.notFound('Transaksi tidak ditemukan');
  return txn;
}

export async function updateTransaction(
  userId: string,
  id: string,
  input: {
    amountInt?: number;
    categoryId?: string | null;
    note?: string | null;
    occurredAt?: string;
  },
): Promise<Transaction> {
  const existing = await getTransaction(userId, id);
  if (input.categoryId) await assertCategoryOwned(userId, input.categoryId, 'finance');

  return db.$transaction(async (tx) => {
    if (input.amountInt !== undefined && input.amountInt !== existing.amountInt) {
      // Efek lama dibatalkan penuh lalu efek baru diterapkan — lebih aman
      // daripada menghitung selisih, yang gampang salah tanda pada transfer.
      for (const { accountId, delta } of balanceDeltas(existing, -1)) {
        await tx.account.update({
          where: { id: accountId },
          data: { balanceCached: { increment: delta } },
        });
      }
      for (const { accountId, delta } of balanceDeltas(
        { ...existing, amountInt: input.amountInt },
        1,
      )) {
        await tx.account.update({
          where: { id: accountId },
          data: { balanceCached: { increment: delta } },
        });
      }
    }

    return tx.transaction.update({
      where: { id },
      data: {
        ...(input.amountInt === undefined ? {} : { amountInt: input.amountInt }),
        ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId ?? null }),
        ...(input.note === undefined ? {} : { note: input.note ?? null }),
        ...(input.occurredAt === undefined ? {} : { occurredAt: new Date(input.occurredAt) }),
      },
    });
  });
}

/**
 * Soft delete (§3.4): data finance tidak pernah benar-benar dihapus, tapi
 * efeknya terhadap saldo dibalik seketika.
 */
export async function deleteTransaction(userId: string, id: string): Promise<void> {
  const existing = await getTransaction(userId, id);

  await db.$transaction(async (tx) => {
    for (const { accountId, delta } of balanceDeltas(existing, -1)) {
      await tx.account.update({
        where: { id: accountId },
        data: { balanceCached: { increment: delta } },
      });
    }

    await tx.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
  });
}

export async function restoreTransaction(userId: string, id: string): Promise<Transaction> {
  const existing = await db.transaction.findFirst({
    where: { id, userId, deletedAt: { not: null } },
  });
  if (!existing) throw AppError.notFound('Transaksi terhapus tidak ditemukan');

  return db.$transaction(async (tx) => {
    for (const { accountId, delta } of balanceDeltas(existing, 1)) {
      await tx.account.update({
        where: { id: accountId },
        data: { balanceCached: { increment: delta } },
      });
    }
    return tx.transaction.update({ where: { id }, data: { deletedAt: null } });
  });
}

export { balanceDeltas };
