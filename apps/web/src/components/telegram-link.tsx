'use client';

import { useState, useTransition } from 'react';
import { issueTelegramCode } from '../app/actions';

/**
 * Kode ditampilkan sekali di layar dan tidak pernah dikirim ulang: masa
 * berlakunya 10 menit dan sekali pakai, jadi menyimpannya di state tidak
 * menambah risiko yang belum ada.
 */
export function TelegramLink({ linked }: { linked: boolean }) {
  const [code, setCode] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>
        {linked ? 'Akun Telegram sudah terhubung.' : 'Belum terhubung ke Telegram.'}
      </p>

      {code ? (
        <>
          <code className="code">{code}</code>
          <p className="muted" style={{ margin: 0 }}>
            Kirim <code>/link {code}</code> ke bot. Berlaku 10 menit.
          </p>
        </>
      ) : null}

      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            const result = await issueTelegramCode();
            setCode(result.code);
          })
        }
        disabled={pending}
      >
        {pending ? 'Membuat…' : code ? 'Buat kode baru' : 'Buat kode'}
      </button>
    </div>
  );
}
