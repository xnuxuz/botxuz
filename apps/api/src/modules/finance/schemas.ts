import { ACCOUNT_TYPES, TRANSACTION_TYPES } from '@xnuxuz/shared';
import { z } from 'zod';

/**
 * Rupiah selalu INTEGER dan selalu positif; arah uang ditentukan `type`
 * (REQUIREMENT §3.4). Batas atas ~2,1 miliar mengikuti INT MySQL — cukup untuk
 * penggunaan personal dan menjaga kolomnya tetap 4 byte.
 */
export const rupiahSchema = z
  .int()
  .positive('Nominal harus lebih dari 0')
  .max(2_000_000_000, 'Nominal terlalu besar');

export const createAccountSchema = z.object({
  name: z.string().min(1).max(60),
  type: z.enum(ACCOUNT_TYPES),
  /** Saldo awal; dicatat sebagai transaksi income supaya ledger tetap seimbang. */
  openingBalance: z.int().min(0).max(2_000_000_000).default(0),
});

export const updateAccountSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  archived: z.boolean().optional(),
});

export const createTransactionSchema = z
  .object({
    accountId: z.uuid(),
    type: z.enum(TRANSACTION_TYPES),
    amountInt: rupiahSchema,
    categoryId: z.uuid().nullish(),
    note: z.string().max(500).nullish(),
    occurredAt: z.iso.datetime({ offset: true }).optional(),
    transferAccountId: z.uuid().nullish(),
    /** Id dari client offline-first; insert dengan id yang sama tidak dobel. */
    clientGeneratedId: z.string().min(1).max(64).nullish(),
  })
  .refine((value) => value.type !== 'transfer' || Boolean(value.transferAccountId), {
    message: 'Transfer wajib menyebutkan transferAccountId',
    path: ['transferAccountId'],
  })
  .refine((value) => value.accountId !== value.transferAccountId, {
    message: 'Akun asal dan tujuan tidak boleh sama',
    path: ['transferAccountId'],
  });

export const updateTransactionSchema = z.object({
  amountInt: rupiahSchema.optional(),
  categoryId: z.uuid().nullish(),
  note: z.string().max(500).nullish(),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
});

export const listTransactionSchema = z.object({
  accountId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  q: z.string().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.uuid().optional(),
});

/** Bulan sebagai yyyymm — tidak ambigu timezone, mudah di-range-query. */
export const monthSchema = z.coerce
  .number()
  .int()
  .min(200_001)
  .max(999_912)
  .refine((value) => value % 100 >= 1 && value % 100 <= 12, {
    message: 'Bulan harus 01–12, format yyyymm',
  });

export const upsertBudgetSchema = z.object({
  categoryId: z.uuid(),
  month: monthSchema,
  limitInt: rupiahSchema,
});

export const createRecurringSchema = z.object({
  accountId: z.uuid(),
  categoryId: z.uuid().nullish(),
  type: z.enum(TRANSACTION_TYPES).exclude(['transfer']),
  amountInt: rupiahSchema,
  note: z.string().max(500).nullish(),
  rrule: z.string().min(1).max(255),
  startAt: z.iso.datetime({ offset: true }),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type ListTransactionQuery = z.infer<typeof listTransactionSchema>;
export type CreateRecurringInput = z.infer<typeof createRecurringSchema>;
