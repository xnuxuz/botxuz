import { type Request, Router } from 'express';
import { authOf, requireAuth, requireInternalSecret } from '../../http/auth.js';
import { AppError } from '../../http/errors.js';
import { pathParam } from '../../http/params.js';
import { authRateLimit } from '../../http/rate-limit.js';
import { loginSchema, refreshSchema, registerSchema, telegramLinkSchema } from './schemas.js';
import {
  getUser,
  linkTelegram,
  login,
  logout,
  type RequestMeta,
  refresh,
  register,
  unlinkTelegram,
} from './service.js';
import { listSessions, revokeSession } from './session-store.js';
import { consumeLinkCode, issueLinkCode } from './telegram-link.js';

/** Metadata device dipakai di layar "perangkat aktif", bukan untuk keamanan. */
function metaOf(req: Request): RequestMeta {
  return {
    device: (req.get('user-agent') ?? 'unknown').slice(0, 200),
    ip: req.ip ?? '',
  };
}

// Anotasi eksplisit: tanpa ini tsc TS2742 karena tipe Router ada di paket transitif.
export const authRouter: Router = Router();

// Rate limit ketat khusus endpoint kredensial (§5.2).
authRouter.post('/register', authRateLimit, async (req, res) => {
  const input = registerSchema.parse(req.body);
  const result = await register(input, metaOf(req));
  res.status(201).json({ ok: true, data: result });
});

authRouter.post('/login', authRateLimit, async (req, res) => {
  const input = loginSchema.parse(req.body);
  const result = await login(input, metaOf(req));
  res.json({ ok: true, data: result });
});

authRouter.post('/refresh', authRateLimit, async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  const tokens = await refresh(refreshToken, metaOf(req));
  res.json({ ok: true, data: tokens });
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  const { userId, sessionId } = authOf(req);
  await logout(userId, sessionId);
  res.json({ ok: true, data: { revoked: true } });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const { userId } = authOf(req);
  res.json({ ok: true, data: await getUser(userId) });
});

// --- Device management (§3.1) ----------------------------------------------

authRouter.get('/sessions', requireAuth, async (req, res) => {
  const { userId, sessionId } = authOf(req);
  res.json({ ok: true, data: await listSessions(userId, sessionId) });
});

authRouter.delete('/sessions/:id', requireAuth, async (req, res) => {
  const { userId } = authOf(req);
  const removed = await revokeSession(userId, pathParam(req, 'id'));
  if (!removed) throw AppError.notFound('Sesi tidak ditemukan');
  res.json({ ok: true, data: { revoked: true } });
});

// --- Link Telegram (§3.1) ---------------------------------------------------

/** User menekan tombol di web/mobile untuk mendapat kode. */
authRouter.post('/telegram/code', requireAuth, async (req, res) => {
  const { userId } = authOf(req);
  res.json({ ok: true, data: await issueLinkCode(userId) });
});

/**
 * Dipanggil worker setelah user mengetik `/link ABC123` di bot. Bukan endpoint
 * publik: butuh secret internal, bukan JWT.
 */
authRouter.post('/telegram/link', requireInternalSecret, async (req, res) => {
  const { code, telegramChatId } = telegramLinkSchema.parse(req.body);

  const userId = await consumeLinkCode(code);
  if (!userId) throw AppError.notFound('Kode tidak valid atau sudah kedaluwarsa');

  const user = await linkTelegram(userId, telegramChatId);
  res.json({ ok: true, data: user });
});

authRouter.delete('/telegram/link', requireAuth, async (req, res) => {
  const { userId } = authOf(req);
  res.json({ ok: true, data: await unlinkTelegram(userId) });
});
