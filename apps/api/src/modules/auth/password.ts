import { hash, verify } from '@node-rs/argon2';

/**
 * argon2id sesuai REQUIREMENT §3.1. Parameter diturunkan dari rekomendasi OWASP
 * varian "19 MiB / t=2 / p=1": aman, dan tetap ~50ms di VPS 4GB tanpa bikin
 * login jadi vektor DoS memori.
 */
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(digest: string, plain: string): Promise<boolean> {
  try {
    return await verify(digest, plain, OPTIONS);
  } catch {
    // Hash rusak/format asing dianggap tidak cocok, bukan error 500.
    return false;
  }
}
