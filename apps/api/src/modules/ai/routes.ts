import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db.js';
import { authOf, requireAuth } from '../../http/auth.js';
import { AppError } from '../../http/errors.js';
import { pathParam } from '../../http/params.js';
import { dropPending } from './pending.js';
import { confirmPending, handleMessage } from './service.js';

export const aiRouter: Router = Router();

aiRouter.use(requireAuth);

/** Satu endpoint natural language → intent → function call (§3.5). */
aiRouter.post('/message', async (req, res) => {
  const { userId } = authOf(req);
  const { text } = z.object({ text: z.string().min(1).max(2_000) }).parse(req.body);

  res.json({ ok: true, data: await handleMessage(userId, text) });
});

aiRouter.post('/confirm/:id', async (req, res) => {
  const { userId } = authOf(req);
  res.json({ ok: true, data: await confirmPending(userId, pathParam(req, 'id')) });
});

aiRouter.post('/reject/:id', async (req, res) => {
  const { userId } = authOf(req);
  const dropped = await dropPending(userId, pathParam(req, 'id'));
  if (!dropped) throw AppError.notFound('Aksi sudah kedaluwarsa atau sudah diproses');
  res.json({ ok: true, data: { rejected: true } });
});

// --- Memory terstruktur (§3.5) ----------------------------------------------

const factSchema = z.object({
  category: z.string().min(1).max(60),
  key: z.string().min(1).max(120),
  value: z.string().min(1).max(2_000),
  confidence: z.number().min(0).max(1).default(1),
  source: z.string().max(40).default('manual'),
});

aiRouter.get('/facts', async (req, res) => {
  const { userId } = authOf(req);
  const facts = await db.userFact.findMany({
    where: { userId },
    orderBy: [{ category: 'asc' }, { key: 'asc' }],
  });
  res.json({ ok: true, data: facts });
});

aiRouter.put('/facts', async (req, res) => {
  const { userId } = authOf(req);
  const input = factSchema.parse(req.body);

  const fact = await db.userFact.upsert({
    where: {
      userId_category_key: { userId, category: input.category, key: input.key },
    },
    create: { userId, ...input },
    update: { value: input.value, confidence: input.confidence, source: input.source },
  });

  res.json({ ok: true, data: fact });
});

aiRouter.delete('/facts/:id', async (req, res) => {
  const { userId } = authOf(req);
  const result = await db.userFact.deleteMany({ where: { id: pathParam(req, 'id'), userId } });
  if (result.count === 0) throw AppError.notFound('Fakta tidak ditemukan');
  res.json({ ok: true, data: { deleted: true } });
});

// --- Correction rules -------------------------------------------------------

const ruleSchema = z.object({
  pattern: z.string().min(1).max(200),
  field: z.string().min(1).max(60),
  value: z.string().min(1).max(200),
});

aiRouter.get('/rules', async (req, res) => {
  const { userId } = authOf(req);
  const rules = await db.correctionRule.findMany({
    where: { userId },
    orderBy: { hitCount: 'desc' },
  });
  res.json({ ok: true, data: rules });
});

aiRouter.put('/rules', async (req, res) => {
  const { userId } = authOf(req);
  const input = ruleSchema.parse(req.body);

  const rule = await db.correctionRule.upsert({
    where: {
      userId_pattern_field: { userId, pattern: input.pattern, field: input.field },
    },
    create: { userId, ...input },
    // Hit count sengaja tidak direset: aturan yang diubah nilainya tetap
    // aturan yang sama, dan riwayat pemakaiannya masih berguna untuk pruning.
    update: { value: input.value },
  });

  res.json({ ok: true, data: rule });
});

aiRouter.delete('/rules/:id', async (req, res) => {
  const { userId } = authOf(req);
  const result = await db.correctionRule.deleteMany({
    where: { id: pathParam(req, 'id'), userId },
  });
  if (result.count === 0) throw AppError.notFound('Aturan tidak ditemukan');
  res.json({ ok: true, data: { deleted: true } });
});

// --- Feedback loop ----------------------------------------------------------

aiRouter.post('/feedback', async (req, res) => {
  const { userId } = authOf(req);
  const input = z
    .object({
      actionType: z.string().min(1).max(60),
      verdict: z.enum(['up', 'down']),
      payload: z.record(z.string(), z.unknown()).default({}),
    })
    .parse(req.body);

  const feedback = await db.aiFeedback.create({
    data: {
      userId,
      actionType: input.actionType,
      verdict: input.verdict,
      // Kolom Json Prisma menolak Record<string, unknown>; isinya sudah
      // divalidasi zod dan berasal dari JSON, jadi aman diserialisasi ulang.
      payload: JSON.parse(JSON.stringify(input.payload)),
    },
  });

  res.status(201).json({ ok: true, data: feedback });
});
