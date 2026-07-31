/**
 * Semua timestamp UTC di DB; konversi ke zona user dilakukan tepat sebelum
 * teks dikirim (§5.2). Intl dipakai langsung supaya tidak menambah dependensi
 * timezone di image worker.
 */
export function formatLocalTime(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
}

export function formatLocalClock(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
}

export function formatLocalDate(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(at);
}
