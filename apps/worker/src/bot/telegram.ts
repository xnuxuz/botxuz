import { Bot } from 'grammy';
import { env, logger } from '../config.js';

/**
 * Long polling, bukan webhook — bot tidak butuh endpoint publik, jadi setup VPS
 * lebih sederhana (REQUIREMENT §5.1).
 *
 * Handler di sini hanya tipis: parse input, panggil API, format balasan.
 * Nol business logic di bot (§2).
 */
export function createTelegramBot(token: string): Bot {
  const bot = new Bot(token);

  bot.command('start', async (ctx) => {
    await ctx.reply(
      'Halo! Aku asisten xnuxuz.\n\n' +
        'Hubungkan akunmu dulu dengan:\n' +
        '/link <kode>\n\n' +
        'Kode bisa diambil dari web dashboard.',
    );
  });

  bot.command('link', async (ctx) => {
    const code = ctx.match?.trim();
    if (!code) {
      await ctx.reply('Formatnya: /link ABC123');
      return;
    }
    // TODO(fase 0): POST {API_BASE_URL}/api/v1/auth/telegram/link
    await ctx.reply('Fitur link belum aktif — menunggu modul auth.');
  });

  bot.catch((error) => {
    logger.error({ err: error.error, update: error.ctx.update.update_id }, 'Error di bot Telegram');
  });

  return bot;
}

export function startTelegramBot(): Bot | null {
  if (!env.TELEGRAM_BOT_TOKEN) {
    logger.warn('TELEGRAM_BOT_TOKEN kosong — bot tidak dijalankan');
    return null;
  }

  const bot = createTelegramBot(env.TELEGRAM_BOT_TOKEN);

  // start() tidak pernah resolve selama polling jalan, jadi sengaja tidak di-await.
  void bot.start({
    onStart: (info) => logger.info({ username: info.username }, 'Bot Telegram jalan (polling)'),
  });

  return bot;
}
