import { z } from 'zod';
import { reminderOffsetsSchema } from '../task/schemas.js';

export const createEventSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(5_000).nullish(),
    startAt: z.iso.datetime({ offset: true }),
    endAt: z.iso.datetime({ offset: true }),
    allDay: z.boolean().default(false),
    rrule: z.string().max(255).nullish(),
    location: z.string().max(200).nullish(),
    categoryId: z.uuid().nullish(),
    reminderOffsets: reminderOffsetsSchema,
  })
  .refine((value) => new Date(value.endAt) >= new Date(value.startAt), {
    message: 'endAt tidak boleh sebelum startAt',
    path: ['endAt'],
  });

export const updateEventSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5_000).nullish(),
  startAt: z.iso.datetime({ offset: true }).optional(),
  endAt: z.iso.datetime({ offset: true }).optional(),
  allDay: z.boolean().optional(),
  rrule: z.string().max(255).nullish(),
  location: z.string().max(200).nullish(),
  categoryId: z.uuid().nullish(),
  reminderOffsets: reminderOffsetsSchema,
});

export const scheduleQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
  })
  .refine(
    // Rentang dibatasi supaya ekspansi RRULE tidak bisa dipakai menghabiskan CPU.
    (value) => new Date(value.to).getTime() - new Date(value.from).getTime() <= 366 * 86_400_000,
    { message: 'Rentang maksimal 1 tahun', path: ['to'] },
  );

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
