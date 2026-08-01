import { redirect } from 'next/navigation';
import { Heatmap } from '../../components/heatmap';
import { Shell } from '../../components/shell';
import { duration } from '../../lib/format';
import { apiFetch, apiFetchSafe, SessionExpiredError } from '../../lib/server-api';
import type { Stats, User } from '../../lib/types';

export const dynamic = 'force-dynamic';

export default async function StatsPage() {
  let user: User;
  try {
    user = await apiFetch<User>('/auth/me');
  } catch (error) {
    if (error instanceof SessionExpiredError) redirect('/login');
    throw error;
  }

  const stats = await apiFetchSafe<Stats>('/sessions/stats', {
    global: { current: 0, longest: 0, lastActiveDay: null },
    perCategory: [],
    heatmap: [],
    weekly: [],
  });

  const totalMinutes = stats.heatmap.reduce((sum, day) => sum + day.minutes, 0);

  return (
    <Shell>
      <div className="grid">
        <section className="card">
          <h2>Streak berjalan</h2>
          <p className="stat">{stats.global.current} hari</p>
          <p className="stat-sub">Terpanjang {stats.global.longest} hari</p>
        </section>

        <section className="card">
          <h2>Total tercatat</h2>
          <p className="stat">{duration(totalMinutes)}</p>
          <p className="stat-sub">{stats.heatmap.length} hari aktif</p>
        </section>

        <section className="card">
          <h2>Terakhir aktif</h2>
          <p className="stat" style={{ fontSize: '1.3rem' }}>
            {stats.global.lastActiveDay ?? '—'}
          </p>
          <p className="stat-sub">{user.timezone}</p>
        </section>
      </div>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Kontribusi setahun terakhir</h2>
        <Heatmap days={stats.heatmap} />
      </section>

      <div className="grid" style={{ marginTop: '1rem' }}>
        <section className="card">
          <h2>Progres mingguan</h2>
          {stats.weekly.length === 0 ? (
            <p className="empty">Belum ada sesi minggu ini.</p>
          ) : (
            <ul className="list">
              {stats.weekly.map((row) => {
                const target = row.targetMinutes ?? 0;
                const ratio = target > 0 ? row.minutes / target : 0;
                return (
                  <li key={row.categoryId ?? 'none'} style={{ display: 'block' }}>
                    <div style={{ display: 'flex', gap: '0.7rem' }}>
                      <span className="grow">{row.name ?? 'Tanpa kategori'}</span>
                      <span className="amount">
                        {duration(row.minutes)}
                        {target > 0 ? ` / ${duration(target)}` : ''}
                      </span>
                    </div>
                    {target > 0 ? (
                      <div className="bar">
                        <span style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Streak per kategori</h2>
          {stats.perCategory.length === 0 ? (
            <p className="empty">Belum ada data.</p>
          ) : (
            <ul className="list">
              {stats.perCategory.map((row) => (
                <li key={row.categoryId ?? 'none'}>
                  <span className="grow">{row.name ?? 'Tanpa kategori'}</span>
                  <span className="amount">{row.streak.current} hari</span>
                  <span className="when">maks {row.streak.longest}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Shell>
  );
}
