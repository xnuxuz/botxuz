import { db } from '../../db.js';
import { monthRange } from './budgets.js';

export type MonthlyCashflow = {
  month: number;
  incomeInt: number;
  expenseInt: number;
  netInt: number;
};

/**
 * Transfer sengaja tidak dihitung sebagai income maupun expense: memindahkan
 * uang antar-akun sendiri bukan arus kas masuk atau keluar.
 */
export async function cashflow(userId: string, months: number[]): Promise<MonthlyCashflow[]> {
  const result: MonthlyCashflow[] = [];

  for (const month of months) {
    const { start, end } = monthRange(month);

    const rows = await db.transaction.groupBy({
      by: ['type'],
      where: {
        userId,
        deletedAt: null,
        type: { in: ['income', 'expense'] },
        occurredAt: { gte: start, lt: end },
      },
      _sum: { amountInt: true },
    });

    const sumOf = (type: string) => rows.find((row) => row.type === type)?._sum.amountInt ?? 0;

    const incomeInt = sumOf('income');
    const expenseInt = sumOf('expense');
    result.push({ month, incomeInt, expenseInt, netInt: incomeInt - expenseInt });
  }

  return result;
}

/** Deret bulan mundur dari `month`, terbaru terakhir — siap dipakai chart trend. */
export function lastMonths(month: number, count: number): number[] {
  const months: number[] = [];
  let year = Math.floor(month / 100);
  let index = month % 100;

  for (let i = 0; i < count; i += 1) {
    months.unshift(year * 100 + index);
    index -= 1;
    if (index === 0) {
      index = 12;
      year -= 1;
    }
  }

  return months;
}

export type CategoryBreakdown = {
  categoryId: string | null;
  name: string | null;
  amountInt: number;
  share: number;
};

export async function breakdown(
  userId: string,
  month: number,
  type: 'income' | 'expense' = 'expense',
): Promise<CategoryBreakdown[]> {
  const { start, end } = monthRange(month);

  const rows = await db.transaction.groupBy({
    by: ['categoryId'],
    where: { userId, deletedAt: null, type, occurredAt: { gte: start, lt: end } },
    _sum: { amountInt: true },
  });

  const total = rows.reduce((sum, row) => sum + (row._sum.amountInt ?? 0), 0);

  const categories = await db.category.findMany({
    where: {
      userId,
      id: { in: rows.map((row) => row.categoryId).filter((id): id is string => id !== null) },
    },
    select: { id: true, name: true },
  });
  const nameOf = new Map(categories.map((category) => [category.id, category.name]));

  return rows
    .map((row) => {
      const amountInt = row._sum.amountInt ?? 0;
      return {
        categoryId: row.categoryId,
        name: row.categoryId ? (nameOf.get(row.categoryId) ?? null) : null,
        amountInt,
        share: total === 0 ? 0 : amountInt / total,
      };
    })
    .sort((a, b) => b.amountInt - a.amountInt);
}

/** Escape CSV: pemisah, kutip, dan newline harus aman dibuka di Excel. */
function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function exportCsv(userId: string, from: Date, to: Date): Promise<string> {
  const transactions = await db.transaction.findMany({
    where: { userId, deletedAt: null, occurredAt: { gte: from, lte: to } },
    include: {
      account: { select: { name: true } },
      category: { select: { name: true } },
      transferAccount: { select: { name: true } },
    },
    orderBy: { occurredAt: 'asc' },
  });

  const header = ['tanggal', 'tipe', 'akun', 'ke_akun', 'kategori', 'nominal_rupiah', 'catatan'];

  const rows = transactions.map((txn) =>
    [
      txn.occurredAt.toISOString(),
      txn.type,
      txn.account.name,
      txn.transferAccount?.name ?? '',
      txn.category?.name ?? '',
      // Nominal tetap integer polos — pemformatan diserahkan ke spreadsheet.
      txn.amountInt,
      txn.note ?? '',
    ]
      .map(csvCell)
      .join(','),
  );

  return [header.join(','), ...rows].join('\n');
}
