import { Router } from 'express';
import { z } from 'zod';
import { authOf, requireAuth } from '../../http/auth.js';
import { pathParam } from '../../http/params.js';
import {
  createAccount,
  getAccount,
  listAccounts,
  recalculateBalance,
  updateAccount,
} from './accounts.js';
import { checkBudgetAlerts, currentMonth, getBudgetStatus, upsertBudget } from './budgets.js';
import {
  createRecurring,
  deleteRecurring,
  listRecurring,
  setRecurringActive,
} from './recurring.js';
import { breakdown, cashflow, exportCsv, lastMonths } from './reports.js';
import {
  createAccountSchema,
  createRecurringSchema,
  createTransactionSchema,
  listTransactionSchema,
  monthSchema,
  updateAccountSchema,
  updateTransactionSchema,
  upsertBudgetSchema,
} from './schemas.js';
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
  restoreTransaction,
  updateTransaction,
} from './transactions.js';

// --- Akun -------------------------------------------------------------------

export const accountRouter: Router = Router();
accountRouter.use(requireAuth);

accountRouter.get('/', async (req, res) => {
  const { userId } = authOf(req);
  const { includeArchived } = z
    .object({ includeArchived: z.stringbool().default(false) })
    .parse(req.query);

  res.json({ ok: true, data: await listAccounts(userId, includeArchived) });
});

accountRouter.post('/', async (req, res) => {
  const { userId } = authOf(req);
  const account = await createAccount(userId, createAccountSchema.parse(req.body));
  res.status(201).json({ ok: true, data: account });
});

accountRouter.get('/:id', async (req, res) => {
  const { userId } = authOf(req);
  res.json({ ok: true, data: await getAccount(userId, pathParam(req, 'id')) });
});

accountRouter.patch('/:id', async (req, res) => {
  const { userId } = authOf(req);
  const account = await updateAccount(
    userId,
    pathParam(req, 'id'),
    updateAccountSchema.parse(req.body),
  );
  res.json({ ok: true, data: account });
});

/** Rekonsiliasi manual kalau saldo cache dicurigai meleset dari ledger. */
accountRouter.post('/:id/recalculate', async (req, res) => {
  const { userId } = authOf(req);
  res.json({ ok: true, data: await recalculateBalance(userId, pathParam(req, 'id')) });
});

// --- Transaksi --------------------------------------------------------------

export const transactionRouter: Router = Router();
transactionRouter.use(requireAuth);

transactionRouter.get('/', async (req, res) => {
  const { userId } = authOf(req);
  const query = listTransactionSchema.parse(req.query);
  const transactions = await listTransactions(userId, query);

  res.json({
    ok: true,
    data: transactions,
    meta: {
      nextCursor: transactions.length === query.limit ? transactions.at(-1)?.id : null,
    },
  });
});

transactionRouter.post('/', async (req, res) => {
  const { userId } = authOf(req);
  const input = createTransactionSchema.parse(req.body);
  const txn = await createTransaction(userId, input);

  // Alert dicek segera setelah pengeluaran, bukan menunggu job harian —
  // peringatan budget baru berguna kalau datang sebelum belanja berikutnya.
  if (input.type === 'expense') await checkBudgetAlerts(userId);

  res.status(201).json({ ok: true, data: txn });
});

transactionRouter.get('/:id', async (req, res) => {
  const { userId } = authOf(req);
  res.json({ ok: true, data: await getTransaction(userId, pathParam(req, 'id')) });
});

transactionRouter.patch('/:id', async (req, res) => {
  const { userId } = authOf(req);
  const txn = await updateTransaction(
    userId,
    pathParam(req, 'id'),
    updateTransactionSchema.parse(req.body),
  );
  res.json({ ok: true, data: txn });
});

transactionRouter.delete('/:id', async (req, res) => {
  const { userId } = authOf(req);
  await deleteTransaction(userId, pathParam(req, 'id'));
  res.json({ ok: true, data: { deleted: true } });
});

transactionRouter.post('/:id/restore', async (req, res) => {
  const { userId } = authOf(req);
  res.json({ ok: true, data: await restoreTransaction(userId, pathParam(req, 'id')) });
});

// --- Budget -----------------------------------------------------------------

export const budgetRouter: Router = Router();
budgetRouter.use(requireAuth);

budgetRouter.get('/', async (req, res) => {
  const { userId } = authOf(req);
  const { month } = z.object({ month: monthSchema.default(currentMonth()) }).parse(req.query);
  res.json({ ok: true, data: await getBudgetStatus(userId, month) });
});

budgetRouter.put('/', async (req, res) => {
  const { userId } = authOf(req);
  const budget = await upsertBudget(userId, upsertBudgetSchema.parse(req.body));
  res.json({ ok: true, data: budget });
});

// --- Recurring --------------------------------------------------------------

export const recurringRouter: Router = Router();
recurringRouter.use(requireAuth);

recurringRouter.get('/', async (req, res) => {
  const { userId } = authOf(req);
  res.json({ ok: true, data: await listRecurring(userId) });
});

recurringRouter.post('/', async (req, res) => {
  const { userId } = authOf(req);
  const row = await createRecurring(userId, createRecurringSchema.parse(req.body));
  res.status(201).json({ ok: true, data: row });
});

recurringRouter.patch('/:id', async (req, res) => {
  const { userId } = authOf(req);
  const { active } = z.object({ active: z.boolean() }).parse(req.body);
  res.json({ ok: true, data: await setRecurringActive(userId, pathParam(req, 'id'), active) });
});

recurringRouter.delete('/:id', async (req, res) => {
  const { userId } = authOf(req);
  await deleteRecurring(userId, pathParam(req, 'id'));
  res.json({ ok: true, data: { deleted: true } });
});

// --- Laporan ----------------------------------------------------------------

export const reportRouter: Router = Router();
reportRouter.use(requireAuth);

reportRouter.get('/cashflow', async (req, res) => {
  const { userId } = authOf(req);
  const { month, months } = z
    .object({
      month: monthSchema.default(currentMonth()),
      months: z.coerce.number().int().min(1).max(24).default(6),
    })
    .parse(req.query);

  res.json({ ok: true, data: await cashflow(userId, lastMonths(month, months)) });
});

reportRouter.get('/breakdown', async (req, res) => {
  const { userId } = authOf(req);
  const { month, type } = z
    .object({
      month: monthSchema.default(currentMonth()),
      type: z.enum(['income', 'expense']).default('expense'),
    })
    .parse(req.query);

  res.json({ ok: true, data: await breakdown(userId, month, type) });
});

reportRouter.get('/export.csv', async (req, res) => {
  const { userId } = authOf(req);
  const { from, to } = z
    .object({
      from: z.iso.datetime({ offset: true }),
      to: z.iso.datetime({ offset: true }),
    })
    .parse(req.query);

  const csv = await exportCsv(userId, new Date(from), new Date(to));

  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', 'attachment; filename="transaksi.csv"');
  res.send(csv);
});
