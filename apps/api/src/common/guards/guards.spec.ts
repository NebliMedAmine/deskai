import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@deskai/shared';
import type { AuthenticatedRequest } from '../auth-user';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

function contextFor(req: Partial<AuthenticatedRequest>, metadata: Record<string, unknown> = {}) {
  const handler = () => undefined;
  for (const [key, value] of Object.entries(metadata)) Reflect.defineMetadata(key, value, handler);
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({ secret: 'test-secret-test-secret-test-secret!' });
  const guard = new JwtAuthGuard(new Reflector(), jwt);

  it('allows @Public() routes without a token', async () => {
    await expect(
      guard.canActivate(contextFor({ headers: {} }, { [IS_PUBLIC_KEY]: true })),
    ).resolves.toBe(true);
  });

  it('rejects a request without a token', async () => {
    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token signed with another secret', async () => {
    const forged = await new JwtService({
      secret: 'another-secret-another-secret-12345',
    }).signAsync({
      sub: 'u1',
      email: 'x@y.z',
      role: Role.ADMIN,
    });
    const req = { headers: { authorization: `Bearer ${forged}` } };
    await expect(guard.canActivate(contextFor(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired token', async () => {
    const expired = await jwt.signAsync(
      { sub: 'u1', email: 'x@y.z', role: Role.AGENT },
      { expiresIn: -10 },
    );
    const req = { headers: { authorization: `Bearer ${expired}` } };
    await expect(guard.canActivate(contextFor(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches the user for a valid token', async () => {
    const token = await jwt.signAsync({ sub: 'u1', email: 'x@y.z', role: Role.AGENT });
    const req: Partial<AuthenticatedRequest> = { headers: { authorization: `Bearer ${token}` } };
    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
    expect(req.user).toEqual({ id: 'u1', email: 'x@y.z', role: Role.AGENT });
  });
});

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  const as = (role: Role) => ({ user: { id: 'u', email: 'e', role } });

  it('allows any authenticated user when no roles are required', () => {
    expect(guard.canActivate(contextFor(as(Role.CUSTOMER)))).toBe(true);
  });

  it('allows a user whose role is listed', () => {
    const ctx = contextFor(as(Role.AGENT), { [ROLES_KEY]: [Role.AGENT, Role.ADMIN] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('forbids a user whose role is not listed', () => {
    const ctx = contextFor(as(Role.CUSTOMER), { [ROLES_KEY]: [Role.ADMIN] });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
