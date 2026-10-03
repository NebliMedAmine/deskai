import { OpenAiProvider } from './openai.provider';

const completion = (content: string | null, extra: object = {}) => ({
  choices: [{ finish_reason: 'stop', message: { content, ...extra } }],
});

const respond = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('OpenAiProvider', () => {
  let fetchFn: jest.Mock<Promise<Response>, Parameters<typeof fetch>>;
  let provider: OpenAiProvider;
  const input = { subject: 'Charged twice', description: 'My card was charged twice.' };

  beforeEach(() => {
    fetchFn = jest.fn();
    provider = new OpenAiProvider('sk-test', 'gpt-test', 5000, fetchFn);
  });

  describe('triage', () => {
    it('sends a strict JSON-schema request and parses a valid answer', async () => {
      fetchFn.mockReturnValue(
        respond(
          completion('{"category":"BILLING","priority":"HIGH","summary":"Duplicate charge."}'),
        ),
      );

      await expect(provider.triage(input)).resolves.toEqual({
        category: 'BILLING',
        priority: 'HIGH',
        summary: 'Duplicate charge.',
      });

      const [url, init] = fetchFn.mock.calls[0]!;
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer sk-test' });
      const body = JSON.parse(init?.body as string) as Record<string, unknown>;
      expect(body).toMatchObject({
        model: 'gpt-test',
        response_format: { type: 'json_schema', json_schema: { strict: true } },
      });
    });

    it.each([
      ['malformed JSON', completion('not json'), /invalid JSON/],
      [
        'an unknown category',
        completion('{"category":"SALES","priority":"HIGH","summary":"x"}'),
        /validation/,
      ],
      ['a refusal', completion(null, { refusal: 'I cannot help' }), /refused/],
      ['an unexpected response shape', { foo: 1 }, /shape/],
    ])('rejects %s', async (_, body, error) => {
      fetchFn.mockReturnValue(respond(body));
      await expect(provider.triage(input)).rejects.toThrow(error);
    });

    it('rejects HTTP errors without leaking the response body', async () => {
      fetchFn.mockReturnValue(respond({ error: { message: 'secret detail' } }, 429));
      await expect(provider.triage(input)).rejects.toThrow('OpenAI request failed with HTTP 429');
    });
  });

  describe('draftReply', () => {
    it('returns the trimmed reply text', async () => {
      fetchFn.mockReturnValue(respond(completion('  Hi Chris,\n\nThanks!  ')));
      await expect(
        provider.draftReply({ ...input, category: 'BILLING', customerName: 'Chris', messages: [] }),
      ).resolves.toBe('Hi Chris,\n\nThanks!');
    });

    it('rejects a truncated reply', async () => {
      fetchFn.mockReturnValue(
        respond({ choices: [{ finish_reason: 'length', message: { content: 'Hi' } }] }),
      );
      await expect(
        provider.draftReply({ ...input, category: 'BILLING', customerName: 'Chris', messages: [] }),
      ).rejects.toThrow(/truncated/);
    });
  });
});
