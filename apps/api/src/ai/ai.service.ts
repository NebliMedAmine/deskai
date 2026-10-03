import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AiResultSource, TicketCategory, TicketPriority } from '@deskai/shared';
import { apiError } from '../common/errors';
import { AiProvider, type ReplyInput, type TriageInput } from './ai-provider';

/** One retry: a second attempt fixes most transient errors and malformed outputs. */
export const MAX_ATTEMPTS = 2;

/** Matches the AiTriage columns (minus ids/timestamps). */
export interface TriageRecord {
  suggestedCategory: TicketCategory;
  suggestedPriority: TicketPriority;
  summary: string;
  source: AiResultSource;
  model: string;
  attempts: number;
  latencyMs: number;
  errorMessage: string | null;
}

export interface ReplyDraft {
  content: string;
  model: string;
  latencyMs: number;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly provider: AiProvider) {}

  /** Never throws: if the model fails twice, returns neutral defaults with source = FALLBACK. */
  async triage(input: TriageInput): Promise<TriageRecord> {
    const started = performance.now();
    const outcome = await this.withRetry(() => this.provider.triage(input));
    const base = {
      model: this.provider.model,
      attempts: outcome.attempts,
      latencyMs: elapsedSince(started),
    };

    if (outcome.ok) {
      const { category, priority, summary } = outcome.value;
      return {
        ...base,
        suggestedCategory: category,
        suggestedPriority: priority,
        summary,
        source: AiResultSource.AI,
        errorMessage: null,
      };
    }

    this.logger.warn(`Triage fell back to defaults: ${outcome.error}`);
    return {
      ...base,
      suggestedCategory: TicketCategory.GENERAL,
      suggestedPriority: TicketPriority.MEDIUM,
      summary: fallbackSummary(input.subject),
      source: AiResultSource.FALLBACK,
      errorMessage: outcome.error,
    };
  }

  /** Throws 503 AI_UNAVAILABLE if the model fails twice; there is no sensible fallback for a reply. */
  async draftReply(input: ReplyInput): Promise<ReplyDraft> {
    const started = performance.now();
    const outcome = await this.withRetry(() => this.provider.draftReply(input));
    if (!outcome.ok) {
      this.logger.warn(`Reply draft failed: ${outcome.error}`);
      throw new ServiceUnavailableException(
        apiError('AI_UNAVAILABLE', 'The AI assistant is unavailable. Please try again later.'),
      );
    }
    return { content: outcome.value, model: this.provider.model, latencyMs: elapsedSince(started) };
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
  ): Promise<
    { ok: true; value: T; attempts: number } | { ok: false; error: string; attempts: number }
  > {
    let lastError = 'Unknown error';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return { ok: true, value: await fn(), attempts: attempt };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt < MAX_ATTEMPTS) this.logger.debug(`AI attempt ${attempt} failed: ${lastError}`);
      }
    }
    return { ok: false, error: lastError.slice(0, 500), attempts: MAX_ATTEMPTS };
  }
}

const elapsedSince = (started: number) => Math.round(performance.now() - started);

const fallbackSummary = (subject: string) =>
  `${subject.slice(0, 180)} (automatic triage unavailable)`;
