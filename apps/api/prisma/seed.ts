/**
 * Dev/demo seed: 1 admin, 2 agents, 3 customers, 20 tickets spread over the last 30 days.
 * Deterministic (seeded PRNG), so every reset produces the same demo data.
 * Wipes all existing data first. Never run it against production.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import {
  AiResultSource,
  PrismaClient,
  Role,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  type User,
} from '../src/generated/prisma/client';

const DEMO_PASSWORD = 'Password123';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// mulberry32: tiny deterministic PRNG
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = rng(42);
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;

interface SeedTicket {
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  /** What the "AI" suggested; differs from the final values on a few tickets for realistic agreement stats. */
  ai?: { category?: TicketCategory; priority?: TicketPriority };
  thread: string[];
}

const { OPEN, PENDING, RESOLVED, CLOSED } = TicketStatus;
const { LOW, MEDIUM, HIGH, URGENT } = TicketPriority;
const { BILLING, TECHNICAL, ACCOUNT, BUG_REPORT, FEATURE_REQUEST, GENERAL } = TicketCategory;

const TICKETS: SeedTicket[] = [
  {
    subject: 'Charged twice for my March subscription',
    description:
      'I see two identical charges of $49 on my card dated March 3rd. I only have one workspace. Please refund the duplicate.',
    category: BILLING,
    priority: HIGH,
    status: RESOLVED,
    thread: [
      'Sorry about that! I can confirm a duplicate charge. The refund has been issued and should appear in 5–10 business days.',
      'Great, thank you for the quick help.',
    ],
  },
  {
    subject: 'Cannot log in after password reset',
    description:
      'I reset my password this morning, got the confirmation email, but the login page still says "invalid credentials".',
    category: ACCOUNT,
    priority: HIGH,
    status: RESOLVED,
    thread: [
      'Thanks for reporting. Could you try clearing your browser cookies and logging in again? A stale session can cause this.',
      'That worked, thanks!',
    ],
  },
  {
    subject: 'Export to CSV produces an empty file',
    description:
      'When I export the "Q1 Leads" report to CSV the downloaded file is 0 bytes. PDF export works fine. Chrome 128 on Windows.',
    category: BUG_REPORT,
    priority: MEDIUM,
    status: PENDING,
    ai: { priority: HIGH },
    thread: [
      'I could reproduce this with reports containing more than 10k rows. Could you confirm roughly how many rows your report has?',
    ],
  },
  {
    subject: 'Whole dashboard is down for our team',
    description:
      'Nobody on our team can load the dashboard since 9:05. We just get a spinner and then a 502 error. This is blocking our sales team.',
    category: TECHNICAL,
    priority: URGENT,
    status: CLOSED,
    thread: [
      'We are aware of an incident affecting a subset of EU customers and are actively working on it.',
      'The incident is resolved. The root cause was a failed database failover. Apologies for the disruption.',
      'Confirmed, everything loads again.',
    ],
  },
  {
    subject: 'Feature request: dark mode',
    description:
      'Would love a dark mode for the web app, I work late and the white background is harsh.',
    category: FEATURE_REQUEST,
    priority: LOW,
    status: CLOSED,
    thread: ['Thanks for the suggestion! I have added your vote to our dark mode feature request.'],
  },
  {
    subject: 'How do I add a teammate?',
    description: 'I just upgraded to the Team plan. Where do I invite my colleagues?',
    category: GENERAL,
    priority: LOW,
    status: RESOLVED,
    ai: { category: ACCOUNT },
    thread: [
      'Go to Settings → Members → "Invite", then enter their email addresses. They will receive an invite link valid for 7 days.',
    ],
  },
  {
    subject: 'Invoice is missing our VAT number',
    description:
      'Our accounting team needs the company VAT number printed on invoices. I added it in billing settings but the last invoice does not show it.',
    category: BILLING,
    priority: MEDIUM,
    status: OPEN,
    thread: [],
  },
  {
    subject: 'API returns 429 even at low volume',
    description:
      'Our integration makes about 5 requests per minute but we keep getting HTTP 429 Too Many Requests from /v2/contacts.',
    category: TECHNICAL,
    priority: HIGH,
    status: OPEN,
    thread: [
      'Hi, could you share one of the request IDs from a failing call so we can check the rate limiter logs?',
    ],
  },
  {
    subject: 'Please delete my account and data',
    description:
      'I no longer use the service. Please delete my account and all associated personal data (GDPR).',
    category: ACCOUNT,
    priority: MEDIUM,
    status: PENDING,
    thread: [
      'We can do that. To confirm the request, please reply from the email address registered on the account.',
    ],
  },
  {
    subject: 'Mobile app crashes when opening attachments',
    description: 'On iOS 18, the app crashes every time I tap a PDF attachment in a conversation.',
    category: BUG_REPORT,
    priority: HIGH,
    status: OPEN,
    ai: { priority: MEDIUM },
    thread: [],
  },
  {
    subject: 'Can we get SSO with Okta?',
    description:
      'Our security team requires SSO. Do you support SAML with Okta, and on which plan?',
    category: FEATURE_REQUEST,
    priority: MEDIUM,
    status: RESOLVED,
    thread: [
      'Yes, SAML SSO (including Okta) is available on the Enterprise plan. I can connect you with our sales team if you like.',
      'Yes please, thanks.',
    ],
  },
  {
    subject: 'Webhook deliveries delayed by hours',
    description:
      'Webhooks for "deal.updated" arrive 2–3 hours late since yesterday. Our CRM sync depends on them.',
    category: TECHNICAL,
    priority: URGENT,
    status: PENDING,
    thread: [
      'We identified a backlog in our webhook queue and are draining it now. Could you confirm whether new events are arriving on time?',
    ],
  },
  {
    subject: 'Discount code not applied at checkout',
    description: 'The code SPRING25 shows as valid but the total price does not change.',
    category: BILLING,
    priority: LOW,
    status: CLOSED,
    ai: { priority: MEDIUM },
    thread: [
      'That code expired on April 1st. I have applied an equivalent 25% discount to your account manually.',
    ],
  },
  {
    subject: 'Typo on the pricing page',
    description: '"Anual" should be "Annual" in the pricing toggle.',
    category: BUG_REPORT,
    priority: LOW,
    status: RESOLVED,
    ai: { category: GENERAL },
    thread: ["Good catch, fixed in today's release. Thanks!"],
  },
  {
    subject: 'Two-factor codes not arriving by SMS',
    description:
      'I am not receiving 2FA codes by SMS (France, Orange). I am locked out of my account.',
    category: ACCOUNT,
    priority: URGENT,
    status: OPEN,
    thread: [],
  },
  {
    subject: 'Search does not find older conversations',
    description: 'Searching for a customer name only returns conversations from the last 90 days.',
    category: TECHNICAL,
    priority: MEDIUM,
    status: OPEN,
    ai: { category: BUG_REPORT },
    thread: [],
  },
  {
    subject: 'Request: bulk-edit tags',
    description: 'It would save us hours if we could add or remove a tag on many contacts at once.',
    category: FEATURE_REQUEST,
    priority: LOW,
    status: OPEN,
    thread: [],
  },
  {
    subject: 'Where can I download past invoices?',
    description: 'I need invoices for the last 12 months for our annual audit.',
    category: BILLING,
    priority: LOW,
    status: RESOLVED,
    thread: ['You can download all invoices under Settings → Billing → Invoice history.'],
  },
  {
    subject: 'Calendar sync duplicates events',
    description:
      'After connecting Google Calendar every meeting appears twice in the activity timeline.',
    category: BUG_REPORT,
    priority: MEDIUM,
    status: RESOLVED,
    thread: [
      'This happens when both the personal and the workspace calendar integrations are enabled. Disabling one of them fixes it.',
      'Disabled the personal one, duplicates are gone. Thanks.',
    ],
  },
  {
    subject: 'Question about data residency',
    description: 'Is our data stored in the EU? We need this for a customer contract.',
    category: GENERAL,
    priority: MEDIUM,
    status: OPEN,
    thread: [],
  },
];

