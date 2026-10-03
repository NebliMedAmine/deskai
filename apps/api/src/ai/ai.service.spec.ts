import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { AiResultSource } from '@deskai/shared';
import type { AiProvider, ReplyInput } from './ai-provider';
import { AiService } from './ai.service';

const input = { subject: 'Charged twice', description: 'My card was charged twice this month.' };
const valid = { category: 'BILLING', priority: 'HIGH', summary: 'Duplicate charge.' } as const;

const replyInput: ReplyInput = {
  ...input,
  category: 'BILLING',
  customerName: 'Chris',
  messages: [],
};

describe('AiService', () => {
  let provider: DeepMockProxy<AiProvider>;
  let service: AiService;

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  beforeEach(() => {
    provider = mockDeep<AiProvider>();
    Object.defineProperty(provider, 'model', { value: 'test-model' });
    service = new AiService(provider);
  });

  describe('triage', () => {
    it('returns the model output on the first attempt', async () => {
      provider.triage.mockResolvedValue(valid);

      const result = await service.triage(input);

      expect(result).toMatchObject({
        suggestedCategory: 'BILLING',
        suggestedPriority: 'HIGH',
        summary: 'Duplicate charge.',
        source: AiResultSource.AI,
        model: 'test-model',
        attempts: 1,
        errorMessage: null,
      });
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('retries once and keeps the second answer', async () => {
      provider.triage.mockRejectedValueOnce(new Error('invalid JSON')).mockResolvedValue(valid);

      const result = await service.triage(input);

      expect(result).toMatchObject({ source: AiResultSource.AI, attempts: 2 });
      expect(provider.triage).toHaveBeenCalledTimes(2);
    });

    it('falls back to neutral defaults after two failures, without throwing', async () => {
      provider.triage.mockRejectedValue(new Error('HTTP 503'));

      const result = await service.triage(input);

      expect(result).toMatchObject({
        suggestedCategory: 'GENERAL',
        suggestedPriority: 'MEDIUM',
        source: AiResultSource.FALLBACK,
        attempts: 2,
        errorMessage: 'HTTP 503',
      });
      expect(result.summary).toContain('Charged twice');
      expect(provider.triage).toHaveBeenCalledTimes(2);
    });
  });

  describe('draftReply', () => {
    it('returns the draft with model and latency', async () => {
      provider.draftReply.mockResolvedValue('Hi Chris');
      await expect(service.draftReply(replyInput)).resolves.toMatchObject({
        content: 'Hi Chris',
        model: 'test-model',
      });
    });

    it('throws 503 AI_UNAVAILABLE after two failures', async () => {
      provider.draftReply.mockRejectedValue(new Error('timeout'));
      await expect(service.draftReply(replyInput)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(provider.draftReply).toHaveBeenCalledTimes(2);
    });
  });
});
