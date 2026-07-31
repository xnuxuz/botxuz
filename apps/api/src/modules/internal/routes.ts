import { Router } from 'express';
import { z } from 'zod';
import { requireInternalSecret } from '../../http/auth.js';
import { runDueBriefings } from '../briefing/service.js';
import { handleTelegramCommand } from '../telegram/commands.js';

/**
 * Endpoint yang hanya dipanggil worker/bot, bukan browser. Dilindungi shared
 * secret dan tidak pernah diekspos lewat Caddy (§2).
 */
export const internalRouter: Router = Router();

internalRouter.use(requireInternalSecret);

/** Dipanggil job terjadwal tiap 15 menit; API yang menentukan siapa yang jatuh tempo. */
internalRouter.post('/briefing/run', async (_req, res) => {
  res.json({ ok: true, data: await runDueBriefings() });
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
