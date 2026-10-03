import type { AiTriageDto, TicketDetail, TicketListItem, TicketMessageDto } from '@deskai/shared';
import { isStaff, type AuthUser } from '../common/auth-user';
import type { AiTriage, Prisma } from '../generated/prisma/client';
import { toUserSummary, userSummarySelect } from '../users/user.mapper';

export const ticketListInclude = {
  customer: { select: userSummarySelect },
  assignee: { select: userSummarySelect },
  _count: { select: { messages: true } },
} satisfies Prisma.TicketInclude;

export const messageInclude = {
  author: { select: userSummarySelect },
} satisfies Prisma.TicketMessageInclude;

export const ticketDetailInclude = {
  ...ticketListInclude,
  messages: { orderBy: { createdAt: 'asc' }, include: messageInclude },
  triage: true,
} satisfies Prisma.TicketInclude;

type TicketWithList = Prisma.TicketGetPayload<{ include: typeof ticketListInclude }>;
type TicketWithDetail = Prisma.TicketGetPayload<{ include: typeof ticketDetailInclude }>;
type MessageWithAuthor = Prisma.TicketMessageGetPayload<{ include: typeof messageInclude }>;

export function toTicketListItem(t: TicketWithList): TicketListItem {
  return {
    id: t.id,
    number: t.number,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    category: t.category,
    customer: toUserSummary(t.customer),
    assignee: t.assignee ? toUserSummary(t.assignee) : null,
    messageCount: t._count.messages,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export function toMessageDto(m: MessageWithAuthor): TicketMessageDto {
  return {
    id: m.id,
    body: m.body,
    author: toUserSummary(m.author),
    fromAiDraft: m.aiDraftId !== null,
    createdAt: m.createdAt.toISOString(),
  };
}

export function toTriageDto(t: AiTriage): AiTriageDto {
  return {
    suggestedCategory: t.suggestedCategory,
    suggestedPriority: t.suggestedPriority,
    summary: t.summary,
    source: t.source,
    model: t.model,
    createdAt: t.createdAt.toISOString(),
  };
}

/** `viewer` decides visibility of AI internals: customers never see triage data. */
export function toTicketDetail(t: TicketWithDetail, viewer: AuthUser): TicketDetail {
  return {
    ...toTicketListItem(t),
    description: t.description,
    messages: t.messages.map(toMessageDto),
    triage: t.triage && isStaff(viewer.role) ? toTriageDto(t.triage) : null,
    firstResponseAt: t.firstResponseAt?.toISOString() ?? null,
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    closedAt: t.closedAt?.toISOString() ?? null,
  };
}
