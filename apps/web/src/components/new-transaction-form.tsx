'use client';

import { useActionState, useRef } from 'react';
import { createTransaction, type FormState } from '../app/actions';
import type { Account, Category } from '../lib/types';

const INITIAL: FormState = { error: null };

export function NewTransactionForm({
  accounts,
  categories,
}: {
  accounts: Account[];
  categories: Category[];
}) {
  const [state, action, pending] = useActionState(createTransaction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  if (accounts.length === 0) {
    return <p className="empty">Buat akun dulu sebelum mencatat transaksi.</p>;
  }

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
        <select name="type" defaultValue="expense" aria-label="Jenis">
          <option value="expense">Pengeluaran</option>
          <option value="income">Pemasukan</option>
        </select>

        {/* step=1 dan inputMode numeric: rupiah selalu bilangan bulat (§3.4). */}
        <input
          name="amountInt"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          placeholder="Nominal"
          aria-label="Nominal rupiah"
          required
        />

        <select name="accountId" aria-label="Akun">
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>

        <select name="categoryId" defaultValue="" aria-label="Kategori">
          <option value="">Tanpa kategori</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div className="row">
        <input
          name="note"
          placeholder="Catatan (opsional)"
          aria-label="Catatan"
          style={{ flex: 4 }}
        />
        <button type="submit" className="primary" disabled={pending} style={{ flex: 0 }}>
          {pending ? '…' : 'Simpan'}
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
