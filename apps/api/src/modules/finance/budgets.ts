import { BUDGET_ALERT_THRESHOLDS, formatRupiah, NOTIF_TYPES, toJobId } from '@xnuxuz/shared';
import { db } from '../../db.js';
import { getQueue, QUEUES } from '../../queue.js';
import { assertCategoryOwned } from '../category/ownership.js';

/** Rentang UTC sebuah bulan yyyymm. */
export function monthRange(month: number): { start: Date; end: Date } {
  const year = Math.floor(month / 100);
  const index = (month % 100) - 1;
  return { start: new Date(Date.UTC(year, index, 1)), end: new Date(Date.UTC(year, index + 1, 1)) };
}

export function currentMonth(now = new Date()): number {
  return now.getUTCFullYear() * 100 + now.getUTCMonth() + 1;
}

export type BudgetStatus = {
  categoryId: string;
  categoryName: string | null;
  month: number;
  limitInt: number;
  spentInt: number;
  remainingInt: number;
  ratio: number;
};

export async function getBudgetStatus(userId: string, month: number): Promise<BudgetStatus[]> {
  const budgets = await db.budget.findMany({
    where: { userId, month },
    include: { category: { select: { name: true } } },
  });
  if (budgets.length === 0) return [];

  const { start, end } = monthRange(month);

  const spending = await db.transaction.groupBy({
    by: ['categoryId'],
    where: {
      userId,
      type: 'expense',
      deletedAt: null,
      categoryId: { in: budgets.map((budget) => budget.categoryId) },
      occurredAt: { gte: start, lt: end },
    },
    _sum: { amountInt: true },
  });

  const spentOf = new Map(spending.map((row) => [row.categoryId, row._sum.amountInt ?? 0]));

  return budgets.map((budget) => {
    const spentInt = spentOf.get(budget.categoryId) ?? 0;
    return {
      categoryId: budget.categoryId,
      categoryName: budget.category.name,
      month: budget.month,
      limitInt: budget.limitInt,
      spentInt,
      remainingInt: budget.limitInt - spentInt,
      ratio: budget.limitInt === 0 ? 0 : spentInt / budget.limitInt,
    };
  });
}

export async function upsertBudget(
  userId: string,
  input: { categoryId: string; month: number; limitInt: number },
) {
  await assertCategoryOwned(userId, input.categoryId, 'finance');

  return db.budget.upsert({
    where: {
      userId_categoryId_month: {
        userId,
        categoryId: input.categoryId,
        month: input.month,
      },
    },
    create: { userId, ...input },
    // Limit berubah = ambang alert dihitung ulang dari nol.
    update: { limitInt: input.limitInt, alertedMask: 0 },
  });
}

/**
 * Ambang yang sudah dikirim disimpan sebagai bitmask di baris budget, bukan di
 * Redis: alert 80% harus tetap "sudah pernah" walau Redis di-flush (§3.4).
 */
function maskFor(index: number): number {
  return 1 << index;
}

/**
 * Dipanggil setelah transaksi pengeluaran dan oleh job harian. Idempoten:
 * satu ambang hanya menghasilkan satu notifikasi seumur bulan itu.
 */
export async function checkBudgetAlerts(userId: string, month = currentMonth()): Promise<number> {
  const statuses = await getBudgetStatus(userId, month);
  if (statuses.length === 0) return 0;

  const budgets = await db.budget.findMany({
    where: { userId, month },
    select: { id: true, categoryId: true, alertedMask: true },
  });
  const budgetOf = new Map(budgets.map((budget) => [budget.categoryId, budget]));

  let fired = 0;

  for (const status of statuses) {
    const budget = budgetOf.get(status.categoryId);
    if (!budget) continue;

    let mask = budget.alertedMask;

    for (const [index, threshold] of BUDGET_ALERT_THRESHOLDS.entries()) {
      const bit = maskFor(index);
      if (status.ratio < threshold || (mask & bit) !== 0) continue;

      const percent = Math.round(threshold * 100);
      await getQueue(QUEUES.notification).add(
        'budget-alert',
        {
          userId,
          notifType: NOTIF_TYPES.budgetAlert,
          priority: threshold >= 1 ? 'high' : 'normal',
          payload: {
            idempotencyKey: `budget-${budget.id}-${percent}`,
            title: threshold >= 1 ? '🚨 Budget habis' : '⚠️ Budget 80%',
            body:
              `${status.categoryName ?? 'Kategori'}: ${formatRupiah(status.spentInt)} ` +
              `dari ${formatRupiah(status.limitInt)}.\n` +
              (status.remainingInt >= 0
                ? `Sisa ${formatRupiah(status.remainingInt)}.`
                : `Lewat ${formatRupiah(-status.remainingInt)}.`),
          },
        },
        { jobId: toJobId('notif', 'budget', budget.id, percent) },
      );

      mask |= bit;
      fired += 1;
    }

    if (mask !== budget.alertedMask) {
      await db.budget.update({ where: { id: budget.id }, data: { alertedMask: mask } });
    }
  }

  return fired;
}
