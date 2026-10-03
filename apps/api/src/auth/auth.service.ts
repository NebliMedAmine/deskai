import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { Role, type AuthResponse, type JwtPayload } from '@deskai/shared';
import { apiError } from '../common/errors';
import type { Env } from '../config/env';
import type { User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../users/password.service';
import { toUserDto } from '../users/user.mapper';
import { UsersService } from '../users/users.service';
import type { LoginDto, RegisterDto } from './dto/auth.dto';
import { generateRefreshToken, hashRefreshToken } from './tokens';

export interface IssuedSession {
  /** Returned in the response body */
  auth: AuthResponse;
  /** Raw refresh token: goes into the httpOnly cookie, nowhere else */
  refreshToken: string;
  refreshExpiresAt: Date;
}

const invalidRefresh = () =>
  new UnauthorizedException(
    apiError('INVALID_REFRESH_TOKEN', 'Session expired, please log in again'),
  );

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async register(dto: RegisterDto): Promise<IssuedSession> {
    await this.users.assertEmailAvailable(dto.email);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        role: Role.CUSTOMER,
        passwordHash: await this.passwords.hash(dto.password),
      },
    });
    return this.issueSession(user, randomUUID());
  }

  async login(dto: LoginDto): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Always run bcrypt, even for unknown emails, so timing doesn't reveal which emails exist.
    const passwordOk = await this.passwords.verify(dto.password, user?.passwordHash);
    if (!user || !passwordOk) {
      throw new UnauthorizedException(apiError('INVALID_CREDENTIALS', 'Invalid email or password'));
    }
    if (!user.isActive) {
      throw new ForbiddenException(apiError('ACCOUNT_DISABLED', 'This account has been disabled'));
    }
    return this.issueSession(user, randomUUID());
  }

  /**
   * Rotates the refresh token. Each token is single-use: presenting a token that
   * was already used means it was probably stolen, so the whole login session
   * (token family) is revoked.
   */
  async refresh(rawToken: string | undefined): Promise<IssuedSession> {
    if (!rawToken) throw invalidRefresh();

    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(rawToken) },
      include: { user: true },
    });
    if (!record) throw invalidRefresh();

    if (record.revokedAt) {
      await this.revokeFamily(record.familyId);
      throw new UnauthorizedException(
        apiError('REFRESH_TOKEN_REUSED', 'Session was invalidated, please log in again'),
      );
    }
    if (record.expiresAt <= new Date() || !record.user.isActive) {
      await this.revokeFamily(record.familyId);
      throw invalidRefresh();
    }

    // Conditional update: if two requests race with the same token, only one wins.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) {
      await this.revokeFamily(record.familyId);
      throw invalidRefresh();
    }

    return this.issueSession(record.user, record.familyId);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(rawToken) },
      select: { familyId: true },
    });
    if (record) await this.revokeFamily(record.familyId);
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueSession(user: User, familyId: string): Promise<IssuedSession> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwt.signAsync(payload);

    const refreshToken = generateRefreshToken();
    const ttlDays = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    const refreshExpiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashRefreshToken(refreshToken),
        familyId,
        expiresAt: refreshExpiresAt,
      },
    });

    return {
      auth: {
        accessToken,
        expiresIn: this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true }),
        user: toUserDto(user),
      },
      refreshToken,
      refreshExpiresAt,
    };
  }
}
