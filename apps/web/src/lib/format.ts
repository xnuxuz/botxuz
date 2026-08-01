import { formatRupiah } from '@xnuxuz/shared';

export { formatRupiah };

/**
 * Semua timestamp dari API berformat UTC; konversi ke zona user dilakukan di
 * sini, tepat sebelum ditampilkan (REQUIREMENT §5.2).
 */
export function clock(iso: string | Date, timezone: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function shortDate(iso: string | Date, timezone: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso));
}

export function longDate(iso: string | Date, timezone: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

export function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} mnt`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} jam` : `${hours}j ${rest}m`;
}
