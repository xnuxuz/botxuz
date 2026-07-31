import { DEFAULT_TIMEZONE } from '@xnuxuz/shared';
import { z } from 'zod';

export const registerSchema = z.object({
  email: z.email('Email tidak valid').max(255).toLowerCase(),
  // 10 karakter, bukan 8: ini akun tunggal pemilik data finance, bukan akun massal.
  password: z.string().min(10, 'Password minimal 10 karakter').max(200),
  displayName: z.string().min(1).max(100).optional(),
  timezone: z.string().min(1).max(64).default(DEFAULT_TIMEZONE),
});

export const loginSchema = z.object({
  email: z.email().max(255).toLowerCase(),
  password: z.string().min(1).max(200),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const telegramLinkSchema = z.object({
  code: z.string().min(4).max(12),
  telegramChatId: z.string().min(1).max(32),
});

export const updateProfileSchema = z
  .object({
    displayName: z.string().min(1).max(100).nullable(),
    timezone: z.string().min(1).max(64),
    briefingMinute: z.int().min(0).max(1439),
    briefingOn: z.boolean(),
  })
  .partial();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
