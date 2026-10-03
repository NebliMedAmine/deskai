import type { Request } from 'express';
import { Role } from '@deskai/shared';

/** The authenticated principal attached to `req.user` by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  requestId?: string;
}

export const isStaff = (role: Role): boolean => role === Role.AGENT || role === Role.ADMIN;
