import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { AuthResponse, Role } from '@deskai/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

export const PASSWORD = 'Password123';

export interface TestContext {
  app: INestApplication<App>;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
}

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({ logger: false });
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService), http: () => request(app.getHttpServer()) };
}

export async function resetDb(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "TicketMessage", "AiReplyDraft", "AiTriage", "Ticket", "RefreshToken", "User" RESTART IDENTITY CASCADE',
  );
}

export interface TestUser {
  id: string;
  email: string;
  token: string;
  /** Raw Set-Cookie header value carrying the refresh token */
  refreshCookie: string;
  auth: (req: request.Test) => request.Test;
}

/** Inserts a user directly (any role) and logs in through the real API. */
export async function createUser(ctx: TestContext, role: Role, email: string): Promise<TestUser> {
  const user = await ctx.prisma.user.create({
    data: { email, name: email.split('@')[0]!, role, passwordHash: await bcrypt.hash(PASSWORD, 4) },
  });
  const res = await ctx
    .http()
    .post('/api/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  const token = (res.body as AuthResponse).accessToken;
  return {
    id: user.id,
    email,
    token,
    refreshCookie: getRefreshCookie(res),
    auth: (req) => req.set('Authorization', `Bearer ${token}`),
  };
}

export function getRefreshCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith('deskai_rt='));
  if (!cookie) throw new Error('No refresh cookie in response');
  return cookie;
}

/** "deskai_rt=abc; Path=/api/auth; ..." -> "deskai_rt=abc" (what a browser would send back). */
export const cookiePair = (setCookie: string): string => setCookie.split(';')[0]!;
