/**
 * Pure business rules for tickets: who can see/change what, and how status
 * changes affect lifecycle timestamps. No I/O, so they're trivially unit-testable.
 */
import { ForbiddenException } from '@nestjs/common';
import { TicketStatus, type UpdateTicketRequest } from '@deskai/shared';
import { isStaff, type AuthUser } from '../common/auth-user';
import { apiError } from '../common/errors';
import type { Prisma } from '../generated/prisma/client';

/** Row-level visibility: customers only ever see their own tickets. */
export function ticketScope(user: AuthUser): Prisma.TicketWhereInput {
  return isStaff(user.role) ? {} : { customerId: user.id };
}

/** Customers may only close their own ticket; every other field is staff-only. */
export function assertCanUpdate(user: AuthUser, dto: UpdateTicketRequest): void {
  if (isStaff(user.role)) return;

  const staffOnlyFieldSet =
    dto.priority !== undefined || dto.category !== undefined || dto.assigneeId !== undefined;
  const nonCloseStatus = dto.status !== undefined && dto.status !== TicketStatus.CLOSED;

  if (staffOnlyFieldSet || nonCloseStatus) {
    throw new ForbiddenException(
      apiError('CUSTOMER_UPDATE_FORBIDDEN', 'Customers can only close their own tickets'),
    );
  }
}

export interface TicketLifecycle {
  status: TicketStatus;
  resolvedAt: Date | null;
  closedAt: Date | null;
  firstResponseAt: Date | null;
}

type LifecycleUpdate = Partial<
  Pick<TicketLifecycle, 'status' | 'resolvedAt' | 'closedAt' | 'firstResponseAt'>
>;

/**
 * Timestamp bookkeeping for an explicit status change.
 * - RESOLVED stamps resolvedAt.
 * - CLOSED stamps closedAt (and resolvedAt if it was never resolved, so it counts toward resolution time).
 * - OPEN / PENDING mean the ticket is (re)opened, so both are cleared.
 */
export function applyStatusChange(
  current: TicketLifecycle,
  next: TicketStatus,
  now: Date,
): LifecycleUpdate {
  if (next === current.status) return {};
  switch (next) {
    case TicketStatus.RESOLVED:
      return { status: next, resolvedAt: now, closedAt: null };
    case TicketStatus.CLOSED:
      return { status: next, resolvedAt: current.resolvedAt ?? now, closedAt: now };
    case TicketStatus.OPEN:
    case TicketStatus.PENDING:
      return { status: next, resolvedAt: null, closedAt: null };
  }
}

/**
 * Side effects of posting a reply (the ticket must not be CLOSED; the caller checks that).
 * - First staff reply stamps firstResponseAt.
 * - A customer replying to a PENDING (waiting on customer) or RESOLVED ticket reopens it.
 */
export function applyReply(
  current: TicketLifecycle,
  authorIsStaff: boolean,
  now: Date,
): LifecycleUpdate {
  if (authorIsStaff) {
    return current.firstResponseAt ? {} : { firstResponseAt: now };
  }
  if (current.status === TicketStatus.PENDING || current.status === TicketStatus.RESOLVED) {
    return applyStatusChange(current, TicketStatus.OPEN, now);
  }
  return {};
}
