// String values intentionally match the Prisma enums 1:1.
// apps/api/src/common/enum-sync.ts fails the build if they ever drift.

export const Role = { CUSTOMER: 'CUSTOMER', AGENT: 'AGENT', ADMIN: 'ADMIN' } as const;
export type Role = (typeof Role)[keyof typeof Role];

export const TicketStatus = {
  OPEN: 'OPEN',
  PENDING: 'PENDING',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
} as const;
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];

export const TicketPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;
export type TicketPriority = (typeof TicketPriority)[keyof typeof TicketPriority];

export const TicketCategory = {
  BILLING: 'BILLING',
  TECHNICAL: 'TECHNICAL',
  ACCOUNT: 'ACCOUNT',
  BUG_REPORT: 'BUG_REPORT',
  FEATURE_REQUEST: 'FEATURE_REQUEST',
  GENERAL: 'GENERAL',
} as const;
export type TicketCategory = (typeof TicketCategory)[keyof typeof TicketCategory];

export const AiResultSource = { AI: 'AI', FALLBACK: 'FALLBACK' } as const;
export type AiResultSource = (typeof AiResultSource)[keyof typeof AiResultSource];

export const ROLES = Object.values(Role);
export const TICKET_STATUSES = Object.values(TicketStatus);
export const TICKET_PRIORITIES = Object.values(TicketPriority);
export const TICKET_CATEGORIES = Object.values(TicketCategory);
