import { NOTIF_TYPES, NOTIFICATION_CHANNELS } from '@xnuxuz/shared';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db.js';
import { authOf, requireAuth } from '../../http/auth.js';
import { pathParam } from '../../http/params.js';
import { updateProfileSchema } from '../auth/schemas.js';
import { toPublicUser } from '../auth/service.js';

// Anotasi eksplisit: tanpa ini tsc TS2742 karena tipe Router ada di paket transitif.
export const userRouter: Router = Router();

userRouter.use(requireAuth);

const userSelect = {
  id: true,
  email: true,
  displayName: true,
  timezone: true,
  telegramChatId: true,
  briefingMinute: true,
  briefingOn: true,
} as const;

userRouter.patch('/me', async (req, res) => {
  const { userId } = authOf(req);
  const input = updateProfileSchema.parse(req.body);

  const user = await db.user.update({
    where: { id: userId },
    data: input,
    select: userSelect,
  });

  res.json({ ok: true, data: toPublicUser(user) });
});

// --- Preferensi notifikasi (§3.6) -------------------------------------------

const notifPrefSchema = z.object({
  /** Urutan channel = urutan fallback. */
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)).min(1),
  /** Menit sejak tengah malam waktu lokal user; null = matikan quiet hours. */
  quietStartMinute: z.int().min(0).max(1439).nullable().optional(),
  quietEndMinute: z.int().min(0).max(1439).nullable().optional(),
});

const notifTypeSchema = z.enum(Object.values(NOTIF_TYPES));

userRouter.get('/notif-prefs', async (req, res) => {
  const { userId } = authOf(req);
  const prefs = await db.notificationPreference.findMany({
    where: { userId },
    orderBy: { notifType: 'asc' },
  });

  res.json({
    ok: true,
    data: prefs.map((pref) => ({
      notifType: pref.notifType,
      channels: pref.channelsJson,
      quietStartMinute: pref.quietStartMinute,
      quietEndMinute: pref.quietEndMinute,
    })),
  });
});

userRouter.put('/notif-prefs/:notifType', async (req, res) => {
  const { userId } = authOf(req);
  const notifType = notifTypeSchema.parse(pathParam(req, 'notifType'));
  const input = notifPrefSchema.parse(req.body);

  const data = {
    channelsJson: input.channels,
    quietStartMinute: input.quietStartMinute ?? null,
    quietEndMinute: input.quietEndMinute ?? null,
  };

  const pref = await db.notificationPreference.upsert({
    where: { userId_notifType: { userId, notifType } },
    create: { userId, notifType, ...data },
    update: data,
  });

  res.json({
    ok: true,
    data: {
      notifType: pref.notifType,
      channels: pref.channelsJson,
      quietStartMinute: pref.quietStartMinute,
      quietEndMinute: pref.quietEndMinute,
    },
  });
});
