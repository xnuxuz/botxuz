import { redirect } from 'next/navigation';
import { Shell } from '../../components/shell';
import { TelegramLink } from '../../components/telegram-link';
import { apiFetch, apiFetchSafe, SessionExpiredError } from '../../lib/server-api';
import type { User } from '../../lib/types';

export const dynamic = 'force-dynamic';

type Session = {
  id: string;
  device: string;
  ip: string;
  createdAt: string;
  lastUsedAt: string;
  current?: boolean;
};

type NotifPref = {
  notifType: string;
  channels: string[];
  quietStartMinute: number | null;
  quietEndMinute: number | null;
};

function hhmm(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export default async function SettingsPage() {
  let user: User;
  try {
    user = await apiFetch<User>('/auth/me');
  } catch (error) {
    if (error instanceof SessionExpiredError) redirect('/login');
    throw error;
  }

  const [sessions, prefs] = await Promise.all([
    apiFetchSafe<Session[]>('/auth/sessions', []),
    apiFetchSafe<NotifPref[]>('/user/notif-prefs', []),
  ]);

  return (
    <Shell>
      <div className="grid">
        <section className="card">
          <h2>Akun</h2>
          <ul className="list">
            <li>
              <span className="grow">Email</span>
              <span className="muted">{user.email}</span>
            </li>
            <li>
              <span className="grow">Zona waktu</span>
              <span className="muted">{user.timezone}</span>
            </li>
            <li>
              <span className="grow">Briefing pagi</span>
              <span className="muted">
                {user.briefingOn ? hhmm(user.briefingMinute) : 'nonaktif'}
              </span>
            </li>
          </ul>
        </section>

        <section className="card">
          <h2>Telegram</h2>
          <TelegramLink linked={user.telegramLinked} />
        </section>
      </div>

      <div className="grid" style={{ marginTop: '1rem' }}>
        <section className="card">
          <h2>Perangkat aktif</h2>
          {sessions.length === 0 ? (
            <p className="empty">Tidak ada sesi.</p>
          ) : (
            <ul className="list">
              {sessions.map((session) => (
                <li key={session.id}>
                  <span className="grow">
                    {session.device}
                    {session.current ? <span className="badge"> ini</span> : null}
                  </span>
                  <span className="when">{session.lastUsedAt.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="muted" style={{ marginBottom: 0 }}>
            Cabut perangkat lewat API <code>DELETE /auth/sessions/:id</code>.
          </p>
        </section>

        <section className="card">
          <h2>Notifikasi</h2>
          <ul className="list">
            {prefs.map((pref) => (
              <li key={pref.notifType}>
                <span className="grow">{pref.notifType}</span>
                <span className="muted">{pref.channels.join(' → ')}</span>
                {pref.quietStartMinute !== null && pref.quietEndMinute !== null ? (
                  <span className="when">
                    diam {hhmm(pref.quietStartMinute)}–{hhmm(pref.quietEndMinute)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Shell>
  );
}