async function main() {
  console.log('Clearing existing data…');
  await prisma.$transaction([
    prisma.ticketMessage.deleteMany(),
    prisma.aiReplyDraft.deleteMany(),
    prisma.aiTriage.deleteMany(),
    prisma.ticket.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);
  await prisma.$executeRaw`ALTER SEQUENCE "Ticket_number_seq" RESTART WITH 1001`;

  console.log('Creating users…');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const mkUser = (email: string, name: string, role: Role) =>
    prisma.user.create({ data: { email, name, role, passwordHash } });

  await mkUser('admin@deskai.dev', 'Ada Admin', Role.ADMIN);
  const agents = [
    await mkUser('agent1@deskai.dev', 'Alex Agent', Role.AGENT),
    await mkUser('agent2@deskai.dev', 'Sam Support', Role.AGENT),
  ];
  const customers = [
    await mkUser('customer1@deskai.dev', 'Chris Customer', Role.CUSTOMER),
    await mkUser('customer2@deskai.dev', 'Dana Doe', Role.CUSTOMER),
    await mkUser('customer3@deskai.dev', 'Eli Evans', Role.CUSTOMER),
  ];

  console.log('Creating tickets…');
  const now = Date.now();
  for (const [i, t] of TICKETS.entries()) {
    const customer = customers[i % customers.length]!;
    const agent: User = pick(agents);
    // Spread creation over the last 30 days, oldest first.
    const createdAt = new Date(now - (30 - i * 1.4) * DAY - random() * 6 * HOUR);
    const isDone = t.status === RESOLVED || t.status === CLOSED;
    const hasStaffReply = t.thread.length > 0;

    // Alternate staff / customer replies, starting with staff, spaced a few hours apart.
    let cursor = createdAt.getTime();
    const messages = t.thread.map((body, idx) => {
      cursor += (1 + random() * 10) * HOUR;
      return {
        body,
        authorId: idx % 2 === 0 ? agent.id : customer.id,
        createdAt: new Date(cursor),
      };
    });
    const lastActivity = new Date(cursor + (isDone ? HOUR : 0));

    await prisma.ticket.create({
      data: {
        subject: t.subject,
        description: t.description,
        category: t.category,
        priority: t.priority,
        status: t.status,
        customerId: customer.id,
        assigneeId: hasStaffReply || random() > 0.5 ? agent.id : null,
        createdAt,
        updatedAt: lastActivity,
        firstResponseAt: messages[0]?.createdAt ?? null,
        resolvedAt: isDone ? lastActivity : null,
        closedAt: t.status === CLOSED ? lastActivity : null,
        messages: { create: messages },
        triage: {
          create: {
            suggestedCategory: t.ai?.category ?? t.category,
            suggestedPriority: t.ai?.priority ?? t.priority,
            summary: t.description.length > 120 ? `${t.description.slice(0, 117)}…` : t.description,
            source: AiResultSource.AI,
            model: 'mock',
            attempts: 1,
            latencyMs: Math.round(300 + random() * 900),
            createdAt: new Date(createdAt.getTime() + 2000),
          },
        },
      },
    });
  }

  console.log(`\n✔ Seeded ${TICKETS.length} tickets.`);
  console.log(`  Log in with any of these (password: ${DEMO_PASSWORD}):`);
  console.log('    admin@deskai.dev · agent1@deskai.dev · agent2@deskai.dev');
  console.log('    customer1@deskai.dev · customer2@deskai.dev · customer3@deskai.dev');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
