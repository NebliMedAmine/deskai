import {
  Role,
  TicketStatus,
  type ApiErrorResponse,
  type Paginated,
  type SuggestReplyResponse,
  type TicketDetail,
  type TicketListItem,
  type TicketMessageDto,
  type UserSummary,
} from '@deskai/shared';
import { createTestApp, createUser, resetDb, type TestContext, type TestUser } from './utils';

describe('Tickets & RBAC (e2e)', () => {
  let ctx: TestContext;
  let admin: TestUser;
  let agent: TestUser;
  let alice: TestUser; // customer
  let bob: TestUser; // customer

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
    admin = await createUser(ctx, Role.ADMIN, 'admin@example.com');
    agent = await createUser(ctx, Role.AGENT, 'agent@example.com');
    alice = await createUser(ctx, Role.CUSTOMER, 'alice@example.com');
    bob = await createUser(ctx, Role.CUSTOMER, 'bob@example.com');
  });

  afterAll(() => ctx.app.close());

  async function createTicket(user: TestUser, subject = 'Cannot log in'): Promise<TicketDetail> {
    const res = await user
      .auth(ctx.http().post('/api/tickets'))
      .send({ subject, description: 'The login page says invalid credentials.' })
      .expect(201);
    return res.body as TicketDetail;
  }

  const patch = (user: TestUser, id: string, body: object) =>
    user.auth(ctx.http().patch(`/api/tickets/${id}`)).send(body);
  const reply = (user: TestUser, id: string, body: string) =>
    user.auth(ctx.http().post(`/api/tickets/${id}/messages`)).send({ body });

  describe('create + read', () => {
    it('creates an open ticket owned by the caller, triaged by the (mock) AI', async () => {
      const t = await createTicket(alice);
      expect(t).toMatchObject({
        status: TicketStatus.OPEN,
        priority: 'HIGH', // "Cannot log in"
        category: 'ACCOUNT',
        triage: null, // customers never see AI internals
        customer: { id: alice.id },
        assignee: null,
        messages: [],
        messageCount: 0,
      });
      expect(t.number).toBeGreaterThan(0);
    });

    it('customers only see their own tickets; other tickets are 404, not 403', async () => {
      const aliceTicket = await createTicket(alice, 'Alice ticket');
      await createTicket(bob, 'Bob ticket');

      const list = await bob.auth(ctx.http().get('/api/tickets')).expect(200);
      const page = list.body as Paginated<TicketListItem>;
      expect(page.total).toBe(1);
      expect(page.items[0]!.subject).toBe('Bob ticket');

      const res = await bob.auth(ctx.http().get(`/api/tickets/${aliceTicket.id}`)).expect(404);
      expect((res.body as ApiErrorResponse).code).toBe('TICKET_NOT_FOUND');
      await reply(bob, aliceTicket.id, 'sneaky').expect(404);
      await patch(bob, aliceTicket.id, { status: 'CLOSED' }).expect(404);
    });

    it('agents see all tickets and can filter', async () => {
      await createTicket(alice);
      const bobTicket = await createTicket(bob);
      await patch(agent, bobTicket.id, { priority: 'URGENT' }).expect(200);

      const all = await agent.auth(ctx.http().get('/api/tickets')).expect(200);
      expect((all.body as Paginated<TicketListItem>).total).toBe(2);

      const urgent = await agent
        .auth(ctx.http().get('/api/tickets?priority=URGENT,LOW'))
        .expect(200);
      expect((urgent.body as Paginated<TicketListItem>).items.map((t) => t.id)).toEqual([
        bobTicket.id,
      ]);
    });

    it('rejects a malformed id', async () => {
      await agent.auth(ctx.http().get('/api/tickets/not-a-uuid')).expect(400);
    });
  });

  describe('update', () => {
    it('customers may close their ticket but not change priority', async () => {
      const t = await createTicket(alice);

      const forbidden = await patch(alice, t.id, { priority: 'URGENT' }).expect(403);
      expect((forbidden.body as ApiErrorResponse).code).toBe('CUSTOMER_UPDATE_FORBIDDEN');

      const closed = await patch(alice, t.id, { status: 'CLOSED' }).expect(200);
      expect(closed.body).toMatchObject({ status: 'CLOSED', closedAt: expect.any(String) });
    });

    it('agents triage, assign and resolve', async () => {
      const t = await createTicket(alice);
      const res = await patch(agent, t.id, {
        status: 'RESOLVED',
        priority: 'HIGH',
        category: 'ACCOUNT',
        assigneeId: agent.id,
      }).expect(200);

      expect(res.body).toMatchObject({
        status: 'RESOLVED',
        priority: 'HIGH',
        category: 'ACCOUNT',
        assignee: { id: agent.id },
        resolvedAt: expect.any(String),
      });

      const unassigned = await patch(agent, t.id, { assigneeId: null }).expect(200);
      expect((unassigned.body as TicketDetail).assignee).toBeNull();
    });

    it('refuses to assign a ticket to a customer', async () => {
      const t = await createTicket(alice);
      const res = await patch(agent, t.id, { assigneeId: bob.id }).expect(400);
      expect((res.body as ApiErrorResponse).code).toBe('INVALID_ASSIGNEE');
    });
  });

  describe('messages', () => {
    it('threads replies and tracks first response + reopen on customer reply', async () => {
      const t = await createTicket(alice);

      const agentReply = await reply(agent, t.id, 'Can you try clearing cookies?').expect(201);
      expect(agentReply.body as TicketMessageDto).toMatchObject({
        author: { id: agent.id, role: 'AGENT' },
        fromAiDraft: false,
      });
      await patch(agent, t.id, { status: 'RESOLVED' }).expect(200);

      await reply(alice, t.id, 'Still broken!').expect(201);

      const detail = (await alice.auth(ctx.http().get(`/api/tickets/${t.id}`)).expect(200))
        .body as TicketDetail;
      expect(detail.status).toBe('OPEN'); // reopened by the customer reply
      expect(detail.resolvedAt).toBeNull();
      expect(detail.firstResponseAt).toEqual(expect.any(String));
      expect(detail.messages.map((m) => m.body)).toEqual([
        'Can you try clearing cookies?',
        'Still broken!',
      ]);
      expect(detail.messageCount).toBe(2);
    });

    it('refuses replies on a closed ticket', async () => {
      const t = await createTicket(alice);
      await patch(alice, t.id, { status: 'CLOSED' }).expect(200);
      const res = await reply(alice, t.id, 'one more thing').expect(409);
      expect((res.body as ApiErrorResponse).code).toBe('TICKET_CLOSED');
    });
  });

  describe('AI', () => {
    it('shows the stored triage to staff only', async () => {
      const t = await createTicket(alice);

      const detail = (await agent.auth(ctx.http().get(`/api/tickets/${t.id}`)).expect(200))
        .body as TicketDetail;
      expect(detail.triage).toMatchObject({
        suggestedCategory: 'ACCOUNT',
        suggestedPriority: 'HIGH',
        source: 'AI',
        model: 'mock',
      });

      const row = await ctx.prisma.aiTriage.findUniqueOrThrow({ where: { ticketId: t.id } });
      expect(row).toMatchObject({ attempts: 1, errorMessage: null });
    });

    it('drafts a reply that an agent can send once', async () => {
      const t = await createTicket(alice);
      const suggest = (user: TestUser) =>
        user.auth(ctx.http().post(`/api/tickets/${t.id}/suggest-reply`));

      await suggest(alice).expect(403);
      const draft = (await suggest(agent).expect(201)).body as SuggestReplyResponse;
      expect(draft).toMatchObject({ draftId: expect.any(String), model: 'mock' });
      expect(draft.content).toMatch(/^Hi alice,/);

      const send = () =>
        agent.auth(ctx.http().post(`/api/tickets/${t.id}/messages`)).send({
          body: `${draft.content}
(edited)`,
          aiDraftId: draft.draftId,
        });
      const sent = await send().expect(201);
      expect((sent.body as TicketMessageDto).fromAiDraft).toBe(true);

      const again = await send().expect(409);
      expect((again.body as ApiErrorResponse).code).toBe('AI_DRAFT_ALREADY_USED');
    });

    it('refuses to draft for a closed or unknown ticket', async () => {
      const t = await createTicket(alice);
      await patch(alice, t.id, { status: 'CLOSED' }).expect(200);
      await agent.auth(ctx.http().post(`/api/tickets/${t.id}/suggest-reply`)).expect(409);
      await agent
        .auth(ctx.http().post('/api/tickets/00000000-0000-4000-8000-000000000000/suggest-reply'))
        .expect(404);
    });
  });

  describe('delete (admin only)', () => {
    it('forbids agents and customers, allows admins', async () => {
      const t = await createTicket(alice);
      await alice.auth(ctx.http().delete(`/api/tickets/${t.id}`)).expect(403);
      await agent.auth(ctx.http().delete(`/api/tickets/${t.id}`)).expect(403);
      await admin.auth(ctx.http().delete(`/api/tickets/${t.id}`)).expect(204);
      await admin.auth(ctx.http().get(`/api/tickets/${t.id}`)).expect(404);
    });
  });

  describe('users (admin)', () => {
    it('is admin-only, except the assignable-staff list', async () => {
      await agent.auth(ctx.http().get('/api/users')).expect(403);
      await alice.auth(ctx.http().get('/api/users/assignable')).expect(403);

      const staff = (await agent.auth(ctx.http().get('/api/users/assignable')).expect(200))
        .body as UserSummary[];
      expect(staff.map((u) => u.role).sort()).toEqual(['ADMIN', 'AGENT']);

      const users = await admin.auth(ctx.http().get('/api/users?role=CUSTOMER')).expect(200);
      expect((users.body as Paginated<unknown>).total).toBe(2);
    });

    it('lets an admin create an agent, but not demote themselves', async () => {
      await admin
        .auth(ctx.http().post('/api/users'))
        .send({ email: 'new-agent@example.com', name: 'New', password: 'abc12345', role: 'AGENT' })
        .expect(201);

      const res = await admin
        .auth(ctx.http().patch(`/api/users/${admin.id}`))
        .send({ role: 'AGENT' })
        .expect(400);
      expect((res.body as ApiErrorResponse).code).toBe('CANNOT_MODIFY_SELF');
    });
  });
});
