const WEEKS = 26;
const DAY_MS = 86_400_000;

/** Ambang menit → tingkat warna. Dipilih dari pola kerja realistis, bukan kuantil. */
function levelOf(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0;
  if (minutes < 60) return 1;
  if (minutes < 150) return 2;
  if (minutes < 300) return 3;
  return 4;
}

/**
 * Heatmap kontribusi ala GitHub (§3.3). Grid diisi hari demi hari termasuk yang
 * kosong — kalau hanya hari aktif yang digambar, jeda panjang justru tak terlihat.
 */
export function Heatmap({ days }: { days: { day: string; minutes: number }[] }) {
  const minutesOf = new Map(days.map((entry) => [entry.day, entry.minutes]));

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Mundur ke Minggu terdekat supaya tiap kolom grid tepat satu minggu.
  const end = new Date(today.getTime() + (6 - today.getUTCDay()) * DAY_MS);
  const start = new Date(end.getTime() - (WEEKS * 7 - 1) * DAY_MS);

  const cells: { key: string; minutes: number; future: boolean }[] = [];
  for (let time = start.getTime(); time <= end.getTime(); time += DAY_MS) {
    const key = new Date(time).toISOString().slice(0, 10);
    cells.push({ key, minutes: minutesOf.get(key) ?? 0, future: time > today.getTime() });
  }

  return (
    <div className="heatmap" role="img" aria-label={`Aktivitas ${WEEKS} minggu terakhir`}>
      {cells.map((cell) => (
        <i
          key={cell.key}
          data-level={cell.future ? 0 : levelOf(cell.minutes)}
          title={`${cell.key}: ${cell.minutes} menit`}
          style={cell.future ? { opacity: 0.35 } : undefined}
        />
      ))}
    </div>
  );
}
