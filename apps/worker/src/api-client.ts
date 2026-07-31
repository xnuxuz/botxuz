import { API_PREFIX, type ApiResponse } from '@xnuxuz/shared';
import { env } from './config.js';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Worker & bot tidak pernah menulis DB untuk logic bisnis — semuanya lewat API
 * (REQUIREMENT §2). Endpoint internal diautentikasi shared secret karena bot
 * bertindak untuk chat Telegram yang belum punya sesi user.
 */
async function request<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${env.API_BASE_URL}${API_PREFIX}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-secret': env.INTERNAL_API_SECRET,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  const payload = (await response.json()) as ApiResponse<T>;

  if (!payload.ok) {
    throw new ApiError(response.status, payload.error.code, payload.error.message);
  }

  return payload.data;
}

export type LinkedUser = { id: string; email: string; displayName: string | null };

export function linkTelegramAccount(code: string, telegramChatId: string): Promise<LinkedUser> {
  return request<LinkedUser>('/auth/telegram/link', { code, telegramChatId });
}

export function runDueBriefings(): Promise<{ sent: number }> {
  return request<{ sent: number }>('/internal/briefing/run', {});
}

export function sendTelegramCommand(
  telegramChatId: string,
  command: string,
  args: string,
): Promise<{ text: string }> {
  return request<{ text: string }>('/internal/telegram/command', {
    telegramChatId,
    command,
    args,
  });
}
