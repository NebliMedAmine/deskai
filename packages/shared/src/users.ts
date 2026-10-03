import type { PaginationQuery } from './api';
import type { Role } from './enums';

export interface UserSummary {
  id: string;
  name: string;
  role: Role;
}

export interface UserDto extends UserSummary {
  email: string;
  isActive: boolean;
  createdAt: string;
}

/** Admin only */
export interface CreateUserRequest {
  email: string;
  name: string;
  password: string;
  role: Role;
}

/** Admin only */
export interface UpdateUserRequest {
  name?: string;
  role?: Role;
  isActive?: boolean;
}

export interface UserListQuery extends PaginationQuery {
  role?: Role;
  /** Matches name or email */
  search?: string;
}
