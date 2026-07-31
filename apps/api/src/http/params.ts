import type { Request } from 'express';
import { AppError } from './errors.js';

/**
 * Tipe `req.params` di Express 5 adalah `string | string[] | undefined` karena
 * route bisa punya wildcard berulang. Semua param di API ini tunggal, jadi
 * penyempitannya dilakukan di satu tempat.
 */
export function pathParam(req: Request, name: string): string {
  const value = (req.params as Record<string, string | string[] | undefined>)[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw AppError.notFound(`Parameter ${name} tidak valid`);
  }
  return value;
}
