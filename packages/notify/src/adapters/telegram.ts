import type { NotificationAdapter, NotificationPayload } from '@xnuxuz/shared';

export type TelegramRecipient = { telegramChatId: string | null };

/**
 * Adapter utama (§3.6). Sengaja memakai fetch langsung ke Bot API, bukan grammY:
 * package ini juga dipakai API yang tidak menjalankan bot, jadi tidak perlu
 * menarik seluruh runtime bot ke dalam image.
 */
export class TelegramAdapter implements NotificationAdapter {
  readonly channel = 'telegram' as const;

  constructor(
    private readonly token: string | undefined,
    private readonly resolveChatId: (userId: string) => Promise<string | null>,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  async send(userId: string, payload: NotificationPayload): Promise<void> {
    if (!this.token) throw new Error('TELEGRAM_BOT_TOKEN belum diset');

    const chatId = await this.resolveChatId(userId);
    if (!chatId) throw new Error('User belum menghubungkan akun Telegram');

    const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `*${escapeMarkdown(payload.title)}*\n${escapeMarkdown(payload.body)}`,
        parse_mode: 'MarkdownV2',
        // Inline keyboard konfirmasi AI dikirim lewat payload.data (§3.5).
        ...(payload.data?.replyMarkup ? { reply_markup: payload.data.replyMarkup } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Telegram API ${response.status}: ${detail.slice(0, 200)}`);
    }
  }
}

/** MarkdownV2 menolak pesan kalau ada karakter spesial yang tidak di-escape. */
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (char) => `\\${char}`);
}
