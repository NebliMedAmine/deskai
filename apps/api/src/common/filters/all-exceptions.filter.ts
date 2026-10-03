import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorResponse } from '@deskai/shared';
import { Prisma } from '../../generated/prisma/client';
import type { AuthenticatedRequest } from '../auth-user';
import { ApiErrorBody, isApiErrorBody } from '../errors';

/** Converts every thrown error into the single ApiErrorResponse shape. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<AuthenticatedRequest>();
    const res = ctx.getResponse<Response>();

    const { status, body } = this.resolve(exception);

    if (status >= 500) {
      this.logger.error(
        `[${req.requestId ?? '-'}] ${req.method} ${req.originalUrl}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const payload: ApiErrorResponse = {
      statusCode: status,
      error: reasonPhrase(status),
      code: body.code,
      message: body.message,
      ...(body.details ? { details: body.details } : {}),
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
      requestId: req.requestId ?? '',
    };
    res.status(status).json(payload);
  }

  private resolve(exception: unknown): { status: number; body: ApiErrorBody } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      if (isApiErrorBody(response)) return { status, body: response };
      // Built-in Nest exceptions (e.g. ParseUUIDPipe, unknown route) carry { message } or a string.
      const message =
        typeof response === 'string'
          ? response
          : (normalizeMessage((response as { message?: unknown }).message) ?? exception.message);
      return { status, body: { code: defaultCode(status), message } };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return {
            status: HttpStatus.CONFLICT,
            body: { code: 'CONFLICT', message: 'A record with these values already exists' },
          };
        case 'P2025':
          return {
            status: HttpStatus.NOT_FOUND,
            body: { code: 'NOT_FOUND', message: 'Resource not found' },
          };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    };
  }
}

function normalizeMessage(message: unknown): string | undefined {
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.join('; ');
  return undefined;
}

const CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'TOO_MANY_REQUESTS',
};

function defaultCode(status: number): string {
  return CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'ERROR');
}

function reasonPhrase(status: number): string {
  const name = HttpStatus[status];
  if (!name) return 'Error';
  // "NOT_FOUND" -> "Not Found"
  return name
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
