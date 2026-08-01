import type { ReactNode } from 'react';
import { logout } from '../app/actions';
import { Nav } from './nav';

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">xnuxuz</span>
        <Nav />
        {/* Form, bukan tombol onClick: logout harus jalan tanpa JavaScript. */}
        <form action={logout}>
          <button type="submit" className="link">
            Keluar
          </button>
        </form>
      </header>
      {children}
    </div>
  );
}
