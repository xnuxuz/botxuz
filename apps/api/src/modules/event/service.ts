import type { Event } from '@xnuxuz/db';
import { db } from '../../db.js';
import { AppError } from '../../http/errors.js';
import { assertValidRrule, occurrencesBetween } from '../../lib/recurrence.js';
import { assertCategoryOwned } from '../category/ownership.js';
import { offsetsFromJson, resolveOffsets } from '../reminder/offsets.js';
import { resetReminders } from '../reminder/service.js';
import type { CreateEventInput, UpdateEventInput } from './schemas.js';

/** Sejauh mana reminder event berulang dijadwalkan di muka; sisanya di-top-up job harian. */
export const REMINDER_HORIZON_DAYS = 35;
const MAX_REMINDERS_PER_EVENT = 40;

export type Occurrence = {
  eventId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  location: string | null;
  categoryId: string | null;
  /** True kalau ini hasil ekspansi RRULE, bukan baris aslinya. */
  recurring: boolean;
};

function durationOf(event: Pick<Event, 'startAt' | 'endAt'>): number {
  return event.endAt.getTime() - event.startAt.getTime();
}

/**
 * Mengembalikan kemunculan konkret dalam rentang: event sekali jalan apa adanya,
 * event berulang diekspansi dari RRULE. Ekspansi dilakukan saat baca, bukan
 * saat tulis — kalau tidak, mengubah satu aturan berarti menulis ulang ribuan baris.
 */
