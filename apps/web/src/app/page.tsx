import { redirect } from 'next/navigation';
import { QuickEntry } from '../components/quick-entry';
import { Shell } from '../components/shell';
import { TaskRow } from '../components/task-row';
import { clock, formatRupiah, longDate } from '../lib/format';
import { apiFetch, apiFetchSafe, SessionExpiredError } from '../lib/server-api';
import type { Account, BudgetStatus, Occurrence, Stats, Task, User } from '../lib/types';

// Dashboard selalu menampilkan kondisi terkini; tidak ada gunanya di-cache.
export const dynamic = 'force-dynamic';

/** Batas hari lokal user dinyatakan sebagai instan UTC, sesuai kontrak API. */
function todayRange(timezone: string): { from: string; to: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  const minuteOfDay = (value('hour') % 24) * 60 + value('minute');

  const start = new Date(now.getTime() - minuteOfDay * 60_000);
  start.setUTCSeconds(0, 0);

  return { from: start.toISOString(), to: new Date(start.getTime() + 86_400_000).toISOString() };
}

export default async function TodayPage() {
  let user: User;
  try {
    user = await apiFetch<User>('/auth/me');
  } catch (error) {
    if (error instanceof SessionExpiredError) redirect('/login');
    throw error;
  }

  const { from, to } = todayRange(user.timezone);

  // Satu bagian yang gagal tidak boleh mengosongkan seluruh dashboard.
  const [schedule, tasks, accounts, budgets, stats] = await Promise.all([
    apiFetchSafe<Occurrence[]>(`/events/schedule?from=${from}&to=${to}`, []),
    apiFetchSafe<Task[]>('/tasks?status=todo&limit=8', []),
    apiFetchSafe<Account[]>('/accounts', []),
    apiFetchSafe<BudgetStatus[]>('/budgets', []),
    apiFetchSafe<Stats>('/sessions/stats', {
      global: { current: 0, longest: 0, lastActiveDay: null },
      perCategory: [],
      heatmap: [],
      weekly: [],
    }),
  ]);

  const total = accounts.reduce((sum, account) => sum + account.balanceCached, 0);
  const needsAttention = budgets.filter((budget) => budget.ratio >= 0.8);
  const urgent = tasks.filter(
    (task) => task.priority === 'high' || task.priority === 'urgent',
  ).length;

  return (
    <Shell>
      <p className="muted" style={{ marginTop: 0 }}>
        {longDate(new Date(), user.timezone)}
      </p>

      <div className="grid">
        <section className="card">
          <h2>Saldo total</h2>
          <p className="stat">{formatRupiah(total)}</p>
          <p className="stat-sub">
            {accounts.length === 0
              ? 'Belum ada akun'
              : accounts.map((account) => account.name).join(' · ')}
          </p>
        </section>

        <section className="card">
          <h2>Streak</h2>
          <p className="stat">{stats.global.current} hari</p>
          <p className="stat-sub">Terpanjang {stats.global.longest} hari</p>
        </section>

        <section className="card">
          <h2>Task terbuka</h2>
          <p className="stat">{tasks.length}</p>
          <p className="stat-sub">{urgent} prioritas tinggi</p>
        </section>
      </div>

      <div className="grid" style={{ marginTop: '1rem' }}>
        <section className="card">
          <h2>Jadwal hari ini</h2>
          {schedule.length === 0 ? (
            <p className="empty">Tidak ada jadwal.</p>
          ) : (
            <ul className="list">
              {schedule.map((item) => (
                <li key={`${item.eventId}-${item.startAt}`}>
                  <span className="when">{clock(item.startAt, user.timezone)}</span>
                  <span className="grow">
                    {item.title}
                    {item.location ? <span className="muted"> · {item.location}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Task prioritas</h2>
          {tasks.length === 0 ? (
            <p className="empty">Tidak ada task terbuka.</p>
          ) : (
            <ul className="list">
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} timezone={user.timezone} />
              ))}
            </ul>
          )}
        </section>
      </div>

      {needsAttention.length > 0 ? (
        <section className="card" style={{ marginTop: '1rem' }}>
          <h2>Budget perlu perhatian</h2>
          <ul className="list">
            {needsAttention.map((budget) => (
              <li key={budget.categoryId} style={{ display: 'block' }}>
                <div style={{ display: 'flex', gap: '0.7rem' }}>
                  <span className="grow">{budget.categoryName}</span>
                  <span className="amount">
                    {formatRupiah(budget.spentInt)} / {formatRupiah(budget.limitInt)}
                  </span>
                </div>
                <div className="bar">
                  <span
                    className={budget.ratio >= 1 ? 'over' : undefined}
                    style={{ width: `${Math.min(budget.ratio, 1) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Catat cepat</h2>
        <QuickEntry />
      </section>
    </Shell>
  );
}
