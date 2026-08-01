'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Hari ini' },
  { href: '/tasks', label: 'Task' },
  { href: '/finance', label: 'Finance' },
  { href: '/stats', label: 'Statistik' },
  { href: '/settings', label: 'Pengaturan' },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="nav">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          // aria-current dipakai sekaligus sebagai hook styling — satu sumber
          // kebenaran untuk "halaman aktif", dan pembaca layar ikut dapat.
          aria-current={pathname === link.href ? 'page' : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
