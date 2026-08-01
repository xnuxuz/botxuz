'use client';

import { useActionState } from 'react';
import { type FormState, login } from '../actions';

const INITIAL: FormState = { error: null };

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, INITIAL);

  return (
    <main className="center">
      <div className="card">
        <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.15rem' }}>xnuxuz</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Masuk untuk melihat jadwal, task, dan keuangan.
        </p>

        <form action={action} className="stack">
          <label>
            <span className="muted">Email</span>
            <input name="email" type="email" required autoComplete="username" />
          </label>

          <label>
            <span className="muted">Password</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              minLength={10}
            />
          </label>

          {state.error ? (
            <p className="error" role="alert">
              {state.error}
            </p>
          ) : null}

          <button type="submit" className="primary" disabled={pending}>
            {pending ? 'Memproses…' : 'Masuk'}
          </button>
        </form>
      </div>
    </main>
  );
}
