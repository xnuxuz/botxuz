import type { CategoryDomain } from '@xnuxuz/db';
import { db } from '../../db.js';
import { AppError } from '../../http/errors.js';

/**
 * Dipanggil sebelum menyimpan relasi ke kategori. Tanpa ini, user bisa
 * menempelkan categoryId milik user lain — foreign key MySQL tidak tahu soal
 * kepemilikan, hanya soal keberadaan baris.
 */
export async function assertCategoryOwned(
  userId: string,
  categoryId: string,
  domain: CategoryDomain,
): Promise<void> {
  const category = await db.category.findFirst({
    where: { id: categoryId, userId, domain },
    select: { id: true },
  });

  if (!category) {
    throw AppError.badRequest(`Kategori tidak ditemukan di domain ${domain}`);
  }
}
