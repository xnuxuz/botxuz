import { deleteTransaction } from '../app/actions';
import { formatRupiah, shortDate } from '../lib/format';
import type { Transaction } from '../lib/types';

export function TransactionRow({
  txn,
  timezone,
  categoryName,
  accountName,
}: {
  txn: Transaction;
  timezone: string;
  categoryName: string | null;
  accountName: string;
}) {
  const incoming = txn.type === 'income';

  return (
    <li>
      <span className="when">{shortDate(txn.occurredAt, timezone)}</span>

      <span className="grow">
        {categoryName ?? txn.note ?? txn.type}
        <span className="muted"> · {accountName}</span>
        {categoryName && txn.note ? <span className="muted"> · {txn.note}</span> : null}
      </span>

      <span className={`amount ${incoming ? 'in' : 'out'}`}>
        {incoming ? '+' : '−'}
        {formatRupiah(txn.amountInt)}
      </span>

      {/* Soft delete di server — riwayatnya tetap tersimpan (§3.4). */}
      <form action={deleteTransaction.bind(null, txn.id)}>
        <button type="submit" className="link" title="Hapus" aria-label="Hapus transaksi">
          ×
        </button>
      </form>
    </li>
  );
}
