import type { UserDto, UserSummary } from '@deskai/shared';
import type { User } from '../generated/prisma/client';

/** Prisma select for the public summary of a user (never includes passwordHash). */
export const userSummarySelect = { id: true, name: true, role: true } as const;

export const toUserSummary = (u: Pick<User, 'id' | 'name' | 'role'>): UserSummary => ({
  id: u.id,
  name: u.name,
  role: u.role,
});

export const toUserDto = (u: User): UserDto => ({
  id: u.id,
  name: u.name,
  role: u.role,
  email: u.email,
  isActive: u.isActive,
  createdAt: u.createdAt.toISOString(),
});
