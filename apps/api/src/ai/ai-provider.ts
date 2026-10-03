import { z } from 'zod';
import { TicketCategory, TicketPriority } from '@deskai/shared';

export interface TriageInput {
  subject: string;
  description: string;
}

export interface ConversationMessage {
  from: 'customer' | 'staff';
  authorName: string;
  body: string;
}

export interface ReplyInput {
  subject: string;
  description: string;
  category: TicketCategory;
  customerName: string;
  /** Oldest first */
  messages: ConversationMessage[];
}

/** What a provider must return for triage. Anything else counts as a failed attempt. */
export const triageResultSchema = z.object({
  category: z.enum(TicketCategory),
  priority: z.enum(TicketPriority),
  summary: z.string().trim().min(1).max(500),
});
export type TriageResult = z.infer<typeof triageResultSchema>;

/**
 * A model backend. Implementations throw on any failure (network, timeout, invalid output);
 * retries and fallbacks are handled once, in AiService.
 * Abstract class (not an interface) so it can be used as the Nest injection token.
 */
export abstract class AiProvider {
  /** Stored on AiTriage / AiReplyDraft rows */
  abstract readonly model: string;
  abstract triage(input: TriageInput): Promise<TriageResult>;
  abstract draftReply(input: ReplyInput): Promise<string>;
}
