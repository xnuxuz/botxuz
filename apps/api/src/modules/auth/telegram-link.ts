import { randomInt } from 'node:crypto';
import { redis } from '../../config/redis.js';

/** Tanpa 0/O/1/I supaya kode enak dibacakan dan diketik ulang di Telegram. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export const LINK_CODE_TTL_SEC = 10 * 60;

const codeKey = (code: string) => `tglink:${code}`;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

/** Kode sekali pakai, berlaku 10 menit. Kode lama tidak dicabut — cukup kedaluwarsa. */
export async function issueLinkCode(userId: string): Promise<{ code: string; ttlSec: number }> {
  // NX: kalau kode kebetulan tabrakan dengan yang masih hidup, coba lagi.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    const stored = await redis.set(codeKey(code), userId, 'EX', LINK_CODE_TTL_SEC, 'NX');
    if (stored === 'OK') return { code, ttlSec: LINK_CODE_TTL_SEC };
  }
  throw new Error('Gagal membuat kode link Telegram');
}

/** Menukar kode dengan userId; kode langsung hangus apa pun hasil langkah berikutnya. */
export async function consumeLinkCode(code: string): Promise<string | null> {
  const key = codeKey(code.trim().toUpperCase());
  const userId = await redis.get(key);
  if (!userId) return null;
  await redis.del(key);
  return userId;
}
