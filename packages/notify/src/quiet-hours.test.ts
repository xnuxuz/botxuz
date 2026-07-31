import { describe, expect, it } from 'vitest';
import { isWithinQuietHours, localMinuteOfDay, quietHoursEndAt } from './quiet-hours.js';

const NIGHT = { startMinute: 22 * 60, endMinute: 7 * 60 };
const DAY = { startMinute: 13 * 60, endMinute: 15 * 60 };

describe('localMinuteOfDay', () => {
  it('mengonversi UTC ke menit lokal Asia/Jakarta (+7)', () => {
    // 2026-07-31T00:30:00Z = 07:30 WIB
    const at = new Date('2026-07-31T00:30:00Z');
    expect(localMinuteOfDay(at, 'Asia/Jakarta')).toBe(7 * 60 + 30);
    expect(localMinuteOfDay(at, 'UTC')).toBe(30);
  });

  it('menangani pergantian hari akibat offset', () => {
    // 2026-07-31T20:00:00Z = 03:00 WIB tanggal 1 Agustus
    expect(localMinuteOfDay(new Date('2026-07-31T20:00:00Z'), 'Asia/Jakarta')).toBe(3 * 60);
  });
});

describe('isWithinQuietHours', () => {
  it('mengenali jendela yang melewati tengah malam', () => {
    expect(isWithinQuietHours(23 * 60, NIGHT)).toBe(true);
    expect(isWithinQuietHours(3 * 60, NIGHT)).toBe(true);
    expect(isWithinQuietHours(22 * 60, NIGHT)).toBe(true);
    expect(isWithinQuietHours(12 * 60, NIGHT)).toBe(false);
  });

  it('menganggap menit akhir sudah di luar jendela', () => {
    expect(isWithinQuietHours(7 * 60, NIGHT)).toBe(false);
    expect(isWithinQuietHours(15 * 60, DAY)).toBe(false);
  });

  it('menangani jendela biasa dalam satu hari', () => {
    expect(isWithinQuietHours(14 * 60, DAY)).toBe(true);
    expect(isWithinQuietHours(16 * 60, DAY)).toBe(false);
  });

  it('start sama dengan end berarti quiet hours mati', () => {
    expect(isWithinQuietHours(5 * 60, { startMinute: 60, endMinute: 60 })).toBe(false);
  });
});

describe('quietHoursEndAt', () => {
  it('menunda ke pagi yang sama saat notifikasi datang lewat tengah malam', () => {
    const at = new Date('2026-07-31T00:00:00Z'); // 03:00 lokal
    const end = quietHoursEndAt(at, 3 * 60, NIGHT);
    expect(end.getTime() - at.getTime()).toBe(4 * 60 * 60_000);
  });

  it('menunda ke pagi berikutnya saat notifikasi datang sebelum tengah malam', () => {
    const at = new Date('2026-07-31T00:00:00Z'); // dianggap 23:00 lokal
    const end = quietHoursEndAt(at, 23 * 60, NIGHT);
    expect(end.getTime() - at.getTime()).toBe(8 * 60 * 60_000);
  });
});
