import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { env } from '../config/env.js';
import { isSessionActive } from '../modules/auth/session-store.js';
import { verifyAccessToken } from '../modules/auth/tokens.js';
import { AppError } from './errors.js';

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; sessionId: string };
    }
  }
}

function bearerToken(req: Request): string | null {
  const header = req.get('authorization');
  if (!header?.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Selain memverifikasi tanda tangan JWT, sesi dicek ke Redis. Tanpa itu,
 * "revoke device" tidak berefek sampai access token kedaluwarsa sendiri.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = bearerToken(req);
  if (!token) {
    next(AppError.unauthorized('Header Authorization: Bearer <token> diperlukan'));
    return;
  }

  verifyAccessToken(token)
    .then(async (claims) => {
      if (!(await isSessionActive(claims.sub, claims.sid))) {
        throw AppError.unauthorized('Sesi sudah dicabut, silakan login ulang');
      }
      req.auth = { userId: claims.sub, sessionId: claims.sid };
      next();
    })
    .catch(next);
};

/** Dipakai handler setelah requireAuth — melempar kalau middleware-nya lupa dipasang. */
export function authOf(req: Request): { userId: string; sessionId: string } {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
}

/**
 * Endpoint internal (dipanggil worker/bot, bukan browser) diproteksi shared
 * secret. Bot bertindak atas nama chat Telegram yang belum punya sesi user,
 * jadi JWT tidak bisa dipakai di sini.
 */
export function requireInternalSecret(req: Request, _res: Response, next: NextFunction): void {
  const provided = req.get('x-internal-secret') ?? '';
  const expected = env.INTERNAL_API_SECRET;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    next(AppError.forbidden('Secret internal tidak cocok'));
    return;
  }
  next();
}
