import { type ArgumentMetadata, type BadRequestException } from '@nestjs/common';
import { CreateTicketDto, TicketListQueryDto, UpdateTicketDto } from '../tickets/dto/ticket.dto';
import { RegisterDto } from '../auth/dto/auth.dto';
import { createValidationPipe } from './validation';

const pipe = createValidationPipe();
const validate = (
  metatype: ArgumentMetadata['metatype'],
  value: unknown,
  type: 'body' | 'query' = 'body',
) => pipe.transform(value, { type, metatype });

async function fieldErrors(metatype: ArgumentMetadata['metatype'], value: unknown) {
  try {
    await validate(metatype, value);
  } catch (err) {
    const body = (err as BadRequestException).getResponse() as { details: { field: string }[] };
    return body.details.map((d) => d.field);
  }
  throw new Error('expected validation to fail');
}

describe('validation pipe + DTOs', () => {
  it('normalizes email and trims name on register', async () => {
    const dto = (await validate(RegisterDto, {
      email: '  Jane@Example.COM ',
      name: '  Jane ',
      password: 'abc12345',
    })) as RegisterDto;
    expect(dto.email).toBe('jane@example.com');
    expect(dto.name).toBe('Jane');
  });

  it('rejects weak passwords', async () => {
    await expect(
      fieldErrors(RegisterDto, { email: 'a@b.co', name: 'A', password: 'onlyletters' }),
    ).resolves.toEqual(['password']);
  });

  it('rejects unknown properties', async () => {
    await expect(
      fieldErrors(CreateTicketDto, {
        subject: 'Valid subject',
        description: 'Long enough text',
        role: 'ADMIN',
      }),
    ).resolves.toEqual(['role']);
  });

  it('accepts null assigneeId (unassign) but rejects a non-uuid', async () => {
    await expect(validate(UpdateTicketDto, { assigneeId: null })).resolves.toBeDefined();
    await expect(fieldErrors(UpdateTicketDto, { assigneeId: 'bob' })).resolves.toEqual([
      'assigneeId',
    ]);
  });

  it('parses list filters from comma-separated and repeated query params', async () => {
    const q = (await validate(
      TicketListQueryDto,
      { status: 'OPEN,PENDING', priority: ['HIGH', 'URGENT'], page: '2', assigneeId: 'unassigned' },
      'query',
    )) as TicketListQueryDto;
    expect(q.status).toEqual(['OPEN', 'PENDING']);
    expect(q.priority).toEqual(['HIGH', 'URGENT']);
    expect(q.page).toBe(2);
    expect(q.assigneeId).toBe('unassigned');
  });

  it('rejects invalid enum values in list filters', async () => {
    await expect(fieldErrors(TicketListQueryDto, { status: 'OPEN,BOGUS' })).resolves.toEqual([
      'status',
    ]);
  });
});
