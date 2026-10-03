import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from './auth-user';

const HEADER = 'x-request-id';
const VALID_ID = /^[\w-]{1,64}$/;

/** Accepts a sane incoming X-Request-Id or generates one, and echoes it on the response. */
export function requestIdMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const incoming = req.header(HEADER);
  const id = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader(HEADER, id);
  next();
}
