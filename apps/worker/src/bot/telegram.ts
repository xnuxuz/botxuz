import { Bot, type Bot as BotType, InlineKeyboard } from 'grammy';
import {
  ApiError,
  type BotReply,
  linkTelegramAccount,
  sendTelegramCallback,
  sendTelegramCommand,
  sendTelegramMessage,
} from '../api-client.js';
import { env, logger } from '../config.js';

/**
 * Long polling, bukan webhook — bot tidak butuh endpoint publik, jadi setup VPS
 * lebih sederhana (REQUIREMENT §5.1).
 *
 * Handler di sini hanya tipis: parse input, panggil API, format balasan.
 * Nol business logic di bot (§2).
 */

const COMMANDS = ['today', 'tasks', 'task', 'done'] as const;

/** Tombol konfirmasi aksi write dari AI (§3.5). */
function confirmKeyboard(pendingId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Simpan', `ok:${pendingId}`)
    .text('❌ Batal', `no:${pendingId}`);
}

async function reply(
  ctx: { reply: (text: string, extra?: object) => Promise<unknown> },
  data: BotReply,
) {
  await ctx.reply(
    data.text,
    data.confirm ? { reply_markup: confirmKeyboard(data.confirm.pendingId) } : undefined,
  );
}

/** Semua error jaringan/API berakhir sebagai pesan yang bisa dibaca user. */
async function guard(
  ctx: { reply: (text: string, extra?: object) => Promise<unknown> },
  action: () => Promise<BotReply>,
): Promise<void> {
  try {
    await reply(ctx, await action());
  } catch (error) {
    if (error instanceof ApiError) {
      await ctx.reply(`Gagal: ${error.message}`);
      return;
    }
    logger.error({ err: error }, 'Gagal memanggil API');
    await ctx.reply('Server sedang tidak bisa dihubungi. Coba lagi sebentar lagi.');
  }
}

export function createTelegramBot(token: string): BotType {
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

    try {
      const user = await linkTelegramAccount(code, String(ctx.chat.id));
      await ctx.reply(`Akun ${user.displayName ?? user.email} berhasil terhubung. 🎉`);
    } catch (error) {
      if (error instanceof ApiError) {
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
        'Atau ketik biasa saja, misalnya: "keluar 25rb makan siang gofood".',
    );
  });

  for (const command of COMMANDS) {
    bot.command(command, (ctx) =>
      guard(ctx, () => sendTelegramCommand(String(ctx.chat.id), command, ctx.match?.trim() ?? '')),
    );
  }

  // Tombol konfirmasi. callback_data dibatasi 64 byte oleh Telegram, jadi
  // prefiksnya sependek mungkin: "ok:" / "no:" + uuid.
  bot.on('callback_query:data', async (ctx) => {
    const [prefix, pendingId] = ctx.callbackQuery.data.split(':');
    if (!pendingId || (prefix !== 'ok' && prefix !== 'no')) {
      await ctx.answerCallbackQuery('Tombol tidak dikenal');
      return;
    }

    await ctx.answerCallbackQuery();
    // Tombol dilepas supaya tidak bisa ditekan dua kali.
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);

    await guard(ctx, () =>
      sendTelegramCallback(
        String(ctx.chat?.id ?? ''),
        prefix === 'ok' ? 'confirm' : 'reject',
        pendingId,
      ),
    );
  });

  // Pesan bebas (bukan perintah) diteruskan ke intent router AI.
  bot.on('message:text', (ctx) =>
    guard(ctx, () => sendTelegramMessage(String(ctx.chat.id), ctx.message.text)),
  );

  bot.catch((error) => {
    logger.error({ err: error.error, update: error.ctx.update.update_id }, 'Error di bot Telegram');
  });

  return bot;
}

export function startTelegramBot(): BotType | null {
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
