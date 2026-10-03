import type { ApiFieldError } from '@deskai/shared';

/**
 * Body passed to Nest's HttpExceptions, e.g.
 *   throw new NotFoundException(apiError('TICKET_NOT_FOUND', 'Ticket not found'))
 * AllExceptionsFilter turns it into the public ApiErrorResponse shape.
 */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: ApiFieldError[];
}

export const apiError = (
  code: string,
  message: string,
  details?: ApiFieldError[],
): ApiErrorBody => ({
  code,
  message,
  ...(details ? { details } : {}),
});

export const isApiErrorBody = (value: unknown): value is ApiErrorBody =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ApiErrorBody).code === 'string' &&
  typeof (value as ApiErrorBody).message === 'string';
