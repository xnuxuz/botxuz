import { createRequire } from 'node:module';
import type { RRule as RRuleClass } from 'rrule';
import { AppError } from '../http/errors.js';

// rrule 2.x hanya menerbitkan CommonJS yang bisa dipakai Node (build ESM-nya
// memakai specifier tanpa ekstensi, ditolak loader ESM). createRequire memberi
// interop yang benar tanpa kehilangan tipe.
const { RRule, rrulestr } = createRequire(import.meta.url)('rrule') as typeof import('rrule');

/**
 * RRULE RFC 5545 dipakai apa adanya supaya kompatibel Google Calendar (§3.2).
 * Semua perhitungan dilakukan dalam UTC — rrule memakai Date sebagai wadah
 * "waktu dinding", jadi konversi timezone tetap tanggung jawab edge/client.
 */
export function parseRrule(rule: string, dtstart: Date): RRuleClass {
  try {
    const parsed = rrulestr(rule.startsWith('RRULE:') ? rule : `RRULE:${rule}`, { dtstart });
    if (!(parsed instanceof RRule)) {
      throw AppError.badRequest('RRULE dengan RDATE/EXDATE belum didukung');
    }
    return parsed;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.badRequest(`RRULE tidak valid: ${rule}`);
  }
}

/** Validasi saat create/update supaya aturan rusak tidak sampai tersimpan. */
export function assertValidRrule(rule: string | null | undefined, dtstart: Date): void {
  if (rule) parseRrule(rule, dtstart);
}

/** Kemunculan berikutnya setelah `after`; null kalau aturannya sudah habis (COUNT/UNTIL). */
export function nextOccurrence(rule: string, dtstart: Date, after: Date): Date | null {
  return parseRrule(rule, dtstart).after(after, false);
}

/**
 * Semua kemunculan dalam rentang. Dibatasi agar aturan tak berujung seperti
 * FREQ=MINUTELY tidak bisa meledakkan memori lewat rentang yang lebar.
 */
export function occurrencesBetween(
  rule: string,
  dtstart: Date,
  from: Date,
  to: Date,
  limit = 500,
): Date[] {
  const dates: Date[] = [];
  parseRrule(rule, dtstart).between(from, to, true, (date) => {
    dates.push(date);
    return dates.length < limit;
  });
  return dates;
}
