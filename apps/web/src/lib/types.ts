/**
 * Bentuk data yang dipakai halaman. Sengaja ditulis ulang di sini alih-alih
 * meng-import tipe Prisma: yang datang lewat HTTP sudah JSON (tanggal jadi
 * string), jadi tipe DB akan berbohong soal bentuk sebenarnya.
 */

export type User = {
  id: string;
  email: string;
  displayName: string | null;
  timezone: string;
  telegramLinked: boolean;
  briefingMinute: number;
  briefingOn: boolean;
};

export type Category = {
  id: string;
  name: string;
  domain: 'task' | 'finance' | 'event';
  color: string | null;
};

export type Task = {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  deadline: string | null;
  categoryId: string | null;
};

export type Occurrence = {
  eventId: string;
  title: string;
  startAt: string;
  endAt: string;
  location: string | null;
  recurring: boolean;
};

export type Account = {
  id: string;
  name: string;
  type: 'cash' | 'bank' | 'ewallet';
  balanceCached: number;
};

export type Transaction = {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amountInt: number;
  note: string | null;
  occurredAt: string;
  accountId: string;
  categoryId: string | null;
};

export type BudgetStatus = {
  categoryId: string;
  categoryName: string | null;
  limitInt: number;
  spentInt: number;
  remainingInt: number;
  ratio: number;
};

export type Streak = { current: number; longest: number; lastActiveDay: string | null };

export type Stats = {
  global: Streak;
  perCategory: { categoryId: string | null; name: string | null; streak: Streak }[];
  heatmap: { day: string; minutes: number }[];
  weekly: {
    categoryId: string | null;
    name: string | null;
    minutes: number;
    targetMinutes: number | null;
  }[];
};

export type Cashflow = { month: number; incomeInt: number; expenseInt: number; netInt: number };

export type Breakdown = {
  categoryId: string | null;
  name: string | null;
  amountInt: number;
  share: number;
};