export async function getSchedule(userId: string, from: Date, to: Date): Promise<Occurrence[]> {
  const events = await db.event.findMany({
    where: {
      userId,
      // Event berulang bisa mulai jauh sebelum rentang, jadi tidak bisa difilter startAt saja.
      OR: [{ startAt: { lte: to }, endAt: { gte: from } }, { rrule: { not: null } }],
    },
  });

  const occurrences: Occurrence[] = [];

  for (const event of events) {
    if (!event.rrule) {
      if (event.startAt <= to && event.endAt >= from) {
        occurrences.push(toOccurrence(event, event.startAt, false));
      }
      continue;
    }

    const duration = durationOf(event);
    // Jendela digeser mundur selama durasi event: kemunculan yang MULAI sebelum
    // `from` tapi masih berjalan di dalam rentang tetap harus ikut terhitung —
    // tanpa ini, kuliah 08:00–10:40 tidak terdeteksi bentrok dengan rapat 08:30.
    const searchFrom = new Date(from.getTime() - duration);

    for (const start of occurrencesBetween(event.rrule, event.startAt, searchFrom, to)) {
      const occurrence = toOccurrence(event, start, true, duration);
      if (occurrence.endAt >= from) occurrences.push(occurrence);
    }
  }

  return occurrences.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

function toOccurrence(
  event: Event,
  start: Date,
  recurring: boolean,
  duration?: number,
): Occurrence {
  return {
    eventId: event.id,
    title: event.title,
    startAt: start,
    endAt: new Date(start.getTime() + (duration ?? durationOf(event))),
    allDay: event.allDay,
    location: event.location,
    categoryId: event.categoryId,
    recurring,
  };
}

/**
 * Deteksi bentrok (§3.2). Hasilnya dikembalikan sebagai peringatan, bukan
 * penolakan — jadwal yang tumpang tindih kadang memang disengaja.
 */
export async function findConflicts(
  userId: string,
  startAt: Date,
  endAt: Date,
  excludeEventId?: string,
): Promise<Occurrence[]> {
  const occurrences = await getSchedule(userId, startAt, endAt);
  return occurrences.filter(
    (occurrence) =>
      occurrence.eventId !== excludeEventId &&
      occurrence.startAt < endAt &&
      occurrence.endAt > startAt,
  );
}

/** Waktu-waktu reminder untuk sebuah event, ikut memperhitungkan pengulangan. */
function reminderTimes(event: Pick<Event, 'startAt' | 'rrule'>, offsets: number[]): Date[] {
  if (offsets.length === 0) return [];

  const starts = event.rrule
    ? occurrencesBetween(
        event.rrule,
        event.startAt,
        new Date(),
        new Date(Date.now() + REMINDER_HORIZON_DAYS * 86_400_000),
        MAX_REMINDERS_PER_EVENT,
      )
    : [event.startAt];

  return starts.flatMap((start) =>
    offsets.map((minutes) => new Date(start.getTime() - minutes * 60_000)),
  );
}

export async function createEvent(
  userId: string,
  input: CreateEventInput,
): Promise<{ event: Event; conflicts: Occurrence[] }> {
  if (input.categoryId) await assertCategoryOwned(userId, input.categoryId, 'event');

  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  if (input.rrule) assertValidRrule(input.rrule, startAt);

  const conflicts = await findConflicts(userId, startAt, endAt);
  const offsets = await resolveOffsets(input.reminderOffsets, input.categoryId);

  const event = await db.event.create({
    data: {
      userId,
      title: input.title,
      description: input.description ?? null,
      startAt,
      endAt,
      allDay: input.allDay,
      rrule: input.rrule ?? null,
      location: input.location ?? null,
      categoryId: input.categoryId ?? null,
      reminderOffsets: offsets,
    },
  });

  await resetReminders(userId, 'event', event.id, reminderTimes(event, offsets));

  return { event, conflicts };
}

export async function getEvent(userId: string, id: string): Promise<Event> {
  const event = await db.event.findFirst({ where: { id, userId } });
  if (!event) throw AppError.notFound('Event tidak ditemukan');
  return event;
}

export async function updateEvent(
  userId: string,
  id: string,
  input: UpdateEventInput,
): Promise<{ event: Event; conflicts: Occurrence[] }> {
  const existing = await getEvent(userId, id);
  if (input.categoryId) await assertCategoryOwned(userId, input.categoryId, 'event');

  const startAt = input.startAt ? new Date(input.startAt) : existing.startAt;
  const endAt = input.endAt ? new Date(input.endAt) : existing.endAt;
  if (endAt < startAt) throw AppError.badRequest('endAt tidak boleh sebelum startAt');

  const rrule = input.rrule === undefined ? existing.rrule : (input.rrule ?? null);
  if (rrule) assertValidRrule(rrule, startAt);

  const timeChanged = startAt.getTime() !== existing.startAt.getTime();
  const conflicts = timeChanged ? await findConflicts(userId, startAt, endAt, id) : [];

  const offsets = input.reminderOffsets ?? offsetsFromJson(existing.reminderOffsets);

  const event = await db.event.update({
    where: { id },
    data: {
      ...(input.reminderOffsets === undefined ? {} : { reminderOffsets: offsets }),
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.description === undefined ? {} : { description: input.description ?? null }),
      ...(input.location === undefined ? {} : { location: input.location ?? null }),
      ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId ?? null }),
      ...(input.allDay === undefined ? {} : { allDay: input.allDay }),
      startAt,
      endAt,
      rrule,
    },
  });

  if (input.reminderOffsets !== undefined || timeChanged || rrule !== existing.rrule) {
    await resetReminders(userId, 'event', id, reminderTimes(event, offsets));
  }

  return { event, conflicts };
}

export async function deleteEvent(userId: string, id: string): Promise<void> {
  const result = await db.event.deleteMany({ where: { id, userId } });
  if (result.count === 0) throw AppError.notFound('Event tidak ditemukan');
  await resetReminders(userId, 'event', id, []);
}

/**
 * Reminder event berulang hanya dijadwalkan sampai horizon tertentu, jadi
 * daftarnya perlu diperpanjang berkala. Dipanggil job harian; idempoten karena
 * resetReminders selalu menulis ulang jendela yang sama.
 */
export async function topUpRecurringReminders(userId: string): Promise<number> {
  // Filter offset dilakukan di JS: kolom Json tidak punya predikat "array tidak
  // kosong" yang portabel di MySQL.
  const events = await db.event.findMany({ where: { userId, rrule: { not: null } } });

  let touched = 0;
  for (const event of events) {
    const offsets = offsetsFromJson(event.reminderOffsets);
    if (offsets.length === 0) continue;
    await resetReminders(userId, 'event', event.id, reminderTimes(event, offsets));
    touched += 1;
  }

  return touched;
}
