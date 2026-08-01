import { cookies } from 'next/headers';

/**
 * Token disimpan di cookie httpOnly, bukan localStorage: dashboard ini memegang
 * data finance, jadi satu celah XSS tidak boleh langsung berarti refresh token
 * ikut terbawa keluar (REQUIREMENT §5.2). Konsekuensinya browser tidak pernah
 * memanggil API backend langsung — semuanya lewat route handler Next di
 * /api/proxy, yang menempelkan token di sisi server.
 */

export const ACCESS_COOKIE = 'xnuxuz_at';
export const REFRESH_COOKIE = 'xnuxuz_rt';

const secure = process.env.NODE_ENV === 'production';

type CookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
};

function options(maxAge: number): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge };
}

export type Tokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
};

export async function saveTokens(tokens: Tokens): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_COOKIE, tokens.accessToken, options(tokens.expiresIn));
  store.set(REFRESH_COOKIE, tokens.refreshToken, options(tokens.refreshExpiresIn));
}

export async function clearTokens(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

export async function readTokens(): Promise<{ access?: string; refresh?: string }> {
  const store = await cookies();
  return {
    access: store.get(ACCESS_COOKIE)?.value,
    refresh: store.get(REFRESH_COOKIE)?.value,
  };
}

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3011';
