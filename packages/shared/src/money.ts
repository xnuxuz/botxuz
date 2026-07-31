/**
 * Uang SELALU integer rupiah — tidak pernah float (REQUIREMENT §3.4).
 * Modul ini satu-satunya tempat konversi rupiah <-> string.
 */

/** Brand type supaya integer rupiah tidak ketuker dengan angka biasa. */
export type Rupiah = number & { readonly __brand: 'Rupiah' };

export function rupiah(value: number): Rupiah {
  if (!Number.isInteger(value)) {
    throw new TypeError(`Nominal rupiah harus integer, dapat: ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Nominal rupiah di luar safe integer: ${value}`);
  }
  return value as Rupiah;
}

const FORMATTER = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

export function formatRupiah(value: Rupiah | number): string {
  return FORMATTER.format(value);
}

const SHORTHAND: Record<string, number> = {
  rb: 1_000,
  ribu: 1_000,
  k: 1_000,
  jt: 1_000_000,
  juta: 1_000_000,
  m: 1_000_000,
};

/**
 * Parser fallback saat LLM down / kena rate limit (REQUIREMENT §5.3).
 * Menerima "25rb", "1.5jt", "25.000", "Rp 25,000".
 */
export function parseRupiah(input: string): Rupiah | null {
  const match = input
    .trim()
    .toLowerCase()
    .replace(/^rp\.?\s*/, '')
    .match(/^([\d.,]+)\s*(rb|ribu|k|jt|juta|m)?$/);

  if (!match) return null;

  const [, rawNumber, unit] = match;
  if (!rawNumber) return null;

  // Tanpa unit "25.000" berarti pemisah ribuan; dengan unit "1.5jt" berarti desimal.
  const normalized = unit ? rawNumber.replace(/,/g, '.') : rawNumber.replace(/[.,]/g, '');

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;

  const multiplier = unit ? (SHORTHAND[unit] ?? 1) : 1;
  return rupiah(Math.round(parsed * multiplier));
}
