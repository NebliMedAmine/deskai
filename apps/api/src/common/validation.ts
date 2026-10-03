import { BadRequestException, type ValidationError, ValidationPipe } from '@nestjs/common';
import type { ApiFieldError } from '@deskai/shared';
import { apiError } from './errors';

/** Flattens class-validator's nested error tree into `{ field: 'a.b.0', messages }` entries. */
export function flattenValidationErrors(errors: ValidationError[], parent = ''): ApiFieldError[] {
  return errors.flatMap((err) => {
    const field = parent ? `${parent}.${err.property}` : err.property;
    const own: ApiFieldError[] = err.constraints
      ? [{ field, messages: Object.values(err.constraints) }]
      : [];
    return [...own, ...flattenValidationErrors(err.children ?? [], field)];
  });
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new BadRequestException(
        apiError('VALIDATION_FAILED', 'Request validation failed', flattenValidationErrors(errors)),
      ),
  });
}
