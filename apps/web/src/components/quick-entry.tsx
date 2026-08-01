'use client';

import { useActionState, useRef } from 'react';
import { askAssistant, type FormState } from '../app/actions';

const INITIAL: FormState = { error: null };

/**
 * Kotak natural language yang sama dengan yang dipakai bot (§3.4 quick entry).
 * Tanpa API key sekalipun, parser deterministik menangani pola umum seperti
 * "keluar 25rb makan siang gofood".
 */
export function QuickEntry() {
  const [state, action, pending] = useActionState(askAssistant, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await action(formData);
        formRef.current?.reset();
      }}
      className="stack"
    >
      <div className="row">
        <input
          name="text"
          placeholder="keluar 25rb makan siang gofood"
          aria-label="Catat transaksi atau perintah"
          required
          style={{ flex: 4 }}
        />
        <button type="submit" className="primary" disabled={pending} style={{ flex: 0 }}>
          {pending ? '…' : 'Catat'}
        </button>
      </div>

      {state.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
