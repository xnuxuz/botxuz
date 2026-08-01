import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db.js';
import { requireInternalSecret } from '../../http/auth.js';
import { runDueReviews } from '../briefing/review.js';
import { runDueBriefings } from '../briefing/service.js';
import { checkBudgetAlerts, currentMonth } from '../finance/budgets.js';
import { runDueRecurring } from '../finance/recurring.js';
import {
  handleTelegramCallback,
  handleTelegramCommand,
  handleTelegramMessage,
} from '../telegram/commands.js';

/**
 * Endpoint yang hanya dipanggil worker/bot, bukan browser. Dilindungi shared
 * secret dan tidak pernah diekspos lewat Caddy (§2).
 */
export const internalRouter: Router = Router();

internalRouter.use(requireInternalSecret);

/**
 * Dipanggil job terjadwal tiap 15 menit; API yang menentukan siapa yang jatuh
 * tempo. Satu sweep menangani briefing pagi dan review malam sekaligus —
 * keduanya dipicu oleh jam lokal user, jadi kadensnya harus sama.
 */
internalRouter.post('/briefing/run', async (_req, res) => {
  const [briefings, reviews] = await Promise.all([runDueBriefings(), runDueReviews()]);
  res.json({ ok: true, data: { sent: briefings.sent, reviews: reviews.sent } });
});

/**
 * Job harian finance: eksekusi recurring yang jatuh tempo, lalu cek ambang
 * budget semua user. Urutannya penting — transaksi recurring bisa jadi justru
 * yang menembus batas budget.
 */
internalRouter.post('/finance/run', async (_req, res) => {
  const recurring = await runDueRecurring();

  const users = await db.budget.findMany({
    where: { month: currentMonth() },
    select: { userId: true },
    distinct: ['userId'],
  });

  let alerts = 0;
  for (const { userId } of users) alerts += await checkBudgetAlerts(userId);

  res.json({ ok: true, data: { ...recurring, alerts } });
});

const commandSchema = z.object({
  telegramChatId: z.string().min(1).max(32),
  command: z.string().min(1).max(32),
  args: z.string().max(500).default(''),
});

/**
 * Bot mengirim perintah mentah ke sini dan hanya menampilkan balasannya —
 * seluruh business logic tetap di API (§2).
 */
internalRouter.post('/telegram/command', async (req, res) => {
  const input = commandSchema.parse(req.body);
  const reply = await handleTelegramCommand(input);
  res.json({ ok: true, data: reply });
});

/** Pesan bebas (bukan /perintah) diteruskan ke intent router AI. */
internalRouter.post('/telegram/message', async (req, res) => {
  const input = z
    .object({
      telegramChatId: z.string().min(1).max(32),
      text: z.string().min(1).max(2_000),
    })
    .parse(req.body);

  res.json({ ok: true, data: await handleTelegramMessage(input) });
});

/** Tombol inline ✅ / ❌ pada kartu konfirmasi. */
internalRouter.post('/telegram/callback', async (req, res) => {
  const input = z
    .object({
      telegramChatId: z.string().min(1).max(32),
      action: z.enum(['confirm', 'reject']),
      pendingId: z.string().min(1).max(64),
    })
    .parse(req.body);

  res.json({ ok: true, data: await handleTelegramCallback(input) });
});
