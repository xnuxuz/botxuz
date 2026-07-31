import { describe, expect, it } from 'vitest';
import { formatRupiah, parseRupiah, rupiah } from './money.js';

describe('rupiah', () => {
  it('menolak float', () => {
    expect(() => rupiah(25_000.5)).toThrow(TypeError);
  });
});

describe('parseRupiah', () => {
  it('membaca shorthand ribuan dan jutaan', () => {
    expect(parseRupiah('25rb')).toBe(25_000);
    expect(parseRupiah('1.5jt')).toBe(1_500_000);
    expect(parseRupiah('50k')).toBe(50_000);
  });

  it('membaca angka dengan pemisah ribuan', () => {
    expect(parseRupiah('25.000')).toBe(25_000);
    expect(parseRupiah('Rp 1.250.000')).toBe(1_250_000);
  });

  it('mengembalikan null untuk input tak dikenal', () => {
    expect(parseRupiah('gofood')).toBeNull();
  });
});

describe('formatRupiah', () => {
  it('memformat tanpa desimal', () => {
    expect(formatRupiah(25_000)).toContain('25.000');
  });
});
