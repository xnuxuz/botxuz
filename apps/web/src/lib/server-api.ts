import { API_PREFIX, type ApiResponse } from '@xnuxuz/shared';
import { API_BASE, readTokens, saveTokens, type Tokens } from './session';

/**
 * Pemanggilan API dari sisi server Next. Access token berumur 15 menit, jadi
 * 401 tunggal bukan berarti sesi habis — sekali refresh lalu ulangi, dan baru
 * anggap logout kalau refresh-nya juga ditolak.
 */
export class SessionExpiredError extends Error {
  constructor() {
    super('Sesi berakhir');
    this.name = 'SessionExpiredError';
  }
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function refreshTokens(refreshToken: string): Promise<Tokens> {
  const response = await fetch(`${API_BASE}${API_PREFIX}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });

  const payload = (await response.json()) as ApiResponse<Tokens>;
  if (!payload.ok) throw new SessionExpiredError();

  await saveTokens(payload.data);
  return payload.data;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  retryOnUnauthorized = true,
): Promise<T> {
  const { access, refresh } = await readTokens();
  if (!access && !refresh) throw new SessionExpiredError();

  let token = access;
  if (!token && refresh) token = (await refreshTokens(refresh)).accessToken;

  const response = await fetch(`${API_BASE}${API_PREFIX}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
      authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });

  if (response.status === 401 && retryOnUnauthorized && refresh) {
    await refreshTokens(refresh);
    return apiFetch<T>(path, init, false);
  }

  const payload = (await response.json()) as ApiResponse<T>;
  if (!payload.ok) {
    throw new ApiRequestError(response.status, payload.error.code, payload.error.message);
  }

  return payload.data;
}

/** Varian yang tidak melempar — dipakai halaman yang harus tetap render walau satu bagian gagal. */
export async function apiFetchSafe<T>(path: string, fallback: T): Promise<T> {
  try {
    return await apiFetch<T>(path);
  } catch (error) {
    if (error instanceof SessionExpiredError) throw error;
    return fallback;
  }
}
