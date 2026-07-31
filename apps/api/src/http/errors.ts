import { ERROR_CODES, type ErrorCode } from '@xnuxuz/shared';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';

/** Error yang memang dimaksudkan sampai ke client, dengan kode stabil. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static unauthorized(message = 'Autentikasi diperlukan'): AppError {
    return new AppError(401, ERROR_CODES.UNAUTHORIZED, message);
  }

  static forbidden(message = 'Akses ditolak'): AppError {
    return new AppError(403, ERROR_CODES.FORBIDDEN, message);
  }

  static notFound(message = 'Resource tidak ditemukan'): AppError {
    return new AppError(404, ERROR_CODES.NOT_FOUND, message);
  }

  static conflict(message: string): AppError {
    return new AppError(409, ERROR_CODES.CONFLICT, message);
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    ok: false,
    error: {
      code: ERROR_CODES.NOT_FOUND,
      message: `Route ${req.method} ${req.path} tidak ditemukan`,
    },
  });
}

// Express mengenali error handler dari 4 parameter — `next` wajib ada.
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      ok: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Request tidak valid',
        details: error.issues,
      },
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.status).json({
      ok: false,
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  // Detail error internal tidak pernah bocor ke client.
  logger.error({ err: error }, 'Unhandled error');
  res.status(500).json({
    ok: false,
    error: { code: ERROR_CODES.INTERNAL, message: 'Terjadi kesalahan internal' },
  });
}
