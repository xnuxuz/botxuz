import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramAdapter } from './telegram.js';

const payload = { idempotencyKey: 'k1', title: 'Rapat HME', body: 'Mulai 08.30 di Labtek VIII' };

function stubFetch(response: Partial<Response> = {}) {
  const fetchMock = vi.fn(
    async () => ({ ok: true, status: 200, text: async () => '', ...response }) as Response,
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function bodyOf(fetchMock: ReturnType<typeof stubFetch>): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
  return JSON.parse(init.body as string);
}

describe('TelegramAdapter', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('dianggap tidak terkonfigurasi saat token kosong', () => {
    expect(new TelegramAdapter(undefined, async () => '1').isConfigured()).toBe(false);
    expect(new TelegramAdapter('token', async () => '1').isConfigured()).toBe(true);
  });

  it('mengirim ke chat id hasil resolve, dengan token di URL', async () => {
    const fetchMock = stubFetch();
    await new TelegramAdapter('BOT123', async () => '55501').send('user-1', payload);

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.telegram.org/botBOT123/sendMessage');
    expect(bodyOf(fetchMock).chat_id).toBe('55501');
  });

  it('meng-escape karakter MarkdownV2 supaya pesan tidak ditolak Telegram', async () => {
    const fetchMock = stubFetch();
    await new TelegramAdapter('BOT123', async () => '1').send('user-1', {
      idempotencyKey: 'k',
      title: 'Budget 80% (Makan)',
      body: 'Sisa Rp1.250.000 - cek /today!',
    });

    const text = bodyOf(fetchMock).text as string;
    expect(text).toContain('Budget 80% \\(Makan\\)');
    expect(text).toContain('Rp1\\.250\\.000 \\- cek /today\\!');
    expect(bodyOf(fetchMock).parse_mode).toBe('MarkdownV2');
  });

  it('meneruskan inline keyboard dari payload.data', async () => {
    const fetchMock = stubFetch();
    const replyMarkup = { inline_keyboard: [[{ text: '✅', callback_data: 'ok' }]] };

    await new TelegramAdapter('BOT123', async () => '1').send('user-1', {
      ...payload,
      data: { replyMarkup },
    });

    expect(bodyOf(fetchMock).reply_markup).toEqual(replyMarkup);
  });

  it('gagal jelas saat user belum menghubungkan Telegram', async () => {
    stubFetch();
    await expect(
      new TelegramAdapter('BOT123', async () => null).send('user-1', payload),
    ).rejects.toThrow('belum menghubungkan akun Telegram');
  });

  it('melempar berisi status saat Bot API menolak', async () => {
    stubFetch({ ok: false, status: 403, text: async () => 'bot was blocked by the user' });

    await expect(
      new TelegramAdapter('BOT123', async () => '1').send('user-1', payload),
    ).rejects.toThrow('Telegram API 403: bot was blocked by the user');
  });
});
