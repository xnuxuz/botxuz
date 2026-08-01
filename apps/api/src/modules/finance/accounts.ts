import type { Account } from '@xnuxuz/db';
import { isUniqueViolation } from '@xnuxuz/db';
import type { z } from 'zod';
import { db } from '../../db.js';
import { AppError } from '../../http/errors.js';
import type { createAccountSchema, updateAccountSchema } from './schemas.js';
import { createTransaction } from './transactions.js';

export async function listAccounts(userId: string, includeArchived: boolean): Promise<Account[]> {
  return db.account.findMany({
    where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ archivedAt: 'asc' }, { name: 'asc' }],
  });
}

export async function createAccount(
  userId: string,
  input: z.infer<typeof createAccountSchema>,
): Promise<Account> {
  let account: Account;
  try {
    account = await db.account.create({
      data: { userId, name: input.name, type: input.type },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw AppError.conflict(`Akun "${input.name}" sudah ada`);
    throw error;
  }

  // Saldo awal masuk sebagai transaksi, bukan langsung ke balance_cached —
  // kalau tidak, ledger dan saldo tidak akan pernah cocok saat direkonsiliasi.
  if (input.openingBalance > 0) {
    await createTransaction(userId, {
      accountId: account.id,
      type: 'income',
      amountInt: input.openingBalance,
      note: 'Saldo awal',
    });
    return getAccount(userId, account.id);
  }

  return account;
}

export async function getAccount(userId: string, id: string): Promise<Account> {
  const account = await db.account.findFirst({ where: { id, userId } });
  if (!account) throw AppError.notFound('Akun tidak ditemukan');
  return account;
}

export async function updateAccount(
  userId: string,
  id: string,
  input: z.infer<typeof updateAccountSchema>,
): Promise<Account> {
  const result = await db.account.updateMany({
    where: { id, userId },
    data: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.archived === undefined ? {} : { archivedAt: input.archived ? new Date() : null }),
    },
  });

  if (result.count === 0) throw AppError.notFound('Akun tidak ditemukan');
  return getAccount(userId, id);
}

/**
 * Rekonsiliasi: hitung ulang balance_cached dari ledger. Cache hanya optimisasi,
 * jadi harus selalu bisa dibangun ulang kalau ada yang meleset.
 */
export async function recalculateBalance(userId: string, accountId: string): Promise<Account> {
  await getAccount(userId, accountId);

  const [incoming, outgoing, transfersIn] = await Promise.all([
    db.transaction.aggregate({
      where: { userId, accountId, type: 'income', deletedAt: null },
      _sum: { amountInt: true },
    }),
    db.transaction.aggregate({
      where: { userId, accountId, type: { in: ['expense', 'transfer'] }, deletedAt: null },
      _sum: { amountInt: true },
    }),
    db.transaction.aggregate({
      where: { userId, transferAccountId: accountId, type: 'transfer', deletedAt: null },
      _sum: { amountInt: true },
    }),
  ]);

  const balance =
    (incoming._sum.amountInt ?? 0) -
    (outgoing._sum.amountInt ?? 0) +
    (transfersIn._sum.amountInt ?? 0);

  return db.account.update({ where: { id: accountId }, data: { balanceCached: balance } });
}
