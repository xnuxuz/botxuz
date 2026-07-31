import { Bot } from 'grammy';
import { ApiError, linkTelegramAccount, sendTelegramCommand } from '../api-client.js';
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
        'Kode bisa diambil dari web dashboard (berlaku 10 menit).',
    );
  });

  bot.command('link', async (ctx) => {
    const code = ctx.match?.trim();
    if (!code) {
      await ctx.reply('Formatnya: /link ABC123');
      return;
    }

    const chatId = String(ctx.chat.id);

    try {
      const user = await linkTelegramAccount(code, chatId);
      await ctx.reply(`Akun ${user.displayName ?? user.email} berhasil terhubung. 🎉`);
    } catch (error) {
      if (error instanceof ApiError) {
        // Pesan API sudah ramah user (kode kedaluwarsa, chat sudah dipakai, dst.).
        await ctx.reply(`Gagal menghubungkan: ${error.message}`);
        return;
      }
      logger.error({ err: error }, 'Gagal memanggil API saat /link');
      await ctx.reply('Server sedang tidak bisa dihubungi. Coba lagi sebentar lagi.');
    }
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      'Perintah yang tersedia:\n' +
        '/link <kode> — hubungkan akun\n' +
        '/today — briefing hari ini\n' +
        '/tasks — daftar task terbuka\n' +
        '/task <judul> — buat task baru\n' +
        '/done <nomor> — tandai task selesai\n' +
        '/help — bantuan\n\n' +
        'Perintah finance menyusul di fase berikutnya.',
    );
  });

  // Perintah berikut hanya meneruskan ke API dan menampilkan balasannya —
  // nol business logic di bot (§2).
  for (const command of ['today', 'tasks', 'task', 'done'] as const) {
    bot.command(command, async (ctx) => {
      try {
        const reply = await sendTelegramCommand(
          String(ctx.chat.id),
          command,
          ctx.match?.trim() ?? '',
        );
        await ctx.reply(reply.text);
      } catch (error) {
        if (error instanceof ApiError) {
          await ctx.reply(`Gagal: ${error.message}`);
          return;
        }
        logger.error({ err: error, command }, 'Gagal memanggil API');
        await ctx.reply('Server sedang tidak bisa dihubungi. Coba lagi sebentar lagi.');
      }
    });
  }

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
