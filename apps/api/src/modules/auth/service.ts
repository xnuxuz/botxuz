import { isUniqueViolation } from '@xnuxuz/db';
import { ACCESS_TOKEN_TTL_SEC, REFRESH_TOKEN_TTL_SEC } from '@xnuxuz/shared';
import { db } from '../../db.js';
import { AppError } from '../../http/errors.js';
import { seedDefaultsForUser } from '../user/defaults.js';
import { hashPassword, verifyPassword } from './password.js';
import type { LoginInput, RegisterInput } from './schemas.js';
import {
  createSession,
  resolveSessionOwner,
  revokeSession,
  rotateSession,
} from './session-store.js';
import {
  formatRefreshToken,
  generateRefreshSecret,
  parseRefreshToken,
  signAccessToken,
} from './tokens.js';

export type PublicUser = {
  id: string;
  email: string;
  displayName: string | null;
  timezone: string;
  telegramLinked: boolean;
  briefingMinute: number;
  briefingOn: boolean;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
};

export type RequestMeta = { device: string; ip: string };

const userSelect = {
  id: true,
  email: true,
  displayName: true,
  timezone: true,
  telegramChatId: true,
  briefingMinute: true,
  briefingOn: true,
} as const;

type UserRow = {
  id: string;
  email: string;
  displayName: string | null;
  timezone: string;
  telegramChatId: string | null;
  briefingMinute: number;
  briefingOn: boolean;
};

export function toPublicUser(user: UserRow): PublicUser {
  const { telegramChatId, ...rest } = user;
  return { ...rest, telegramLinked: telegramChatId !== null };
}

/**
 * Hash argon2id atas string acak. Dipakai saat email tidak ditemukan supaya
 * waktu respons login mirip dengan kasus password salah — tanpa ini, selisih
 * waktunya membocorkan email mana yang terdaftar.
 */
const DUMMY_HASH_PROMISE = hashPassword(generateRefreshSecret());

async function issueTokens(userId: string, meta: RequestMeta): Promise<AuthTokens> {
  const secret = generateRefreshSecret();
  const sessionId = await createSession(userId, secret, meta);

  return {
    accessToken: await signAccessToken({ sub: userId, sid: sessionId }),
    refreshToken: formatRefreshToken(sessionId, secret),
    expiresIn: ACCESS_TOKEN_TTL_SEC,
    refreshExpiresIn: REFRESH_TOKEN_TTL_SEC,
  };
}

export async function register(
  input: RegisterInput,
  meta: RequestMeta,
): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const passwordHash = await hashPassword(input.password);

  let user: UserRow;
  try {
    user = await db.user.create({
      data: {
        email: input.email,
        passwordHash,
        displayName: input.displayName ?? null,
        timezone: input.timezone,
      },
      select: userSelect,
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw AppError.conflict('Email sudah terdaftar');
    throw error;
  }

  await seedDefaultsForUser(user.id);

  return { user: toPublicUser(user), tokens: await issueTokens(user.id, meta) };
}

export async function login(
  input: LoginInput,
  meta: RequestMeta,
): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const user = await db.user.findUnique({
    where: { email: input.email },
    select: { ...userSelect, passwordHash: true },
  });

  // Pesan identik untuk "email tidak ada" dan "password salah".
  const invalid = AppError.unauthorized('Email atau password salah');

  if (!user) {
    await verifyPassword(await DUMMY_HASH_PROMISE, input.password);
    throw invalid;
  }

  if (!(await verifyPassword(user.passwordHash, input.password))) throw invalid;

  const { passwordHash: _passwordHash, ...rest } = user;
  return { user: toPublicUser(rest), tokens: await issueTokens(user.id, meta) };
}

export async function refresh(rawToken: string, meta: RequestMeta): Promise<AuthTokens> {
  const { sessionId, secret } = parseRefreshToken(rawToken);

  const userId = await resolveSessionOwner(sessionId);
  const expired = AppError.unauthorized('Sesi tidak ditemukan atau sudah berakhir');
  if (!userId) throw expired;

  const nextSecret = generateRefreshSecret();
  const result = await rotateSession(userId, sessionId, secret, nextSecret, meta);

  if (result.status === 'unknown') throw expired;
  if (result.status === 'reused') {
    throw AppError.unauthorized('Refresh token dipakai ulang — semua sesi dicabut');
  }

  return {
    accessToken: await signAccessToken({ sub: userId, sid: sessionId }),
    refreshToken: formatRefreshToken(sessionId, nextSecret),
    expiresIn: ACCESS_TOKEN_TTL_SEC,
    refreshExpiresIn: REFRESH_TOKEN_TTL_SEC,
  };
}

export async function logout(userId: string, sessionId: string): Promise<void> {
  await revokeSession(userId, sessionId);
}

export async function getUser(userId: string): Promise<PublicUser> {
  const user = await db.user.findUnique({ where: { id: userId }, select: userSelect });
  if (!user) throw AppError.unauthorized('User tidak ditemukan');
  return toPublicUser(user);
}

/** Dipanggil bot Telegram lewat endpoint internal setelah user mengetik /link <kode>. */
export async function linkTelegram(userId: string, telegramChatId: string): Promise<PublicUser> {
  try {
    const user = await db.user.update({
      where: { id: userId },
      data: { telegramChatId },
      select: userSelect,
    });
    return toPublicUser(user);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict('Akun Telegram ini sudah terhubung ke user lain');
    }
    throw error;
  }
}

export async function unlinkTelegram(userId: string): Promise<PublicUser> {
  const user = await db.user.update({
    where: { id: userId },
    data: { telegramChatId: null },
    select: userSelect,
  });
  return toPublicUser(user);
}
