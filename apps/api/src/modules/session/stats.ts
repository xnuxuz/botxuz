import { db } from '../../db.js';
import { localDayKey } from '../briefing/time.js';

/** Sejauh mana ke belakang statistik dihitung. Satu tahun cukup untuk heatmap ala GitHub. */
const WINDOW_DAYS = 366;

export type Streak = { current: number; longest: number; lastActiveDay: string | null };

export type StatsResult = {
  global: Streak;
  perCategory: { categoryId: string | null; name: string | null; streak: Streak }[];
  /** Menit per hari lokal, untuk heatmap kontribusi (§3.3). */
  heatmap: { day: string; minutes: number }[];
  weekly: {
    categoryId: string | null;
    name: string | null;
    minutes: number;
    targetMinutes: number | null;
  }[];
};

export async function getStats(userId: string, now = new Date()): Promise<StatsResult> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const timezone = user?.timezone ?? 'Asia/Jakarta';

  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);

  const [sessions, categories, goals] = await Promise.all([
    db.workSession.findMany({
      where: { userId, startedAt: { gte: since }, durationMin: { not: null } },
      select: { startedAt: true, durationMin: true, categoryId: true },
    }),
    db.category.findMany({ where: { userId, domain: 'task' }, select: { id: true, name: true } }),
    db.goal.findMany({
      where: { userId },
      select: { categoryId: true, targetMinutesWeekly: true },
    }),
  ]);

  const nameOf = new Map(categories.map((category) => [category.id, category.name]));

  // Hari dihitung di zona user: sesi jam 1 pagi WIB milik hari itu, bukan hari
  // sebelumnya seperti kalau memakai tanggal UTC.
  const minutesPerDay = new Map<string, number>();
  const daysPerCategory = new Map<string | null, Set<string>>();
  const weekStart = new Date(now.getTime() - 7 * 86_400_000);
  const weeklyMinutes = new Map<string | null, number>();

  for (const session of sessions) {
    const day = localDayKey(session.startedAt, timezone);
    const minutes = session.durationMin ?? 0;

    minutesPerDay.set(day, (minutesPerDay.get(day) ?? 0) + minutes);

    let days = daysPerCategory.get(session.categoryId);
    if (!days) {
      days = new Set();
      daysPerCategory.set(session.categoryId, days);
    }
    days.add(day);

    if (session.startedAt >= weekStart) {
      weeklyMinutes.set(session.categoryId, (weeklyMinutes.get(session.categoryId) ?? 0) + minutes);
    }
  }

  const today = localDayKey(now, timezone);
  const allDays = new Set(minutesPerDay.keys());

  const targetOf = new Map(goals.map((goal) => [goal.categoryId, goal.targetMinutesWeekly]));

  return {
    global: computeStreak(allDays, today),
    perCategory: [...daysPerCategory.entries()].map(([categoryId, days]) => ({
      categoryId,
      name: categoryId ? (nameOf.get(categoryId) ?? null) : null,
      streak: computeStreak(days, today),
    })),
    heatmap: [...minutesPerDay.entries()]
      .map(([day, minutes]) => ({ day, minutes }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    weekly: [...new Set([...weeklyMinutes.keys(), ...targetOf.keys()])].map((categoryId) => ({
      categoryId,
      name: categoryId ? (nameOf.get(categoryId) ?? null) : null,
      minutes: weeklyMinutes.get(categoryId) ?? 0,
      targetMinutes: categoryId ? (targetOf.get(categoryId) ?? null) : null,
    })),
  };
}

function shiftDay(day: string, deltaDays: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

/**
 * Streak berjalan tetap dihitung utuh kalau hari ini belum ada sesi tapi kemarin
 * ada — hari yang sedang berlangsung belum bisa disebut terlewat.
 */
export function computeStreak(days: Set<string>, today: string): Streak {
  const sorted = [...days].sort();
  const lastActiveDay = sorted.at(-1) ?? null;

  let longest = 0;
  let run = 0;
  let previous: string | null = null;

  for (const day of sorted) {
    run = previous !== null && shiftDay(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }

  let current = 0;
  let cursor = days.has(today) ? today : shiftDay(today, -1);
  while (days.has(cursor)) {
    current += 1;
    cursor = shiftDay(cursor, -1);
  }

  return { current, longest, lastActiveDay };
}
