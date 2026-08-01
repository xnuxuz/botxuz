import { redirect } from 'next/navigation';
import { NewTransactionForm } from '../../components/new-transaction-form';
import { Shell } from '../../components/shell';
import { TransactionRow } from '../../components/transaction-row';
import { formatRupiah, shortDate } from '../../lib/format';
import { apiFetch, apiFetchSafe, SessionExpiredError } from '../../lib/server-api';
import type {
  Account,
  Breakdown,
  BudgetStatus,
  Cashflow,
  Category,
  Transaction,
  User,
} from '../../lib/types';

export const dynamic = 'force-dynamic';

export default async function FinancePage() {
  let user: User;
  try {
    user = await apiFetch<User>('/auth/me');
  } catch (error) {
    if (error instanceof SessionExpiredError) redirect('/login');
    throw error;
  }

  const [accounts, categories, transactions, budgets, cashflow, breakdown] = await Promise.all([
    apiFetchSafe<Account[]>('/accounts', []),
    apiFetchSafe<Category[]>('/categories?domain=finance', []),
    apiFetchSafe<Transaction[]>('/transactions?limit=25', []),
    apiFetchSafe<BudgetStatus[]>('/budgets', []),
    apiFetchSafe<Cashflow[]>('/reports/cashflow?months=6', []),
    apiFetchSafe<Breakdown[]>('/reports/breakdown', []),
  ]);

  const nameOf = new Map(categories.map((category) => [category.id, category.name]));
  const accountOf = new Map(accounts.map((account) => [account.id, account.name]));
  const peak = Math.max(...cashflow.map((row) => Math.max(row.incomeInt, row.expenseInt)), 1);

  return (
    <Shell>
      <div className="grid">
        {accounts.map((account) => (
          <section className="card" key={account.id}>
            <h2>{account.name}</h2>
            <p className="stat">{formatRupiah(account.balanceCached)}</p>
            <p className="stat-sub">{account.type}</p>
          </section>
        ))}
      </div>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Catat transaksi</h2>
        <NewTransactionForm accounts={accounts} categories={categories} />
      </section>

      <div className="grid" style={{ marginTop: '1rem' }}>
        <section className="card">
          <h2>Transaksi terakhir</h2>
          {transactions.length === 0 ? (
            <p className="empty">Belum ada transaksi.</p>
          ) : (
            <ul className="list">
              {transactions.map((txn) => (
                <TransactionRow
                  key={txn.id}
                  txn={txn}
                  timezone={user.timezone}
                  categoryName={txn.categoryId ? (nameOf.get(txn.categoryId) ?? null) : null}
                  accountName={accountOf.get(txn.accountId) ?? ''}
                />
              ))}
            </ul>
          )}
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <section className="card">
            <h2>Budget bulan ini</h2>
            {budgets.length === 0 ? (
              <p className="empty">Belum ada budget.</p>
            ) : (
              <ul className="list">
                {budgets.map((budget) => (
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
            )}
          </section>

          <section className="card">
            <h2>Pengeluaran per kategori</h2>
            {breakdown.length === 0 ? (
              <p className="empty">Belum ada pengeluaran bulan ini.</p>
            ) : (
              <ul className="list">
                {breakdown.slice(0, 6).map((row) => (
                  <li key={row.categoryId ?? 'none'} style={{ display: 'block' }}>
                    <div style={{ display: 'flex', gap: '0.7rem' }}>
                      <span className="grow">{row.name ?? 'Tanpa kategori'}</span>
                      <span className="amount">{formatRupiah(row.amountInt)}</span>
                    </div>
                    <div className="bar">
                      <span style={{ width: `${row.share * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Arus kas 6 bulan</h2>
        <ul className="list">
          {cashflow.map((row) => (
            <li key={row.month} style={{ display: 'block' }}>
              <div style={{ display: 'flex', gap: '0.7rem' }}>
                <span className="when">{`${row.month}`.replace(/^(\d{4})(\d{2})$/, '$2/$1')}</span>
                <span className="grow" />
                <span className="amount in">+{formatRupiah(row.incomeInt)}</span>
                <span className="amount out">−{formatRupiah(row.expenseInt)}</span>
              </div>
              {/* Dua bar berbagi skala yang sama supaya tingginya bisa dibandingkan antar-bulan. */}
              <div className="bar">
                <span
                  style={{
                    width: `${(row.incomeInt / peak) * 100}%`,
                    background: 'var(--success)',
                  }}
                />
              </div>
              <div className="bar">
                <span
                  style={{
                    width: `${(row.expenseInt / peak) * 100}%`,
                    background: 'var(--danger)',
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
        <p className="muted" style={{ marginBottom: 0 }}>
          Bulan berjalan sampai {shortDate(new Date(), user.timezone)}.
        </p>
      </section>
    </Shell>
  );
}
