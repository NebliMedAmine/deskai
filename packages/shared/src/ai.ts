import type { AiResultSource, TicketCategory, TicketPriority } from './enums';

export interface AiTriageDto {
  suggestedCategory: TicketCategory;
  suggestedPriority: TicketPriority;
  summary: string;
  source: AiResultSource;
  model: string;
  createdAt: string;
}

export interface SuggestReplyResponse {
  /** Send back as CreateMessageRequest.aiDraftId when the reply is posted */
  draftId: string;
  content: string;
  model: string;
}
