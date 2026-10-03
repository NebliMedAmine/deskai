import { ForbiddenException } from '@nestjs/common';
import { Role, TicketStatus, type UpdateTicketRequest } from '@deskai/shared';
import type { AuthUser } from '../common/auth-user';
import {
  applyReply,
  applyStatusChange,
  assertCanUpdate,
  ticketScope,
  type TicketLifecycle,
} from './ticket-rules';

const customer: AuthUser = { id: 'c1', email: 'c@x.dev', role: Role.CUSTOMER };
const agent: AuthUser = { id: 'a1', email: 'a@x.dev', role: Role.AGENT };
const admin: AuthUser = { id: 'ad1', email: 'ad@x.dev', role: Role.ADMIN };

const NOW = new Date('2026-01-10T12:00:00Z');
const EARLIER = new Date('2026-01-05T12:00:00Z');

const lifecycle = (overrides: Partial<TicketLifecycle> = {}): TicketLifecycle => ({
  status: TicketStatus.OPEN,
  resolvedAt: null,
  closedAt: null,
  firstResponseAt: null,
  ...overrides,
});

describe('ticketScope', () => {
  it('restricts customers to their own tickets', () => {
    expect(ticketScope(customer)).toEqual({ customerId: 'c1' });
  });

  it.each([agent, admin])('does not restrict $role', (user) => {
    expect(ticketScope(user)).toEqual({});
  });
});

describe('assertCanUpdate', () => {
  it('lets a customer close their ticket', () => {
    expect(() => assertCanUpdate(customer, { status: TicketStatus.CLOSED })).not.toThrow();
  });

  it.each<[string, UpdateTicketRequest]>([
    ['reopen', { status: TicketStatus.OPEN }],
    ['resolve', { status: TicketStatus.RESOLVED }],
    ['change priority', { priority: 'URGENT' }],
    ['change category', { category: 'BILLING' }],
    ['assign', { assigneeId: 'a1' }],
    ['unassign', { assigneeId: null }],
    ['close + change priority', { status: TicketStatus.CLOSED, priority: 'LOW' }],
  ])('forbids a customer to %s', (_label, dto) => {
    expect(() => assertCanUpdate(customer, dto)).toThrow(ForbiddenException);
  });

  it('lets staff change anything', () => {
    const dto: UpdateTicketRequest = {
      status: TicketStatus.PENDING,
      priority: 'HIGH',
      category: 'TECHNICAL',
      assigneeId: null,
    };
    expect(() => assertCanUpdate(agent, dto)).not.toThrow();
    expect(() => assertCanUpdate(admin, dto)).not.toThrow();
  });
});

describe('applyStatusChange', () => {
  it('is a no-op when the status does not change', () => {
    expect(applyStatusChange(lifecycle(), TicketStatus.OPEN, NOW)).toEqual({});
  });

  it('stamps resolvedAt when resolving', () => {
    expect(applyStatusChange(lifecycle(), TicketStatus.RESOLVED, NOW)).toEqual({
      status: TicketStatus.RESOLVED,
      resolvedAt: NOW,
      closedAt: null,
    });
  });

  it('keeps the original resolvedAt when closing a resolved ticket', () => {
    const current = lifecycle({ status: TicketStatus.RESOLVED, resolvedAt: EARLIER });
    expect(applyStatusChange(current, TicketStatus.CLOSED, NOW)).toEqual({
      status: TicketStatus.CLOSED,
      resolvedAt: EARLIER,
      closedAt: NOW,
    });
  });

  it('stamps resolvedAt too when closing a ticket that was never resolved', () => {
    expect(applyStatusChange(lifecycle(), TicketStatus.CLOSED, NOW)).toMatchObject({
      resolvedAt: NOW,
      closedAt: NOW,
    });
  });

  it.each([TicketStatus.OPEN, TicketStatus.PENDING])(
    'clears timestamps when reopening to %s',
    (next) => {
      const current = lifecycle({
        status: TicketStatus.CLOSED,
        resolvedAt: EARLIER,
        closedAt: EARLIER,
      });
      expect(applyStatusChange(current, next, NOW)).toEqual({
        status: next,
        resolvedAt: null,
        closedAt: null,
      });
    },
  );
});

describe('applyReply', () => {
  it('stamps firstResponseAt on the first staff reply only', () => {
    expect(applyReply(lifecycle(), true, NOW)).toEqual({ firstResponseAt: NOW });
    expect(applyReply(lifecycle({ firstResponseAt: EARLIER }), true, NOW)).toEqual({});
  });

  it('does not change status when staff replies', () => {
    expect(
      applyReply(lifecycle({ status: TicketStatus.PENDING, firstResponseAt: EARLIER }), true, NOW),
    ).toEqual({});
  });

  it.each([TicketStatus.PENDING, TicketStatus.RESOLVED])(
    'reopens a %s ticket when the customer replies',
    (status) => {
      const current = lifecycle({
        status,
        resolvedAt: status === TicketStatus.RESOLVED ? EARLIER : null,
      });
      expect(applyReply(current, false, NOW)).toEqual({
        status: TicketStatus.OPEN,
        resolvedAt: null,
        closedAt: null,
      });
    },
  );

  it('leaves an OPEN ticket as is when the customer replies', () => {
    expect(applyReply(lifecycle(), false, NOW)).toEqual({});
  });
});
