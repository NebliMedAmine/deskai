import { MockAiProvider } from './mock-ai.provider';

describe('MockAiProvider', () => {
  const ai = new MockAiProvider();
  const triage = (subject: string, description: string) => ai.triage({ subject, description });

  it.each([
    ['Charged twice', 'My card was charged twice and I need a refund.', 'BILLING'],
    ['Cannot log in', 'The login page says invalid credentials after a password reset.', 'ACCOUNT'],
    ['Export crashes', 'The CSV export crashes with a 500 error.', 'BUG_REPORT'],
    ['Dark mode', 'It would be nice to have a dark mode, is it on the roadmap?', 'FEATURE_REQUEST'],
    [
      'Webhooks delayed',
      'Our webhook integration receives events with a lot of latency.',
      'TECHNICAL',
    ],
    ['Hello', 'I have a general question about your company.', 'GENERAL'],
  ])('categorizes "%s" as %s', async (subject, description, expected) => {
    await expect(triage(subject, description)).resolves.toMatchObject({ category: expected });
  });

  it.each([
    ['Site down', 'The whole app is down for all users.', 'URGENT'],
    ['Blocked', 'I cannot access my dashboard.', 'HIGH'],
    ['Question', 'How do I change my avatar?', 'LOW'],
    ['Slow pages', 'Pages take a few seconds to load.', 'MEDIUM'],
  ])('prioritizes "%s" as %s', async (subject, description, expected) => {
    await expect(triage(subject, description)).resolves.toMatchObject({ priority: expected });
  });

  it('summarizes with the first sentence, capped at 160 chars', async () => {
    const short = await triage('Subject', 'First sentence here. Second sentence.');
    expect(short.summary).toBe('First sentence here.');

    const long = await triage('Subject', 'x'.repeat(300));
    expect(long.summary).toHaveLength(160);
  });

  it('drafts a reply addressed to the customer by first name', async () => {
    const reply = await ai.draftReply({
      subject: 'Charged twice',
      description: 'Refund please',
      category: 'BILLING',
      customerName: 'Chris Customer',
      messages: [],
    });
    expect(reply).toMatch(/^Hi Chris,/);
  });
});
