import { HttpException, HttpStatus } from '@nestjs/common';

/** Fixed error codes — STANDARDS.md §3. */
export type ErrorCode = 'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'RATE_LIMITED' | 'INTERNAL_ERROR';

export const HTTP_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: HttpStatus.BAD_REQUEST,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  INTERNAL_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
};

export interface ErrorDetail {
  field: string;
  message: string;
}

export class AppError extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: ErrorDetail[] = [],
  ) {
    super(message, HTTP_BY_CODE[code]);
  }
}

export const notFound = (what = 'ჩანაწერი') => new AppError('NOT_FOUND', `${what} ვერ მოიძებნა`);
export const validation = (details: ErrorDetail[], message = 'მონაცემები არასწორია') => new AppError('VALIDATION_ERROR', message, details);
export const conflict = (message: string) => new AppError('CONFLICT', message);
