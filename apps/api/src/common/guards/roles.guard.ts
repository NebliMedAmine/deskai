import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@deskai/shared';
import type { AuthenticatedRequest } from '../auth-user';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { apiError } from '../errors';

/** Global guard, runs after JwtAuthGuard. Routes without @Roles() are open to any authenticated user. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (user && required.includes(user.role)) return true;

    throw new ForbiddenException(
      apiError('INSUFFICIENT_ROLE', 'You do not have permission to perform this action'),
    );
  }
}
