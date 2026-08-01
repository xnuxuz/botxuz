import { formatRupiah, NOTIF_TYPES, toJobId } from '@xnuxuz/shared';
import { db } from '../../db.js';
import { getQueue, QUEUES } from '../../queue.js';
import { getStats } from '../session/stats.js';
import { localDayBounds, localDayKey, localMinuteOfDay } from './time.js';

/**
 * Nightly review (REQUIREMENT §3.2): apa yang selesai, apa yang miss, streak.
 * Seluruhnya deterministik — ringkasan AI menyusul saat provider tersedia,
 * tapi laporan dasarnya tidak boleh bergantung pada itu.
 */

/** Menit lokal saat review dikirim. 21:00 — masih terjaga, tapi hari sudah hampir habis. */
export const REVIEW_MINUTE = 21 * 60;
export const REVIEW_WINDOW_MIN = 15;

const MAX_LINES = 6;

export type Review = { title: string; body: string };

export async function composeReview(userId: string, now = new Date()): Promise<Review | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  if (!user) return null;

  const { start, end } = localDayBounds(now, user.timezone);

  const [completed, missed, sessions, spending, stats] = await Promise.all([
    db.task.findMany({
      where: { userId, status: 'done', completedAt: { gte: start, lt: end } },
      select: { title: true },
      take: MAX_LINES + 1,
    }),
    // "Miss" = deadline hari ini lewat tapi belum selesai. Task tanpa deadline
    // tidak pernah dianggap terlewat — tidak adil menagih yang tidak dijanjikan.
    db.task.findMany({
      where: {
        userId,
        status: { in: ['todo', 'in_progress'] },
        deadline: { gte: start, lt: end },
      },
      select: { title: true },
      take: MAX_LINES + 1,
    }),
    db.workSession.aggregate({
      where: { userId, startedAt: { gte: start, lt: end }, durationMin: { not: null } },
      _sum: { durationMin: true },
      _count: true,
    }),
    db.transaction.aggregate({
      where: { userId, type: 'expense', deletedAt: null, occurredAt: { gte: start, lt: end } },
      _sum: { amountInt: true },
    }),
    getStats(userId, now),
  ]);

  const minutes = sessions._sum.durationMin ?? 0;
  const spent = spending._sum.amountInt ?? 0;

  // Hari yang benar-benar kosong tidak perlu dilaporkan — notifikasi tanpa isi
  // hanya melatih user mengabaikan notifikasi.
  if (completed.length === 0 && missed.length === 0 && minutes === 0 && spent === 0) {
    return null;
  }

  const lines: string[] = [];

  lines.push('✅ Selesai hari ini');
  if (completed.length === 0) {
    lines.push('  (belum ada)');
  } else {
    for (const task of completed.slice(0, MAX_LINES)) lines.push(`  • ${task.title}`);
    if (completed.length > MAX_LINES) lines.push(`  +${completed.length - MAX_LINES} lagi`);
  }

  if (missed.length > 0) {
    lines.push('', '⏳ Lewat deadline hari ini');
    for (const task of missed.slice(0, MAX_LINES)) lines.push(`  • ${task.title}`);
    if (missed.length > MAX_LINES) lines.push(`  +${missed.length - MAX_LINES} lagi`);
  }

  lines.push(
    '',
    `⏱️ Sesi kerja: ${sessions._count} sesi, ${formatDuration(minutes)}`,
    `🔥 Streak: ${stats.global.current} hari (terpanjang ${stats.global.longest})`,
  );

  if (spent > 0) lines.push(`💸 Pengeluaran: ${formatRupiah(spent)}`);

  const weekly = stats.weekly.filter((row) => row.targetMinutes !== null && row.targetMinutes > 0);
  if (weekly.length > 0) {
    lines.push('', '🎯 Progres mingguan');
    for (const row of weekly) {
      const target = row.targetMinutes ?? 0;
      const percent = Math.round((row.minutes / target) * 100);
      lines.push(`  ${row.name ?? 'Tanpa kategori'}: ${percent}% (${formatDuration(row.minutes)})`);
    }
  }

  return {
    title: `Review ${new Intl.DateTimeFormat('id-ID', {
      timeZone: user.timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(now)}`,
    body: lines.join('\n'),
  };
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} jam` : `${hours} jam ${rest} menit`;
}

/** Dipanggil sweep yang sama dengan briefing — beda hanya jam targetnya. */
export async function runDueReviews(now = new Date()): Promise<{ sent: number }> {
  const users = await db.user.findMany({
    where: { briefingOn: true, telegramChatId: { not: null } },
    select: { id: true, timezone: true },
  });

  let sent = 0;

  for (const user of users) {
    const diff = localMinuteOfDay(now, user.timezone) - REVIEW_MINUTE;
    if (diff < 0 || diff >= REVIEW_WINDOW_MIN) continue;

    const review = await composeReview(user.id, now);
    if (!review) continue;

    const dayKey = localDayKey(now, user.timezone);
    await getQueue(QUEUES.notification).add(
      'review',
      {
        userId: user.id,
        notifType: NOTIF_TYPES.digest,
        payload: {
          idempotencyKey: `review-${user.id}-${dayKey}`,
          title: review.title,
          body: review.body,
        },
      },
      { jobId: toJobId('notif', 'review', user.id, dayKey) },
    );

    sent += 1;
  }

  return { sent };
}
