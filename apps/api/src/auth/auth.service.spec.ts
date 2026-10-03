import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { Role, type JwtPayload } from '@deskai/shared';
import type { Env } from '../config/env';
import type { User } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../users/password.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { hashRefreshToken } from './tokens';

const SECRET = 'unit-test-secret-unit-test-secret-123';
const ENV: Partial<Env> = {
  BCRYPT_ROUNDS: 4,
  JWT_ACCESS_TTL_SECONDS: 900,
  REFRESH_TOKEN_TTL_DAYS: 7,
};
const config = { get: (key: keyof Env) => ENV[key] } as unknown as ConfigService<Env, true>;

describe('AuthService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let passwords: PasswordService;
  let jwt: JwtService;
  let service: AuthService;
  let user: User;

  beforeAll(async () => {
    passwords = new PasswordService(config);
    user = {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'jane@example.com',
      name: 'Jane',
      role: Role.CUSTOMER,
      isActive: true,
      passwordHash: await passwords.hash('secret123'),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: 900 } });
    const users = new UsersService(prisma, passwords);
    service = new AuthService(prisma, users, passwords, jwt, config);
  });

  describe('register', () => {
    it('always creates a CUSTOMER and returns a session', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(user);

      const session = await service.register({
        email: user.email,
        name: 'Jane',
        password: 'secret123',
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ role: Role.CUSTOMER, email: user.email }),
      });
      const created = prisma.user.create.mock.calls[0]![0].data;
      expect(created.passwordHash).not.toBe('secret123');
      expect(session.auth.user).toMatchObject({ id: user.id, role: Role.CUSTOMER });
      expect(session.auth.user).not.toHaveProperty('passwordHash');
      expect(session.refreshToken).toHaveLength(43); // 32 bytes base64url
    });

    it('rejects a taken email', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      await expect(
        service.register({ email: user.email, name: 'Jane', password: 'secret123' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('issues a verifiable access token with id, email and role', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      const { auth } = await service.login({ email: user.email, password: 'secret123' });
      const payload = await jwt.verifyAsync<JwtPayload>(auth.accessToken);
      expect(payload).toMatchObject({ sub: user.id, email: user.email, role: Role.CUSTOMER });
      expect(auth.expiresIn).toBe(900);
    });

    it('stores only the hash of the refresh token', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      const session = await service.login({ email: user.email, password: 'secret123' });
      const stored = prisma.refreshToken.create.mock.calls[0]![0].data;
      expect(stored.tokenHash).toBe(hashRefreshToken(session.refreshToken));
      expect(stored.tokenHash).not.toBe(session.refreshToken);
    });

    it('gives the same error for unknown email and wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const unknown = service.login({ email: 'nobody@example.com', password: 'secret123' });
      await expect(unknown).rejects.toBeInstanceOf(UnauthorizedException);

      prisma.user.findUnique.mockResolvedValue(user);
      const wrong = service.login({ email: user.email, password: 'wrong-pass1' });
      await expect(wrong).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a deactivated account', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...user, isActive: false });
      await expect(
        service.login({ email: user.email, password: 'secret123' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('refresh', () => {
    const record = (overrides: Record<string, unknown> = {}) => ({
      id: 'rt-1',
      userId: user.id,
      tokenHash: 'h',
      familyId: 'fam-1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      createdAt: new Date(),
      user,
      ...overrides,
    });

    it('rotates: revokes the used token and issues a new one in the same family', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(record());
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const session = await service.refresh('raw-token');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'rt-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ familyId: 'fam-1', userId: user.id }),
      });
      expect(session.refreshToken).not.toBe('raw-token');
    });

    it('revokes the whole family when a used token is replayed', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(record({ revokedAt: new Date() }));

      await expect(service.refresh('stolen')).rejects.toMatchObject({
        response: { code: 'REFRESH_TOKEN_REUSED' },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'fam-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('treats losing a concurrent rotation race as reuse', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(record());
      prisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.refresh('raw')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    // Rows are built lazily: `user` only exists once beforeAll has run.
    it.each<[string, string | undefined, () => unknown]>([
      ['missing', undefined, () => null],
      ['unknown', 'raw', () => null],
      ['expired', 'raw', () => record({ expiresAt: new Date(Date.now() - 1000) })],
      ['for a deactivated user', 'raw', () => record({ user: { ...user, isActive: false } })],
    ])('rejects a %s token', async (_label, raw, found) => {
      prisma.refreshToken.findUnique.mockResolvedValue(found() as never);
      await expect(service.refresh(raw)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });
});
