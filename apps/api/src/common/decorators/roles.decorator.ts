import { SetMetadata } from '@nestjs/common';
import type { Role } from '@deskai/shared';

export const ROLES_KEY = 'roles';

/** Restrict a controller or handler to the given roles. A handler-level value overrides the controller's. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
