/**
 * Compile-time guarantee that the Prisma enums and the @deskai/shared enums are identical.
 * If a value is added to one side only, `tsc` fails right here.
 */
import type * as Shared from '@deskai/shared';
import type * as Db from '../generated/prisma/enums';

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;

export type EnumSyncChecks = [
  Expect<Equal<Db.Role, Shared.Role>>,
  Expect<Equal<Db.TicketStatus, Shared.TicketStatus>>,
  Expect<Equal<Db.TicketPriority, Shared.TicketPriority>>,
  Expect<Equal<Db.TicketCategory, Shared.TicketCategory>>,
  Expect<Equal<Db.AiResultSource, Shared.AiResultSource>>,
];
