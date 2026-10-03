import type { AiTriageDto } from './ai';
import type { PaginationQuery } from './api';
import type { TicketCategory, TicketPriority, TicketStatus } from './enums';
import type { UserSummary } from './users';

// ── Requests ────────────────────────────────────────────

export interface CreateTicketRequest {
  /** 5–200 chars */
  subject: string;
  /** 10–5000 chars */
  description: string;
}

/**
 * Agents/admins may set any field.
 * Customers may only send `{ status: 'CLOSED' }` for their own tickets.
 */
export interface UpdateTicketRequest {
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: TicketCategory;
  /** `null` unassigns */
  assigneeId?: string | null;
}

export interface CreateMessageRequest {
  /** 1–5000 chars */
  body: string;
  /** Set when this reply started from an AI draft (sent as-is or edited) */
  aiDraftId?: string;
}

export const TICKET_SORT_FIELDS = ['createdAt', 'updatedAt', 'priority', 'number'] as const;
export type TicketSortField = (typeof TICKET_SORT_FIELDS)[number];
export type SortOrder = 'asc' | 'desc';

export const UNASSIGNED = 'unassigned';

export interface TicketListQuery extends PaginationQuery {
  status?: TicketStatus[];
  priority?: TicketPriority[];
  category?: TicketCategory[];
  /** A user id, or "unassigned" */
  assigneeId?: string;
  /** Matches subject, description, or "#<number>" */
  search?: string;
  sortBy?: TicketSortField;
  sortOrder?: SortOrder;
}

// ── Responses ───────────────────────────────────────────

export interface TicketListItem {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  customer: UserSummary;
  assignee: UserSummary | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TicketMessageDto {
  id: string;
  body: string;
  author: UserSummary;
  fromAiDraft: boolean;
  createdAt: string;
}

export interface TicketDetail extends TicketListItem {
  description: string;
  messages: TicketMessageDto[];
  /** Always null for customers (they don't see AI internals), or when triage hasn't run. */
  triage: AiTriageDto | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
}
