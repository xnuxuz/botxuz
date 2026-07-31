import { z } from 'zod';
import type { ToolDefinition } from './provider.js';

/**
 * Function schema minimal untuk intent router (REQUIREMENT §3.5).
 * Implementasi handler-nya ada di apps/api — di sini hanya kontraknya.
 */

export const createTaskArgs = z.object({
  title: z.string().min(1),
  category: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  deadline: z.iso.datetime().optional(),
});

export const createEventArgs = z.object({
  title: z.string().min(1),
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime().optional(),
  location: z.string().optional(),
  category: z.string().optional(),
});

export const createTransactionArgs = z.object({
  type: z.enum(['income', 'expense', 'transfer']),
  /** Integer rupiah — bukan float. */
  amount: z.int().positive(),
  category: z.string().optional(),
  account: z.string().optional(),
  note: z.string().optional(),
  occurredAt: z.iso.datetime().optional(),
});

export const getScheduleArgs = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export const getTasksArgs = z.object({
  status: z.enum(['todo', 'doing', 'done']).optional(),
  category: z.string().optional(),
});

export const getBalanceArgs = z.object({
  account: z.string().optional(),
});

export const getSpendingReportArgs = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  category: z.string().optional(),
});

export const logSessionArgs = z.object({
  category: z.string(),
  durationMinutes: z.int().positive(),
  taskTitle: z.string().optional(),
});

const SPECS = [
  ['createTask', 'Buat task baru untuk user', createTaskArgs],
  ['createEvent', 'Buat event/jadwal baru', createEventArgs],
  ['createTransaction', 'Catat transaksi keuangan', createTransactionArgs],
  ['getSchedule', 'Ambil jadwal user pada rentang tanggal', getScheduleArgs],
  ['getTasks', 'Ambil daftar task user', getTasksArgs],
  ['getBalance', 'Ambil saldo akun user', getBalanceArgs],
  ['getSpendingReport', 'Ambil laporan pengeluaran per kategori', getSpendingReportArgs],
  ['logSession', 'Catat sesi grinding/produktivitas', logSessionArgs],
] as const satisfies ReadonlyArray<readonly [string, string, z.ZodType]>;

/** Nama-nama tool yang dikenal router — dipakai untuk validasi tool call. */
export type ToolName = (typeof SPECS)[number][0];

/** Tool yang melakukan write — wajib konfirmasi user sebelum dieksekusi (§3.5). */
export const WRITE_TOOLS = new Set<ToolName>([
  'createTask',
  'createEvent',
  'createTransaction',
  'logSession',
]);

export function isWriteTool(name: string): boolean {
  return WRITE_TOOLS.has(name as ToolName);
}

export const TOOL_DEFINITIONS: ToolDefinition[] = SPECS.map(([name, description, schema]) => ({
  name,
  description,
  parameters: z.toJSONSchema(schema) as Record<string, unknown>,
}));
