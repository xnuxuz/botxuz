import { describe, expect, it } from 'vitest';
import { currentMonth, monthRange } from './budgets.js';
import { lastMonths } from './reports.js';
import { balanceDeltas } from './transactions.js';

const ACCOUNT = 'acc-1';
const TARGET = 'acc-2';

describe('balanceDeltas', () => {
  it('income menambah saldo akun', () => {
    expect(
      balanceDeltas(
        { type: 'income', amountInt: 5000, accountId: ACCOUNT, transferAccountId: null },
        1,
      ),
    ).toEqual([{ accountId: ACCOUNT, delta: 5000 }]);
  });

  it('expense mengurangi saldo akun', () => {
    expect(
      balanceDeltas(
        { type: 'expense', amountInt: 5000, accountId: ACCOUNT, transferAccountId: null },
        1,
      ),
    ).toEqual([{ accountId: ACCOUNT, delta: -5000 }]);
  });

  it('transfer memindahkan, bukan menciptakan atau menghapus uang', () => {
    const deltas = balanceDeltas(
      { type: 'transfer', amountInt: 5000, accountId: ACCOUNT, transferAccountId: TARGET },
      1,
    );
    expect(deltas).toEqual([
      { accountId: ACCOUNT, delta: -5000 },
      { accountId: TARGET, delta: 5000 },
    ]);
    // Jumlah seluruh delta harus nol — kalau tidak, total kekayaan berubah.
    expect(deltas.reduce((sum, entry) => sum + entry.delta, 0)).toBe(0);
  });

  it('sign -1 membalik efek dengan tepat untuk setiap tipe', () => {
    for (const type of ['income', 'expense', 'transfer'] as const) {
      const txn = { type, amountInt: 5000, accountId: ACCOUNT, transferAccountId: TARGET };
      const forward = balanceDeltas(txn, 1);
      const reverse = balanceDeltas(txn, -1);

      expect(reverse).toHaveLength(forward.length);
      forward.forEach((entry, index) => {
        expect(reverse[index]?.accountId).toBe(entry.accountId);
        expect(reverse[index]?.delta).toBe(-entry.delta);
      });
    }
  });

  it('transfer tanpa akun tujuan hanya mengurangi akun asal', () => {
    expect(
      balanceDeltas(
        { type: 'transfer', amountInt: 100, accountId: ACCOUNT, transferAccountId: null },
        1,
      ),
    ).toEqual([{ accountId: ACCOUNT, delta: -100 }]);
  });
});

describe('monthRange', () => {
  it('mencakup satu bulan penuh, batas akhir eksklusif', () => {
    const { start, end } = monthRange(202608);
    expect(start.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('Desember menyeberang ke tahun berikutnya', () => {
    expect(monthRange(202612).end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('Februari kabisat 2028 punya 29 hari', () => {
    const { start, end } = monthRange(202802);
    expect((end.getTime() - start.getTime()) / 86_400_000).toBe(29);
  });
});

describe('lastMonths', () => {
  it('mengurut mundur dan berakhir di bulan yang diminta', () => {
    expect(lastMonths(202608, 3)).toEqual([202606, 202607, 202608]);
  });

  it('menyeberangi pergantian tahun tanpa menghasilkan bulan 00', () => {
    expect(lastMonths(202602, 4)).toEqual([202511, 202512, 202601, 202602]);
  });

  it('satu bulan mengembalikan dirinya sendiri', () => {
    expect(lastMonths(202601, 1)).toEqual([202601]);
  });
});

describe('currentMonth', () => {
  it('memakai penanggalan UTC dalam format yyyymm', () => {
    expect(currentMonth(new Date('2026-08-01T00:30:00Z'))).toBe(202608);
    expect(currentMonth(new Date('2026-12-31T23:59:59Z'))).toBe(202612);
  });
});
