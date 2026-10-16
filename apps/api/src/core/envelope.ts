import { ArgumentsHost, CallHandler, Catch, ExceptionFilter, ExecutionContext, HttpException, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { map, Observable } from 'rxjs';
import { pascalKey, toApi } from './case';
import { AppError, ErrorCode, HTTP_BY_CODE } from './errors';

/** Standard response — STANDARDS.md §3: { IsSuccess, Data, Error }. */
export interface ApiResponse<T = unknown> {
  IsSuccess: boolean;
  Data: T | null;
  Error: { Code: ErrorCode; Message: string; Details: { Field: string; Message: string }[] } | null;
}

@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<ApiResponse> {
    // success is always 200 (no 201 on POST) — STANDARDS.md §3
    ctx.switchToHttp().getResponse<Response>().status(200);
    return next.handle().pipe(map((data) => ({ IsSuccess: true, Data: toApi(data ?? null), Error: null })));
  }
}

const codeByStatus = (status: number): ErrorCode =>
  (Object.entries(HTTP_BY_CODE).find(([, s]) => s === status)?.[0] as ErrorCode) ?? (status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR');

@Catch()
export class EnvelopeExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger('Error');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let error: NonNullable<ApiResponse['Error']>;

    if (exception instanceof AppError) {
      status = exception.getStatus();
      error = { Code: exception.code, Message: exception.message, Details: exception.details.map((d) => ({ Field: d.field, Message: d.message })) };
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
      status = 409;
      const fields = ([] as string[]).concat((exception.meta?.target as string[] | string) ?? []);
      error = { Code: 'CONFLICT', Message: 'ასეთი ჩანაწერი უკვე არსებობს', Details: fields.map((f) => ({ Field: pascalKey(f), Message: 'უნიკალური უნდა იყოს' })) };
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2025') {
      status = 404;
      error = { Code: 'NOT_FOUND', Message: 'ჩანაწერი ვერ მოიძებნა', Details: [] };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      error = { Code: codeByStatus(status), Message: exception.message, Details: [] };
    } else {
      this.log.error(exception instanceof Error ? exception.stack : String(exception));
      error = { Code: 'INTERNAL_ERROR', Message: 'სერვერის შეცდომა', Details: [] };
    }
    res.status(status).json({ IsSuccess: false, Data: null, Error: error } satisfies ApiResponse);
  }
}
