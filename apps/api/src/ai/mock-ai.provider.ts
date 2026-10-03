import { TicketCategory, TicketPriority } from '@deskai/shared';
import { AiProvider, type ReplyInput, type TriageInput, type TriageResult } from './ai-provider';

/** Checked in order; the category with the most keyword hits wins, earlier entries win ties. */
const CATEGORY_KEYWORDS: [TicketCategory, RegExp][] = [
  [
    TicketCategory.BILLING,
    /\b(invoice|billing|billed|charged?|refund|payment|subscription|pricing|vat)\b/gi,
  ],
  [
    TicketCategory.ACCOUNT,
    /\b(password|log ?in|sign ?in|account|2fa|mfa|invite|members?|seats?)\b/gi,
  ],
  [
    TicketCategory.BUG_REPORT,
    /\b(bug|crash(es|ed)?|broken|exception|500|not working|doesn'?t work)\b/gi,
  ],
  [
    TicketCategory.FEATURE_REQUEST,
    /\b(feature|would be (nice|great)|could you add|support for|roadmap)\b/gi,
  ],
  [
    TicketCategory.TECHNICAL,
    /\b(api|webhooks?|integration|sso|saml|timeouts?|slow|latency|rate limit)\b/gi,
  ],
];

const PRIORITY_RULES: [TicketPriority, RegExp][] = [
  [
    TicketPriority.URGENT,
    /\b(outage|down|urgent|asap|data loss|security|breach|all (of our )?users)\b/i,
  ],
  [TicketPriority.HIGH, /\b(cannot|can'?t|unable|blocked|failing|fails|error)\b/i],
  [TicketPriority.LOW, /\b(question|how (do|can) i|would be (nice|great)|feature|wondering)\b/i],
];

const REPLY_OPENERS: Record<TicketCategory, string> = {
  BILLING: 'I have checked your billing details and will make sure this is sorted out.',
  ACCOUNT: 'I am looking into your account access right now.',
  BUG_REPORT:
    'I am sorry for the trouble. Could you share the steps to reproduce the issue and roughly when it started?',
  FEATURE_REQUEST: 'This is a great suggestion, and I have shared it with our product team.',
  TECHNICAL:
    'I am investigating this on our side. If you have any request IDs or error messages, please send them over.',
  GENERAL: 'I am happy to help with this.',
};

/**
 * Deterministic keyword-based stand-in used when no OPENAI_API_KEY is set.
 * Good enough for local development, demos and tests, with zero cost and no network.
 */
export class MockAiProvider extends AiProvider {
  readonly model = 'mock';

  triage({ subject, description }: TriageInput): Promise<TriageResult> {
    const text = `${subject}\n${description}`;
    return Promise.resolve({
      category: pickCategory(text),
      priority: PRIORITY_RULES.find(([, re]) => re.test(text))?.[0] ?? TicketPriority.MEDIUM,
      summary: summarize(description),
    });
  }

  draftReply({ customerName, category }: ReplyInput): Promise<string> {
    const firstName = customerName.split(' ')[0] ?? customerName;
    return Promise.resolve(
      `Hi ${firstName},\n\nThanks for reaching out. ${REPLY_OPENERS[category]}\n\nBest regards,\nThe support team`,
    );
  }
}

function pickCategory(text: string): TicketCategory {
  let best: TicketCategory = TicketCategory.GENERAL;
  let bestHits = 0;
  for (const [category, re] of CATEGORY_KEYWORDS) {
    const hits = text.match(re)?.length ?? 0;
    if (hits > bestHits) {
      best = category;
      bestHits = hits;
    }
  }
  return best;
}

/** First sentence, capped at 160 characters. */
function summarize(description: string): string {
  const firstSentence = description.trim().split(/(?<=[.!?])\s/)[0] ?? description;
  return firstSentence.length > 160 ? `${firstSentence.slice(0, 157)}...` : firstSentence;
}
