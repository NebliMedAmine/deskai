import { type ArgumentsHost, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { apiError } from '../errors';
import { AllExceptionsFilter } from './all-exceptions.filter';

function run(exception: unknown) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', originalUrl: '/api/x', requestId: 'req-1' }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter().catch(exception, host);
  return { status: (status.mock.calls[0] as unknown[])[0], body: json.mock.calls[0][0] };
}

describe('AllExceptionsFilter', () => {
  beforeAll(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));

  it('passes through our own error codes and details', () => {
    const details = [{ field: 'email', messages: ['bad'] }];
    const { status, body } = run(
      new BadRequestException(apiError('VALIDATION_FAILED', 'Nope', details)),
    );
    expect(status).toBe(400);
    expect(body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      code: 'VALIDATION_FAILED',
      message: 'Nope',
      details,
      path: '/api/x',
      requestId: 'req-1',
    });
    expect(typeof body.timestamp).toBe('string');
  });

  it('derives a code for built-in Nest exceptions', () => {
    const { status, body } = run(new NotFoundException('Cannot GET /api/nope'));
    expect(status).toBe(404);
    expect(body).toMatchObject({ code: 'NOT_FOUND', message: 'Cannot GET /api/nope' });
  });

  it('maps Prisma unique violations to 409', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { status, body } = run(err);
    expect(status).toBe(409);
    expect(body.code).toBe('CONFLICT');
  });

  it('hides internal details of unknown errors', () => {
    const { status, body } = run(new Error('db password is hunter2'));
    expect(status).toBe(500);
    expect(body).toMatchObject({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
    expect(JSON.stringify(body)).not.toContain('hunter2');
  });
});
