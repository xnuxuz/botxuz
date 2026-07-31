/**
 * Quiet hours disimpan sebagai menit sejak tengah malam waktu LOKAL user,
 * sedangkan semua timestamp di DB UTC. Konversinya pakai Intl — tanpa library
 * timezone tambahan, dan otomatis benar saat aturan DST berubah.
 */
export function localMinuteOfDay(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);

  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

export type QuietWindow = { startMinute: number; endMinute: number };

/** Jendela boleh melewati tengah malam (22:00–07:00), jadi bukan sekadar start <= x <= end. */
export function isWithinQuietHours(minuteOfDay: number, window: QuietWindow): boolean {
  const { startMinute, endMinute } = window;
  if (startMinute === endMinute) return false;
  return startMinute < endMinute
    ? minuteOfDay >= startMinute && minuteOfDay < endMinute
    : minuteOfDay >= startMinute || minuteOfDay < endMinute;
}

/** Waktu berakhirnya quiet hours — notifikasi ditunda ke sini, bukan dibuang. */
export function quietHoursEndAt(at: Date, minuteOfDay: number, window: QuietWindow): Date {
  const untilEnd =
    window.endMinute > minuteOfDay
      ? window.endMinute - minuteOfDay
      : 24 * 60 - minuteOfDay + window.endMinute;

  return new Date(at.getTime() + untilEnd * 60_000);
}
