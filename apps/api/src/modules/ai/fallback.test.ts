import { describe, expect, it } from 'vitest';
import { detectCategoryHint, parseQuickEntry } from './fallback.js';

const CATEGORIES = [
  'Makan',
  'Transport',
  'Kos & Tagihan',
  'Langganan',
  'Belanja',
  'Pemasukan',
  'Lainnya',
];

describe('parseQuickEntry', () => {
  it('membaca contoh dari REQUIREMENT: "keluar 25rb makan siang gofood"', () => {
    expect(parseQuickEntry('keluar 25rb makan siang gofood', CATEGORIES)).toMatchObject({
      type: 'expense',
      amountInt: 25_000,
      categoryHint: 'Makan',
    });
  });

  it.each([
    ['bayar kos 850rb', 'expense', 850_000, 'Kos & Tagihan'],
    ['beli bensin 20000', 'expense', 20_000, 'Transport'],
    ['jajan 15k kopi', 'expense', 15_000, 'Makan'],
    ['masuk gaji 5jt', 'income', 5_000_000, 'Pemasukan'],
    ['terima bonus 1.5jt', 'income', 1_500_000, 'Pemasukan'],
    ['bayar langganan spotify 54900', 'expense', 54_900, 'Langganan'],
    ['belanja shopee Rp 125.000', 'expense', 125_000, 'Belanja'],
  ])('mengurai "%s"', (text, type, amountInt, categoryHint) => {
    expect(parseQuickEntry(text, CATEGORIES)).toMatchObject({ type, amountInt, categoryHint });
  });

  it('mengambil nominal terbesar, bukan jumlah barang', () => {
    // "2" adalah banyaknya porsi, bukan rupiah.
    expect(parseQuickEntry('beli 2 nasi goreng 36rb', CATEGORIES)?.amountInt).toBe(36_000);
  });

  it('mengabaikan angka telanjang di bawah 100', () => {
    expect(parseQuickEntry('beli 3 kopi', CATEGORIES)).toBeNull();
  });

  it('tetap membaca angka kecil kalau ada satuannya', () => {
    expect(parseQuickEntry('jajan 5rb', CATEGORIES)?.amountInt).toBe(5_000);
  });

  it('menyerah kalau arah uangnya tidak jelas', () => {
    expect(parseQuickEntry('nasi padang 25rb', CATEGORIES)).toBeNull();
  });

  it('menyerah kalau kata masuk dan keluar bercampur', () => {
    // Lebih baik minta klarifikasi daripada salah mencatat arah uang.
    expect(parseQuickEntry('beli hadiah 200rb pakai bonus', CATEGORIES)).toBeNull();
  });

  it('menyerah kalau tidak ada nominal', () => {
    expect(parseQuickEntry('bayar kos', CATEGORIES)).toBeNull();
    expect(parseQuickEntry('', CATEGORIES)).toBeNull();
  });

  it('membuang nominal dari catatan tapi menyisakan konteksnya', () => {
    const parsed = parseQuickEntry('keluar 25rb makan siang gofood', CATEGORIES);
    expect(parsed?.note).toBe('keluar makan siang gofood');
  });

  it('tidak menebak kategori yang tidak dimiliki user', () => {
    expect(parseQuickEntry('beli bensin 20rb', ['Makan'])?.categoryHint).toBeNull();
  });
});

describe('detectCategoryHint', () => {
  it('nama kategori milik user menang atas sinonim bawaan', () => {
    // "Transport" sebagai kata utuh harus menang walau ada sinonim Makan.
    expect(detectCategoryHint('biaya Transport ke kampus', CATEGORIES)).toBe('Transport');
  });

  it('cocok hanya pada kata utuh', () => {
    // "isi" ada di dalam "komisi", tapi bukan kata yang sama.
    expect(detectCategoryHint('komisi penjualan', CATEGORIES)).toBeNull();
  });

  it('null kalau tidak ada yang cocok', () => {
    expect(detectCategoryHint('hal yang tidak jelas', CATEGORIES)).toBeNull();
  });
});
