/**
 * Semua timestamp UTC di DB, sedangkan "hari ini" dan "jam 6 pagi" milik user
 * ada di zona lokalnya (§5.2). Konversi dilakukan lewat Intl supaya tidak
 * menambah dependensi timezone.
 */
function partsIn(at: Date, timezone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function localMinuteOfDay(at: Date, timezone: string): number {
  const parts = partsIn(at, timezone);
  // Intl mengembalikan "24" untuk tengah malam pada sebagian locale/zona.
  const hour = Number(parts.hour) % 24;
  return hour * 60 + Number(parts.minute);
}

/** Kunci hari lokal (YYYY-MM-DD) — dipakai sebagai bagian kunci idempotensi. */
export function localDayKey(at: Date, timezone: string): string {
  const parts = partsIn(at, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Batas awal & akhir hari lokal, dinyatakan sebagai instan UTC untuk query DB. */
export function localDayBounds(at: Date, timezone: string): { start: Date; end: Date } {
  const minuteOfDay = localMinuteOfDay(at, timezone);
  const start = new Date(at.getTime() - minuteOfDay * 60_000);
  // Detik dan milidetik ikut dibuang supaya batasnya tepat di 00:00 lokal.
  start.setUTCSeconds(0, 0);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}
