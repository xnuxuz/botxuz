import { Router } from 'express';
import { authOf, requireAuth } from '../../http/auth.js';
import { pathParam } from '../../http/params.js';
import { createEventSchema, scheduleQuerySchema, updateEventSchema } from './schemas.js';
import {
  createEvent,
  deleteEvent,
  findConflicts,
  getEvent,
  getSchedule,
  updateEvent,
} from './service.js';

export const eventRouter: Router = Router();

eventRouter.use(requireAuth);

/** View utama kalender: kemunculan konkret, RRULE sudah diekspansi. */
eventRouter.get('/schedule', async (req, res) => {
  const { userId } = authOf(req);
  const { from, to } = scheduleQuerySchema.parse(req.query);
  const occurrences = await getSchedule(userId, new Date(from), new Date(to));
  res.json({ ok: true, data: occurrences });
});

/** Cek bentrok tanpa menyimpan apa pun — dipakai form web sebelum submit. */
eventRouter.get('/conflicts', async (req, res) => {
  const { userId } = authOf(req);
  const { from, to } = scheduleQuerySchema.parse(req.query);
  const conflicts = await findConflicts(userId, new Date(from), new Date(to));
  res.json({ ok: true, data: conflicts });
});

eventRouter.get('/', async (req, res) => {
  const { userId } = authOf(req);
  const { from, to } = scheduleQuerySchema.parse(req.query);
  res.json({ ok: true, data: await getSchedule(userId, new Date(from), new Date(to)) });
});

eventRouter.post('/', async (req, res) => {
  const { userId } = authOf(req);
  const { event, conflicts } = await createEvent(userId, createEventSchema.parse(req.body));
  // Bentrok dilaporkan sebagai peringatan; event tetap dibuat (§3.2).
  res.status(201).json({ ok: true, data: event, meta: { conflicts } });
});

eventRouter.get('/:id', async (req, res) => {
  const { userId } = authOf(req);
  res.json({ ok: true, data: await getEvent(userId, pathParam(req, 'id')) });
});

eventRouter.patch('/:id', async (req, res) => {
  const { userId } = authOf(req);
  const { event, conflicts } = await updateEvent(
    userId,
    pathParam(req, 'id'),
    updateEventSchema.parse(req.body),
  );
  res.json({ ok: true, data: event, meta: { conflicts } });
});

eventRouter.delete('/:id', async (req, res) => {
  const { userId } = authOf(req);
  await deleteEvent(userId, pathParam(req, 'id'));
  res.json({ ok: true, data: { deleted: true } });
});
