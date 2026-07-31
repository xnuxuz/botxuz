/**
 * BullMQ 6 menolak custom job id yang mengandung ':' (dipakai internal sebagai
 * pemisah key Redis). Semua job id deterministik dibentuk lewat helper ini
 * supaya aturan itu tidak perlu diingat di setiap call site.
 */
export function toJobId(...parts: (string | number)[]): string {
  return parts
    .map((part) => String(part).replace(/[^a-zA-Z0-9_-]/g, '-'))
    .filter(Boolean)
    .join('-');
}
