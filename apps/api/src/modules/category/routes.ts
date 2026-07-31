import { type CategoryDomain, isUniqueViolation } from '@xnuxuz/db';
import { CATEGORY_DOMAINS } from '@xnuxuz/shared';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db.js';
import { authOf, requireAuth } from '../../http/auth.js';
import { AppError } from '../../http/errors.js';
import { pathParam } from '../../http/params.js';

export const categoryRouter: Router = Router();

categoryRouter.use(requireAuth);

const domainSchema = z.enum(CATEGORY_DOMAINS);

const createSchema = z.object({
  domain: domainSchema,
  name: z.string().min(1).max(60),
  /** Hex, ikut konvensi CSS supaya web/mobile bisa pakai langsung. */
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Warna harus hex seperti #3b82f6')
    .optional(),
  icon: z.string().max(32).optional(),
});

const updateSchema = createSchema.omit({ domain: true }).partial().extend({
  archived: z.boolean().optional(),
});

categoryRouter.get('/', async (req, res) => {
  const { userId } = authOf(req);
  const query = z
    .object({
      domain: domainSchema.optional(),
      includeArchived: z.stringbool().default(false),
    })
    .parse(req.query);

  const categories = await db.category.findMany({
    where: {
      userId,
      ...(query.domain ? { domain: query.domain as CategoryDomain } : {}),
      ...(query.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ domain: 'asc' }, { name: 'asc' }],
  });

  res.json({ ok: true, data: categories });
});

categoryRouter.post('/', async (req, res) => {
  const { userId } = authOf(req);
  const input = createSchema.parse(req.body);

  try {
    const category = await db.category.create({
      data: { ...input, domain: input.domain as CategoryDomain, userId },
    });
    res.status(201).json({ ok: true, data: category });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict(`Kategori "${input.name}" sudah ada di domain ${input.domain}`);
    }
    throw error;
  }
});

categoryRouter.patch('/:id', async (req, res) => {
  const { userId } = authOf(req);
  const id = pathParam(req, 'id');
  const { archived, ...rest } = updateSchema.parse(req.body);

  // updateMany + filter userId: satu query, dan mustahil menyentuh baris user lain.
  const result = await db.category.updateMany({
    where: { id, userId },
    data: {
      ...rest,
      ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
    },
  });

  if (result.count === 0) throw AppError.notFound('Kategori tidak ditemukan');

  res.json({ ok: true, data: await db.category.findUnique({ where: { id } }) });
});

/**
 * Kategori tidak dihapus keras: relasi task/transaksi memakai SetNull, jadi
 * menghapus akan membuat riwayat kehilangan konteks. Default-nya arsip.
 */
categoryRouter.delete('/:id', async (req, res) => {
  const { userId } = authOf(req);
  const id = pathParam(req, 'id');

  const result = await db.category.updateMany({
    where: { id, userId, archivedAt: null },
    data: { archivedAt: new Date() },
  });

  if (result.count === 0) throw AppError.notFound('Kategori tidak ditemukan atau sudah diarsip');

  res.json({ ok: true, data: { archived: true } });
});
