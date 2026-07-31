import { TASK_PRIORITIES, TASK_STATUSES } from '@xnuxuz/shared';
import { z } from 'zod';

/**
 * Offset reminder dalam menit SEBELUM deadline (§3.2). Nilai 0 berarti tepat
 * saat deadline. Dibatasi 30 hari supaya tidak ada delayed job yang menganggur
 * berbulan-bulan di Redis.
 */
export const reminderOffsetsSchema = z
  .array(
    z
      .int()
      .min(0)
      .max(30 * 24 * 60),
  )
  .max(5)
  .optional();

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5_000).nullish(),
  categoryId: z.uuid().nullish(),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  deadline: z.iso.datetime({ offset: true }).nullish(),
  rrule: z.string().max(255).nullish(),
  reminderOffsets: reminderOffsetsSchema,
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  status: z.enum(TASK_STATUSES).optional(),
});

export const listTaskSchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  categoryId: z.uuid().optional(),
  /** Hanya task dengan deadline sebelum waktu ini — dipakai view "hari ini". */
  dueBefore: z.iso.datetime({ offset: true }).optional(),
  q: z.string().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.uuid().optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ListTaskQuery = z.infer<typeof listTaskSchema>;
