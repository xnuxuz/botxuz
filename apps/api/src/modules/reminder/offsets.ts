import { db } from '../../db.js';

/**
 * Urutan penentuan offset reminder (§3.2):
 *   1. yang dikirim di request
 *   2. default kategori
 *   3. tidak ada reminder sama sekali
 */
export async function resolveOffsets(
  explicit: number[] | undefined,
  categoryId: string | null | undefined,
): Promise<number[]> {
  if (explicit !== undefined) return explicit;
  if (!categoryId) return [];

  const category = await db.category.findUnique({
    where: { id: categoryId },
    select: { defaultReminderMinutes: true },
  });

  const minutes = category?.defaultReminderMinutes;
  return minutes === null || minutes === undefined ? [] : [minutes];
}

/** Kolom Json bertipe lebar; dipersempit di satu tempat supaya pemanggilnya bersih. */
export function offsetsFromJson(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is number => typeof entry === 'number' && entry >= 0);
}
