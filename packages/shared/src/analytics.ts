import type { TicketCategory, TicketPriority, TicketStatus } from './enums';

export type Granularity = 'day' | 'week' | 'month';

export interface AnalyticsQuery {
  /** ISO date, default: 30 days ago */
  from?: string;
  /** ISO date, default: now */
  to?: string;
  /** default: 'day' */
  granularity?: Granularity;
}

export interface VolumePoint {
  /** ISO date of the bucket start */
  bucket: string;
  created: number;
  resolved: number;
}

export interface CountBy<K extends string> {
  key: K;
  count: number;
}

export interface AnalyticsOverview {
  range: { from: string; to: string; granularity: Granularity };
  totals: { total: number; open: number; resolvedInRange: number };
  avgResolutionHours: number | null;
  avgFirstResponseHours: number | null;
  volume: VolumePoint[];
  byStatus: CountBy<TicketStatus>[];
  byCategory: CountBy<TicketCategory>[];
  byPriority: CountBy<TicketPriority>[];
  ai: {
    triageCount: number;
    /** 0–1 */
    fallbackRate: number;
    /** Share of tickets whose final category equals the AI suggestion (0–1) */
    categoryAgreementRate: number;
    priorityAgreementRate: number;
    draftsGenerated: number;
    draftsSent: number;
    draftsSentUnedited: number;
  };
}
