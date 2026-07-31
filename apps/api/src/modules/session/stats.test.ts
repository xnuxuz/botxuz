import { describe, expect, it } from 'vitest';
import { computeStreak } from './stats.js';

const TODAY = '2026-07-31';

describe('computeStreak', () => {
  it('nol saat belum pernah ada sesi', () => {
    expect(computeStreak(new Set(), TODAY)).toEqual({
      current: 0,
      longest: 0,
      lastActiveDay: null,
    });
  });

  it('menghitung hari berturut-turut sampai hari ini', () => {
    const days = new Set(['2026-07-29', '2026-07-30', '2026-07-31']);
    expect(computeStreak(days, TODAY)).toMatchObject({ current: 3, longest: 3 });
  });

  it('streak tetap utuh kalau hari ini belum ada sesi tapi kemarin ada', () => {
    // Hari yang sedang berjalan belum bisa disebut terlewat.
    const days = new Set(['2026-07-29', '2026-07-30']);
    expect(computeStreak(days, TODAY).current).toBe(2);
  });

  it('streak putus kalau dua hari terakhir kosong', () => {
    const days = new Set(['2026-07-27', '2026-07-28']);
    expect(computeStreak(days, TODAY)).toMatchObject({ current: 0, longest: 2 });
  });

  it('longest mengingat rentetan terpanjang, bukan yang terakhir', () => {
    const days = new Set([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
      '2026-07-30',
      '2026-07-31',
    ]);
    expect(computeStreak(days, TODAY)).toMatchObject({ current: 2, longest: 4 });
  });

  it('menyeberangi pergantian bulan', () => {
    const days = new Set(['2026-06-29', '2026-06-30', '2026-07-01']);
    expect(computeStreak(days, '2026-07-01').current).toBe(3);
  });

  it('menyeberangi pergantian tahun', () => {
    const days = new Set(['2025-12-31', '2026-01-01']);
    expect(computeStreak(days, '2026-01-01').current).toBe(2);
  });

  it('melaporkan hari aktif terakhir', () => {
    const days = new Set(['2026-07-10', '2026-07-25']);
    expect(computeStreak(days, TODAY).lastActiveDay).toBe('2026-07-25');
  });
});
