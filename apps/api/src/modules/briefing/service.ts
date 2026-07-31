import { formatRupiah, NOTIF_TYPES, toJobId } from '@xnuxuz/shared';
import { logger } from '../../config/logger.js';
import { db } from '../../db.js';
import { getQueue, QUEUES } from '../../queue.js';
import { topUpRecurringReminders } from '../event/service.js';
import { localDayBounds, localDayKey, localMinuteOfDay } from './time.js';

/** Selebar apa jendela pencocokan jam briefing; harus >= interval pemanggilan job. */
export const BRIEFING_WINDOW_MIN = 15;

const MAX_SCHEDULE_LINES = 8;
const MAX_TASK_LINES = 6;

export type Briefing = { title: string; body: string };

/**
 * Menyusun teks briefing pagi (§3.2): jadwal hari ini, task prioritas, dan
 * sisa jatah harian. Semua rentang dihitung pada hari LOKAL user, bukan UTC.
 */
export async function composeBriefing(userId: string, now = new Date()): Promise<Briefing | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { timezone: true, displayName: true },
  });
  if (!user) return null;

  const { start, end } = localDayBounds(now, user.timezone);

  const [occurrences, tasks, budget] = await Promise.all([
    // Import dinamis: modul event mengimpor reminder yang mengimpor queue —
    // pemuatan malas menghindari siklus saat modul briefing dimuat lebih dulu.
    import('../event/service.js').then((module) => module.getSchedule(userId, start, end)),
    db.task.findMany({
      where: {
        userId,
        status: { in: ['todo', 'in_progress'] },
        OR: [{ deadline: { lte: end } }, { priority: { in: ['high', 'urgent'] } }],
      },
      orderBy: [{ priority: 'desc' }, { deadline: { sort: 'asc', nulls: 'last' } }],
      take: MAX_TASK_LINES,
    }),
    dailyBudgetLeft(userId, now, user.timezone),
  ]);

  const lines: string[] = [];

  lines.push('📅 Jadwal hari ini');
  if (occurrences.length === 0) {
    lines.push('  (kosong)');
  } else {
    for (const occurrence of occurrences.slice(0, MAX_SCHEDULE_LINES)) {
      const clock = new Intl.DateTimeFormat('id-ID', {
        timeZone: user.timezone,
        hour: '2-digit',
        minute: '2-digit',
      }).format(occurrence.startAt);
      lines.push(`  ${clock} — ${occurrence.title}`);
    }
    if (occurrences.length > MAX_SCHEDULE_LINES) {
      lines.push(`  +${occurrences.length - MAX_SCHEDULE_LINES} lagi`);
    }
  }

  lines.push('', '✅ Task prioritas');
  if (tasks.length === 0) {
    lines.push('  (tidak ada)');
  } else {
    for (const task of tasks) {
      const due = task.deadline
        ? ` (${new Intl.DateTimeFormat('id-ID', {
            timeZone: user.timezone,
            day: 'numeric',
            month: 'short',
          }).format(task.deadline)})`
        : '';
      lines.push(`  • [${task.priority}] ${task.title}${due}`);
    }
  }

  if (budget !== null) {
    lines.push('', `💰 Sisa jatah hari ini: ${formatRupiah(budget)}`);
  }

  return {
    title: `Briefing ${new Intl.DateTimeFormat('id-ID', {
      timeZone: user.timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(now)}`,
    body: lines.join('\n'),
  };
}

/**
 * Sisa anggaran bulan ini dibagi rata ke hari yang tersisa. Null kalau user
 * belum menetapkan budget — lebih baik tidak menampilkan baris daripada Rp0.
 */
async function dailyBudgetLeft(
  userId: string,
  now: Date,
  timezone: string,
): Promise<number | null> {
  const month = Number(localDayKey(now, timezone).slice(0, 7).replace('-', ''));

  const budgets = await db.budget.findMany({ where: { userId, month } });
  if (budgets.length === 0) return null;

  const monthStart = new Date(Date.UTC(Math.floor(month / 100), (month % 100) - 1, 1));
  const monthEnd = new Date(Date.UTC(Math.floor(month / 100), month % 100, 1));

  const spent = await db.transaction.aggregate({
    where: {
      userId,
      type: 'expense',
      deletedAt: null,
      categoryId: { in: budgets.map((budget) => budget.categoryId) },
      occurredAt: { gte: monthStart, lt: monthEnd },
    },
    _sum: { amountInt: true },
  });

  const limit = budgets.reduce((total, budget) => total + budget.limitInt, 0);
  const remaining = limit - (spent._sum.amountInt ?? 0);

  const daysLeft = Math.max(Math.ceil((monthEnd.getTime() - now.getTime()) / 86_400_000), 1);

  return Math.max(Math.floor(remaining / daysLeft), 0);
}

/**
 * Dipanggil job terjadwal. Mencari user yang jam lokalnya pas dengan jam
 * briefing mereka, lalu mengantre notifikasi. Idempoten lewat job id harian,
 * jadi pemanggilan ganda tidak menghasilkan dua pesan.
 */
export async function runDueBriefings(now = new Date()): Promise<{ sent: number }> {
  const users = await db.user.findMany({
    where: { briefingOn: true, telegramChatId: { not: null } },
    select: { id: true, timezone: true, briefingMinute: true },
  });

  let sent = 0;

  for (const user of users) {
    const minuteNow = localMinuteOfDay(now, user.timezone);
    const diff = minuteNow - user.briefingMinute;
    if (diff < 0 || diff >= BRIEFING_WINDOW_MIN) continue;

    const briefing = await composeBriefing(user.id, now);
    if (!briefing) continue;

    const dayKey = localDayKey(now, user.timezone);
    await getQueue(QUEUES.notification).add(
      'briefing',
      {
        userId: user.id,
        notifType: NOTIF_TYPES.digest,
        payload: {
          idempotencyKey: `briefing:${user.id}:${dayKey}`,
          title: briefing.title,
          body: briefing.body,
        },
      },
      { jobId: toJobId('notif', 'briefing', user.id, dayKey) },
    );

    // Sekalian perpanjang reminder event berulang — kadensnya sama-sama harian.
    const toppedUp = await topUpRecurringReminders(user.id);
    logger.debug({ userId: user.id, toppedUp }, 'Reminder berulang diperpanjang');

    sent += 1;
  }

  return { sent };
}
