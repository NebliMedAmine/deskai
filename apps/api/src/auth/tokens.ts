import { createHash, randomBytes } from 'node:crypto';

export const REFRESH_COOKIE = 'deskai_rt';
/** The cookie is only sent to the auth endpoints, never to the rest of the API. */
export const REFRESH_COOKIE_PATH = '/api/auth';

export const generateRefreshToken = (): string => randomBytes(32).toString('base64url');

/** Only the SHA-256 digest is stored, so a database leak doesn't leak usable tokens. */
export const hashRefreshToken = (raw: string): string =>
  createHash('sha256').update(raw).digest('hex');
