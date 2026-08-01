import {
  createEventArgs,
  createTaskArgs,
  createTransactionArgs,
  getBalanceArgs,
  getScheduleArgs,
  getSpendingReportArgs,
  getTasksArgs,
  logSessionArgs,
} from '@xnuxuz/ai';
import type { CategoryDomain } from '@xnuxuz/db';
import { formatRupiah } from '@xnuxuz/shared';
import { db } from '../../db.js';
import { AppError } from '../../http/errors.js';
import { localDayBounds } from '../briefing/time.js';
import { createEvent, getSchedule } from '../event/service.js';
import { currentMonth } from '../finance/budgets.js';
import { breakdown } from '../finance/reports.js';
import { createTransaction } from '../finance/transactions.js';
import { logSession } from '../session/service.js';
import { createTask, listTasks } from '../task/service.js';

/**
 * Jembatan antara function call LLM dan service yang sudah ada. Tidak ada logic
 * bisnis baru di sini — LLM hanya boleh menyentuh yang sudah bisa dilakukan
 * lewat API biasa, dengan validasi yang persis sama.
 */

/** LLM menyebut kategori dengan nama; DB memakai id. */
async function categoryIdByName(
  userId: string,
  domain: CategoryDomain,
  name: string | undefined,
): Promise<string | null> {
  if (!name) return null;

  const category = await db.category.findFirst({
    where: { userId, domain, name: { equals: name }, archivedAt: null },
    select: { id: true },
  });

  return category?.id ?? null;
}

async function accountIdByName(userId: string, name: string | undefined): Promise<string> {
  const account = name
    ? await db.account.findFirst({ where: { userId, name: { equals: name }, archivedAt: null } })
    : // Tanpa penyebutan akun, pakai yang pertama — untuk pemakaian personal
      // hampir selalu benar, dan user bisa mengoreksi lewat tombol edit.
      await db.account.findFirst({
        where: { userId, archivedAt: null },
        orderBy: { createdAt: 'asc' },
      });

  if (!account) throw AppError.badRequest('Belum ada akun keuangan yang bisa dipakai');
  return account.id;
}

export type ExecutionResult = { summary: string; data: unknown };

export async function executeTool(
  userId: string,
  tool: string,
  rawArgs: Record<string, unknown>,
): Promise<ExecutionResult> {
  switch (tool) {
    case 'createTask': {
      const args = createTaskArgs.parse(rawArgs);
      const task = await createTask(userId, {
        title: args.title,
        priority: args.priority ?? 'medium',
        categoryId: await categoryIdByName(userId, 'task', args.category),
        deadline: args.deadline ?? null,
      });
      return { summary: `Task "${task.title}" dibuat.`, data: task };
    }

    case 'createEvent': {
      const args = createEventArgs.parse(rawArgs);
      const startAt = new Date(args.startAt);
      // Durasi default satu jam kalau LLM tidak menyebut selesainya.
      const endAt = args.endAt ? new Date(args.endAt) : new Date(startAt.getTime() + 3_600_000);

      const { event, conflicts } = await createEvent(userId, {
        title: args.title,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        allDay: false,
        location: args.location ?? null,
        categoryId: await categoryIdByName(userId, 'event', args.category),
      });

      const warning =
        conflicts.length > 0
          ? ` Bentrok dengan: ${conflicts.map((item) => item.title).join(', ')}.`
          : '';
      return { summary: `Event "${event.title}" dibuat.${warning}`, data: { event, conflicts } };
    }

    case 'createTransaction': {
      const args = createTransactionArgs.parse(rawArgs);
      if (args.type === 'transfer') {
        throw AppError.badRequest('Transfer belum bisa lewat asisten — pakai menu finance');
      }

      const txn = await createTransaction(userId, {
        accountId: await accountIdByName(userId, args.account),
        type: args.type,
        amountInt: args.amount,
        categoryId: await categoryIdByName(userId, 'finance', args.category),
        note: args.note ?? null,
        occurredAt: args.occurredAt,
      });

      const arah = args.type === 'income' ? 'Pemasukan' : 'Pengeluaran';
      return { summary: `${arah} ${formatRupiah(txn.amountInt)} dicatat.`, data: txn };
    }

    case 'logSession': {
      const args = logSessionArgs.parse(rawArgs);
      const endedAt = new Date();
      const startedAt = new Date(endedAt.getTime() - args.durationMinutes * 60_000);

      const session = await logSession(userId, {
        categoryId: await categoryIdByName(userId, 'task', args.category),
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        note: args.taskTitle ?? null,
      });

      return { summary: `Sesi ${args.durationMinutes} menit dicatat.`, data: session };
    }

    case 'getSchedule': {
      const args = getScheduleArgs.parse(rawArgs);
      const { start, end } = await rangeFor(userId, args.from, args.to);
      const occurrences = await getSchedule(userId, start, end);

      return {
        summary:
          occurrences.length === 0
            ? 'Tidak ada jadwal di rentang itu.'
            : occurrences.map((item) => `${item.startAt.toISOString()} ${item.title}`).join('\n'),
        data: occurrences,
      };
    }

    case 'getTasks': {
      const args = getTasksArgs.parse(rawArgs);
      // Skema tool memakai "doing"; DB memakai "in_progress".
      const status =
        args.status === 'doing' ? 'in_progress' : (args.status as 'todo' | 'done' | undefined);

      const tasks = await listTasks(userId, {
        limit: 20,
        ...(status ? { status } : {}),
        ...(args.category
          ? { categoryId: (await categoryIdByName(userId, 'task', args.category)) ?? undefined }
          : {}),
      });

      return {
        summary:
          tasks.length === 0
            ? 'Tidak ada task yang cocok.'
            : tasks.map((task) => `[${task.priority}] ${task.title}`).join('\n'),
        data: tasks,
      };
    }

    case 'getBalance': {
      const args = getBalanceArgs.parse(rawArgs);
      const accounts = await db.account.findMany({
        where: {
          userId,
          archivedAt: null,
          ...(args.account ? { name: { equals: args.account } } : {}),
        },
      });

      const total = accounts.reduce((sum, account) => sum + account.balanceCached, 0);
      return {
        summary: [
          ...accounts.map((account) => `${account.name}: ${formatRupiah(account.balanceCached)}`),
          `Total: ${formatRupiah(total)}`,
        ].join('\n'),
        data: accounts,
      };
    }

    case 'getSpendingReport': {
      const args = getSpendingReportArgs.parse(rawArgs);
      const month = args.month ? Number(args.month.replace('-', '')) : currentMonth();
      const rows = await breakdown(userId, month);

      return {
        summary:
          rows.length === 0
            ? 'Belum ada pengeluaran di bulan itu.'
            : rows
                .map((row) => `${row.name ?? 'Tanpa kategori'}: ${formatRupiah(row.amountInt)}`)
                .join('\n'),
        data: rows,
      };
    }

    default:
      throw AppError.badRequest(`Function ${tool} tidak dikenal`);
  }
}

/** Tanpa rentang eksplisit, "jadwal" berarti hari ini di zona waktu user. */
async function rangeFor(
  userId: string,
  from: string | undefined,
  to: string | undefined,
): Promise<{ start: Date; end: Date }> {
  if (from) {
    const start = new Date(`${from}T00:00:00Z`);
    const end = to ? new Date(`${to}T23:59:59Z`) : new Date(start.getTime() + 86_400_000);
    return { start, end };
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  return localDayBounds(new Date(), user?.timezone ?? 'Asia/Jakarta');
}
