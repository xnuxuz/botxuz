import { randomBytes } from 'node:crypto';
import { ACCESS_TOKEN_TTL_SEC } from '@xnuxuz/shared';
import { jwtVerify, SignJWT } from 'jose';
import { env } from '../../config/env.js';
import { AppError } from '../../http/errors.js';

const ISSUER = 'xnuxuz';
const AUDIENCE = 'xnuxuz-client';

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export type AccessClaims = {
  /** User id. */
  sub: string;
  /** Session id — dipakai untuk revoke per device. */
  sid: string;
};

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT({ sid: claims.sid })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SEC}s`)
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(token, accessSecret, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    const sid = payload.sid;
    if (!payload.sub || typeof sid !== 'string') {
      throw AppError.unauthorized('Token tidak lengkap');
    }

    return { sub: payload.sub, sid };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.unauthorized('Token tidak valid atau kedaluwarsa');
  }
}

/**
 * Refresh token bukan JWT: nilainya opaque `<sessionId>.<secret>`. Secret-nya
 * hanya disimpan sebagai hash di Redis, jadi bocornya dump Redis tidak langsung
 * memberi akses. Format bersegmen supaya sesi bisa dicari tanpa scan.
 */
export function generateRefreshSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function formatRefreshToken(sessionId: string, secret: string): string {
  return `${sessionId}.${secret}`;
}

export function parseRefreshToken(token: string): { sessionId: string; secret: string } {
  const separator = token.indexOf('.');
  if (separator <= 0 || separator === token.length - 1) {
    throw AppError.unauthorized('Refresh token tidak valid');
  }
  return {
    sessionId: token.slice(0, separator),
    secret: token.slice(separator + 1),
  };
}
