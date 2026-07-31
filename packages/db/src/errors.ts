/**
 * Prisma melempar error dengan kode string (`P2002` dst.). Kode dicek lewat
 * duck typing, bukan `instanceof`, supaya app tidak perlu meng-import kelas
 * error dari client yang di-generate.
 */
function prismaErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/** P2002 — unique constraint gagal (mis. email atau telegram_chat_id ganda). */
export function isUniqueViolation(error: unknown): boolean {
  return prismaErrorCode(error) === 'P2002';
}

/** P2025 — baris yang dituju update/delete tidak ada. */
export function isRecordNotFound(error: unknown): boolean {
  return prismaErrorCode(error) === 'P2025';
}

/** P2003 — foreign key gagal, biasanya id relasi milik user lain atau ngawur. */
export function isForeignKeyViolation(error: unknown): boolean {
  return prismaErrorCode(error) === 'P2003';
}
