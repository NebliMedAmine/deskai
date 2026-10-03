import type { Role } from './enums';
import type { UserDto } from './users';

/** Public registration always creates a CUSTOMER. */
export interface RegisterRequest {
  email: string;
  name: string;
  /** Min 8 chars, at least one letter and one number */
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

/** The refresh token is set as an httpOnly cookie and never appears in a response body. */
export interface AuthResponse {
  accessToken: string;
  /** Access token lifetime in seconds */
  expiresIn: number;
  user: UserDto;
}

export interface JwtPayload {
  /** User id */
  sub: string;
  email: string;
  role: Role;
}

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/;
