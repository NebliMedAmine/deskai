import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { Role, TicketStatus } from '@deskai/shared';
import type { AuthUser } from '../common/auth-user';
import type { PrismaService } from '../prisma/prisma.service';
import { TicketsService } from './tickets.service';

const customer: AuthUser = { id: 'c1', email: 'c@x.dev', role: Role.CUSTOMER };
const agent: AuthUser = { id: 'a1', email: 'a@x.dev', role: Role.AGENT };
const TICKET_ID = '22222222-2222-2222-2222-222222222222';

const lifecycle = (status: TicketStatus = TicketStatus.OPEN) => ({
  status,
  resolvedAt: null,
  closedAt: null,
  firstResponseAt: null,
});

const messageRow = {
  id: 'm1',
  ticketId: TICKET_ID,
  authorId: 'c1',
  body: 'hello',
  aiDraftId: null,
  createdAt: new Date(),
  author: { id: 'c1', name: 'Chris', role: Role.CUSTOMER },
};

describe('TicketsService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: TicketsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    // Array-form $transaction: just resolve the operations.
    prisma.$transaction.mockImplementation(((ops: Promise<unknown>[]) =>
      Promise.all(ops)) as never);
    service = new TicketsService(prisma);
  });

  describe('list', () => {
    beforeEach(() => {
      prisma.ticket.count.mockResolvedValue(0);
      prisma.ticket.findMany.mockResolvedValue([]);
    });

    it('scopes customers to their own tickets, whatever filters they send', async () => {
      await service.list(customer, { status: [TicketStatus.OPEN] });
      const where = prisma.ticket.findMany.mock.calls[0]![0]!.where;
      expect(where).toEqual({ AND: [{ customerId: 'c1' }, { status: { in: ['OPEN'] } }] });
    });

    it('does not scope agents', async () => {
      await service.list(agent, {});
      expect(prisma.ticket.findMany.mock.calls[0]![0]!.where).toEqual({ AND: [{}, {}] });
    });

    it('matches "#1234" searches against the ticket number', async () => {
      await service.list(agent, { search: '#1234' });
      const where = prisma.ticket.findMany.mock.calls[0]![0]!.where as {
        AND: [unknown, { OR: unknown[] }];
      };
      expect(where.AND[1].OR).toContainEqual({ number: 1234 });
    });

    it('translates assigneeId=unassigned to a null filter', async () => {
      await service.list(agent, { assigneeId: 'unassigned' });
      expect(prisma.ticket.findMany.mock.calls[0]![0]!.where).toEqual({
        AND: [{}, { assigneeId: null }],
      });
    });

    it('paginates with a stable tiebreaker', async () => {
      prisma.ticket.count.mockResolvedValue(45);
      const result = await service.list(agent, {
        page: 3,
        pageSize: 20,
        sortBy: 'priority',
        sortOrder: 'asc',
      });
      const args = prisma.ticket.findMany.mock.calls[0]![0]!;
      expect(args).toMatchObject({
        skip: 40,
        take: 20,
        orderBy: [{ priority: 'asc' }, { number: 'desc' }],
      });
      expect(result).toMatchObject({ total: 45, page: 3, totalPages: 3 });
    });
  });

  describe('update', () => {
    it('returns 404 (not 403) for a ticket the customer does not own', async () => {
      prisma.ticket.findFirst.mockResolvedValue(null);
      await expect(
        service.update(customer, TICKET_ID, { status: TicketStatus.CLOSED }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.ticket.findFirst.mock.calls[0]![0]!.where).toEqual({
        id: TICKET_ID,
        customerId: 'c1',
      });
    });

    it('rejects assignment to someone who is not active staff', async () => {
      prisma.ticket.findFirst.mockResolvedValue(lifecycle() as never);
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.update(agent, TICKET_ID, { assigneeId: '33333333-3333-3333-3333-333333333333' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.ticket.update).not.toHaveBeenCalled();
    });
  });

  describe('addMessage', () => {
    it('refuses replies on a closed ticket', async () => {
      prisma.ticket.findFirst.mockResolvedValue(lifecycle(TicketStatus.CLOSED) as never);
      await expect(service.addMessage(customer, TICKET_ID, { body: 'hi' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('reopens a PENDING ticket when the customer replies', async () => {
      prisma.ticket.findFirst.mockResolvedValue(lifecycle(TicketStatus.PENDING) as never);
      prisma.ticketMessage.create.mockResolvedValue(messageRow);

      const dto = await service.addMessage(customer, TICKET_ID, { body: 'hello' });

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: expect.objectContaining({ status: TicketStatus.OPEN, resolvedAt: null }),
      });
      expect(dto).toMatchObject({
        id: 'm1',
        body: 'hello',
        fromAiDraft: false,
        author: { name: 'Chris' },
      });
    });

    it('stamps firstResponseAt on the first agent reply', async () => {
      prisma.ticket.findFirst.mockResolvedValue(lifecycle() as never);
      prisma.ticketMessage.create.mockResolvedValue(messageRow);

      await service.addMessage(agent, TICKET_ID, { body: 'On it!' });

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: expect.objectContaining({ firstResponseAt: expect.any(Date) }),
      });
    });

    it('does not let customers attach an AI draft', async () => {
      prisma.ticket.findFirst.mockResolvedValue(lifecycle() as never);
      await expect(
        service.addMessage(customer, TICKET_ID, {
          body: 'x',
          aiDraftId: '44444444-4444-4444-4444-444444444444',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses to send the same AI draft twice', async () => {
      prisma.ticket.findFirst.mockResolvedValue(lifecycle() as never);
      prisma.aiReplyDraft.findFirst.mockResolvedValue({ message: { id: 'm0' } } as never);
      await expect(
        service.addMessage(agent, TICKET_ID, {
          body: 'x',
          aiDraftId: '44444444-4444-4444-4444-444444444444',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
