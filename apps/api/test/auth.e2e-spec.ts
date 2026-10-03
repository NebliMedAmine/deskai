import { Role, type ApiErrorResponse, type AuthResponse } from '@deskai/shared';
import {
  cookiePair,
  createTestApp,
  createUser,
  getRefreshCookie,
  resetDb,
  type TestContext,
} from './utils';

describe('Auth (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(() => resetDb(ctx.prisma));
  afterAll(() => ctx.app.close());

  const register = (body: object) => ctx.http().post('/api/auth/register').send(body);

  describe('POST /auth/register', () => {
    it('creates a customer, returns an access token and sets a hardened refresh cookie', async () => {
      const res = await register({
        email: 'New@Example.com',
        name: 'New',
        password: 'abc12345',
      }).expect(201);
      const body = res.body as AuthResponse;

      expect(body.user).toMatchObject({
        email: 'new@example.com',
        role: Role.CUSTOMER,
        isActive: true,
      });
      expect(body.user).not.toHaveProperty('passwordHash');
      expect(body.accessToken).toEqual(expect.any(String));

      const cookie = getRefreshCookie(res);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\/api\/auth/);
      expect(JSON.stringify(body)).not.toContain(cookiePair(cookie).split('=')[1]);
    });

    it('rejects an attempt to self-assign a role', async () => {
      const res = await register({
        email: 'x@example.com',
        name: 'X',
        password: 'abc12345',
        role: 'ADMIN',
      }).expect(400);
      expect((res.body as ApiErrorResponse).details).toEqual([
        { field: 'role', messages: ['property role should not exist'] },
      ]);
    });

    it('rejects a duplicate email (case-insensitive)', async () => {
      await register({ email: 'dup@example.com', name: 'A', password: 'abc12345' }).expect(201);
      const res = await register({
        email: 'DUP@example.com',
        name: 'B',
        password: 'abc12345',
      }).expect(409);
      expect((res.body as ApiErrorResponse).code).toBe('EMAIL_TAKEN');
    });
  });

  describe('POST /auth/login + GET /auth/me', () => {
    it('logs in and returns the current user', async () => {
      const user = await createUser(ctx, Role.AGENT, 'agent@example.com');
      const res = await user.auth(ctx.http().get('/api/auth/me')).expect(200);
      expect(res.body).toMatchObject({ email: 'agent@example.com', role: Role.AGENT });
    });

    it('returns the consistent error shape for bad credentials', async () => {
      await createUser(ctx, Role.CUSTOMER, 'c@example.com');
      const res = await ctx
        .http()
        .post('/api/auth/login')
        .set('X-Request-Id', 'trace-123')
        .send({ email: 'c@example.com', password: 'wrong-password1' })
        .expect(401);
      expect(res.body).toEqual({
        statusCode: 401,
        error: 'Unauthorized',
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
        path: '/api/auth/login',
        timestamp: expect.any(String),
        requestId: 'trace-123',
      });
    });

    it('rejects requests without a token', async () => {
      const res = await ctx.http().get('/api/auth/me').expect(401);
      expect((res.body as ApiErrorResponse).code).toBe('UNAUTHENTICATED');
    });
  });

  describe('POST /auth/refresh', () => {
    const refresh = (setCookie: string) =>
      ctx.http().post('/api/auth/refresh').set('Cookie', cookiePair(setCookie));

    it('rotates the refresh token and detects reuse of an old one', async () => {
      const user = await createUser(ctx, Role.CUSTOMER, 'c@example.com');

      const first = await refresh(user.refreshCookie).expect(200);
      const rotatedCookie = getRefreshCookie(first);
      expect(cookiePair(rotatedCookie)).not.toBe(cookiePair(user.refreshCookie));

      // Replaying the original token = theft signal -> whole session revoked.
      const replay = await refresh(user.refreshCookie).expect(401);
      expect((replay.body as ApiErrorResponse).code).toBe('REFRESH_TOKEN_REUSED');

      // ...including the legitimately rotated token.
      await refresh(rotatedCookie).expect(401);
    });

    it('returns 401 without a cookie', async () => {
      await ctx.http().post('/api/auth/refresh').expect(401);
    });

    it('stops working after logout', async () => {
      const user = await createUser(ctx, Role.CUSTOMER, 'c@example.com');
      await ctx
        .http()
        .post('/api/auth/logout')
        .set('Cookie', cookiePair(user.refreshCookie))
        .expect(204);
      await refresh(user.refreshCookie).expect(401);
    });

    it('stops working once an admin deactivates the user', async () => {
      const admin = await createUser(ctx, Role.ADMIN, 'admin@example.com');
      const user = await createUser(ctx, Role.AGENT, 'agent@example.com');
      await admin
        .auth(ctx.http().patch(`/api/users/${user.id}`))
        .send({ isActive: false })
        .expect(200);
      await refresh(user.refreshCookie).expect(401);
      await ctx
        .http()
        .post('/api/auth/login')
        .send({ email: user.email, password: 'Password123' })
        .expect(403);
    });
  });
});
