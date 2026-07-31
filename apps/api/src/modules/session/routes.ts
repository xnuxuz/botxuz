import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db.js';
import { authOf, requireAuth } from '../../http/auth.js';
import { AppError } from '../../http/errors.js';
import { pathParam } from '../../http/params.js';
import { assertCategoryOwned } from '../category/ownership.js';
import {
  deleteSession,
  getRunningSession,
  listSessions,
  logSession,
  startSession,
  stopSession,
} from './service.js';
import { getStats } from './stats.js';

export const sessionRouter: Router = Router();

sessionRouter.use(requireAuth);

const startSchema = z.object({
  taskId: z.uuid().nullish(),
  categoryId: z.uuid().nullish(),
  note: z.string().max(500).nullish(),
});

const manualSchema = startSchema.extend({
  startedAt: z.iso.datetime({ offset: true }),
  endedAt: z.iso.datetime({ offset: true }),
});

sessionRouter.get('/', async (req, res) => {
  const { userId } = authOf(req);
  const query = z
    .object({
      from: z.iso.datetime({ offset: true }).optional(),
      to: z.iso.datetime({ offset: true }).optional(),
      categoryId: z.uuid().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    })
    .parse(req.query);

  res.json({ ok: true, data: await listSessions(userId, query) });
});

/** Sesi yang sedang berjalan — dipakai UI untuk menampilkan timer. */
sessionRouter.get('/running', async (req, res) => {
  const { userId } = authOf(req);
  res.json({ ok: true, data: await getRunningSession(userId) });
});

sessionRouter.get('/stats', async (req, res) => {
  const { userId } = authOf(req);
  res.json({ ok: true, data: await getStats(userId) });
});

sessionRouter.post('/start', async (req, res) => {
  const { userId } = authOf(req);
  const session = await startSession(userId, startSchema.parse(req.body));
  res.status(201).json({ ok: true, data: session });
});

sessionRouter.post('/stop', async (req, res) => {
  const { userId } = authOf(req);
  const { note } = z.object({ note: z.string().max(500).nullish() }).parse(req.body ?? {});
  res.json({ ok: true, data: await stopSession(userId, note) });
});

sessionRouter.post('/', async (req, res) => {
  const { userId } = authOf(req);
  const session = await logSession(userId, manualSchema.parse(req.body));
  res.status(201).json({ ok: true, data: session });
});

sessionRouter.delete('/:id', async (req, res) => {
  const { userId } = authOf(req);
  await deleteSession(userId, pathParam(req, 'id'));
  res.json({ ok: true, data: { deleted: true } });
});

// --- Goal jam mingguan per kategori (§3.3) ----------------------------------

export const goalRouter: Router = Router();

goalRouter.use(requireAuth);

goalRouter.get('/', async (req, res) => {
  const { userId } = authOf(req);
  const goals = await db.goal.findMany({
    where: { userId },
    include: { category: { select: { name: true } } },
  });
  res.json({ ok: true, data: goals });
});

goalRouter.put('/:categoryId', async (req, res) => {
  const { userId } = authOf(req);
  const categoryId = pathParam(req, 'categoryId');
  const { targetMinutesWeekly } = z
    .object({
      targetMinutesWeekly: z
        .int()
        .min(0)
        .max(7 * 24 * 60),
    })
    .parse(req.body);

  await assertCategoryOwned(userId, categoryId, 'task');

  const goal = await db.goal.upsert({
    where: { userId_categoryId: { userId, categoryId } },
    create: { userId, categoryId, targetMinutesWeekly },
    update: { targetMinutesWeekly },
  });

  res.json({ ok: true, data: goal });
});

goalRouter.delete('/:categoryId', async (req, res) => {
  const { userId } = authOf(req);
  const result = await db.goal.deleteMany({
    where: { userId, categoryId: pathParam(req, 'categoryId') },
  });
  if (result.count === 0) throw AppError.notFound('Goal tidak ditemukan');
  res.json({ ok: true, data: { deleted: true } });
});
