import { parseRupiah } from '@xnuxuz/shared';

/**
 * Parser deterministik untuk quick entry finance (REQUIREMENT §3.4, §5.3).
 * Ini jalur yang dipakai saat LLM down atau kena rate limit — jadi sengaja
 * tidak memanggil apa pun dari luar dan tidak pernah melempar.
 */

export type ParsedEntry = {
  type: 'income' | 'expense';
  amountInt: number;
  /** Sisa kalimat setelah nominal dan kata kunci dibuang; jadi catatan transaksi. */
  note: string;
  /** Kata yang memicu tebakan kategori; null kalau tidak ada yang cocok. */
  categoryHint: string | null;
};

const INCOME_WORDS = [
  'masuk',
  'terima',
  'diterima',
  'gaji',
  'gajian',
  'bonus',
  'honor',
  'dapat',
  'pemasukan',
  'untung',
];

const EXPENSE_WORDS = [
  'keluar',
  'bayar',
  'beli',
  'jajan',
  'belanja',
  'habis',
  'pengeluaran',
  'top up',
  'topup',
  'isi',
];

/**
 * Sinonim → nama kategori default. Dicocokkan setelah nama kategori asli, jadi
 * user yang mengganti nama kategori tetap menang atas daftar ini.
 */
const CATEGORY_HINTS: Record<string, string[]> = {
  Makan: [
    'makan',
    'sarapan',
    'siang',
    'malam',
    'jajan',
    'gofood',
    'grabfood',
    'shopeefood',
    'warteg',
    'nasi',
    'kopi',
    'ngopi',
    'snack',
    'minum',
  ],
  Transport: [
    'bensin',
    'bbm',
    'pertamax',
    'gojek',
    'grab',
    'ojek',
    'ojol',
    'angkot',
    'parkir',
    'tol',
    'transport',
    'kereta',
    'busway',
    'travel',
  ],
  'Kos & Tagihan': [
    'kos',
    'kost',
    'kontrakan',
    'sewa',
    'listrik',
    'pln',
    'air',
    'pdam',
    'tagihan',
    'wifi',
    'internet',
    'indihome',
  ],
  Langganan: [
    'langganan',
    'netflix',
    'spotify',
    'youtube',
    'subscription',
    'iuran',
    'pulsa',
    'paket data',
  ],
  Belanja: ['belanja', 'baju', 'sepatu', 'shopee', 'tokopedia', 'tokped', 'lazada', 'olshop'],
  Pemasukan: ['gaji', 'gajian', 'bonus', 'honor', 'thr', 'freelance'],
};

/** Angka + satuan opsional, mis. "25rb", "1.5jt", "25.000", "50k". */
const AMOUNT_PATTERN = /(?:rp\.?\s*)?(\d[\d.,]*)\s*(rb|ribu|k|jt|juta|m)?\b/gi;

function containsWord(haystack: string, needle: string): boolean {
  // Batas kata supaya "isi" tidak cocok di dalam "gratis" atau "komisi".
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, 'i').test(haystack);
}

/** Cari nominal terbesar di kalimat — biasanya itu yang dimaksud, bukan "2 porsi". */
function extractAmount(text: string): { amountInt: number; matched: string } | null {
  let best: { amountInt: number; matched: string } | null = null;

  for (const match of text.matchAll(AMOUNT_PATTERN)) {
    const [matched, digits, unit] = match;
    if (!digits) continue;

    const amount = parseRupiah(`${digits}${unit ?? ''}`);
    if (amount === null) continue;

    // Angka telanjang di bawah 100 hampir selalu jumlah barang atau jam, bukan rupiah.
    if (!unit && amount < 100) continue;

    if (!best || amount > best.amountInt) best = { amountInt: amount, matched };
  }

  return best;
}

function detectType(text: string): 'income' | 'expense' | null {
  const income = INCOME_WORDS.some((word) => containsWord(text, word));
  const expense = EXPENSE_WORDS.some((word) => containsWord(text, word));

  // Keduanya muncul ("beli hadiah pakai bonus") — terlalu ambigu untuk ditebak.
  if (income && expense) return null;
  if (income) return 'income';
  if (expense) return 'expense';
  return null;
}

export function detectCategoryHint(text: string, knownCategories: string[]): string | null {
  const lower = text.toLowerCase();

  // Nama kategori milik user menang atas daftar sinonim bawaan.
  for (const name of knownCategories) {
    if (containsWord(lower, name.toLowerCase())) return name;
  }

  for (const [name, words] of Object.entries(CATEGORY_HINTS)) {
    if (!knownCategories.includes(name)) continue;
    if (words.some((word) => containsWord(lower, word))) return name;
  }

  return null;
}

/**
 * Mengembalikan null kalau kalimatnya tidak cukup jelas — lebih baik menyerah
 * dan bilang tidak paham daripada mencatat transaksi yang salah.
 */
export function parseQuickEntry(text: string, knownCategories: string[] = []): ParsedEntry | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const amount = extractAmount(trimmed);
  if (!amount) return null;

  const type = detectType(trimmed);
  if (!type) return null;

  const note = trimmed.replace(amount.matched, ' ').replace(/\s+/g, ' ').trim();

  return {
    type,
    amountInt: amount.amountInt,
    note,
    categoryHint: detectCategoryHint(trimmed, knownCategories),
  };
}
