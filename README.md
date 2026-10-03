# DeskAI

AI-assisted customer support / ticketing platform. Portfolio project: NestJS + Prisma + PostgreSQL API, React + Vite web app, shared TypeScript contracts.

> **Status:** Phase 2 of 5 done: auth, RBAC, tickets, users API + tests. AI triage (Phase 3), web app (Phase 4), analytics + full Docker setup (Phase 5) are next.

## Stack

| Layer    | Tech                                                                    |
| -------- | ----------------------------------------------------------------------- |
| API      | NestJS 11, TypeScript, class-validator, JWT (access + rotating refresh) |
| Database | PostgreSQL 17, Prisma 7 (driver adapter `@prisma/adapter-pg`)           |
| Shared   | `@deskai/shared`: enums, request/response types used by api + web       |
| Tests    | Jest (unit, mocked Prisma) + Supertest (e2e against a real test DB)     |
| Tooling  | pnpm workspaces, ESLint (type-aware), Prettier, Docker Compose          |

## Prerequisites

- Node.js ≥ 22.12
- pnpm ≥ 10 (`npm i -g pnpm` or `corepack enable`)
- Docker Desktop (running)

## Getting started

```bash
pnpm install                         # also builds @deskai/shared and generates the Prisma client
cp .env.example apps/api/.env        # defaults work out of the box for local dev
pnpm db:up                           # Postgres on localhost:5433 (+ a deskai_test database)
pnpm --filter @deskai/api db:deploy  # apply migrations
pnpm --filter @deskai/api db:seed    # demo data
pnpm dev:api                         # http://localhost:3000/api
```

### Demo accounts (password `Password123`)

| Role     | Email                                                            |
| -------- | ---------------------------------------------------------------- |
| Admin    | admin@deskai.dev                                                 |
| Agent    | agent1@deskai.dev, agent2@deskai.dev                             |
| Customer | customer1@deskai.dev, customer2@deskai.dev, customer3@deskai.dev |

## Scripts

| Command          | What it does                                                              |
| ---------------- | ------------------------------------------------------------------------- |
| `pnpm codegen`   | Rebuild `@deskai/shared` + regenerate the Prisma client (runs on install) |
| `pnpm test`      | Unit tests (no DB needed)                                                 |
| `pnpm test:e2e`  | E2E tests: boots the app against `deskai_test`                            |
| `pnpm lint`      | ESLint across the workspace                                               |
| `pnpm typecheck` | `tsc --noEmit` across the workspace                                       |
| `pnpm format`    | Prettier                                                                  |

## API overview

All routes are prefixed with `/api`. Every route requires `Authorization: Bearer <accessToken>` unless marked public.

| Method & path                  | Customer        | Agent | Admin |
| ------------------------------ | --------------- | ----- | ----- |
| `POST /auth/register`          | public          |       |       |
| `POST /auth/login`             | public          |       |       |
| `POST /auth/refresh`           | public (cookie) |       |       |
| `POST /auth/logout`            | public (cookie) |       |       |
| `GET /auth/me`                 | ✅              | ✅    | ✅    |
| `POST /tickets`                | ✅              | ✅    | ✅    |
| `GET /tickets`, `/tickets/:id` | own only        | all   | all   |
| `PATCH /tickets/:id`           | own, close only | ✅    | ✅    |
| `DELETE /tickets/:id`          | ❌              | ❌    | ✅    |
| `POST /tickets/:id/messages`   | own only        | ✅    | ✅    |
| `GET /users/assignable`        | ❌              | ✅    | ✅    |
| `GET/POST/PATCH /users…`       | ❌              | ❌    | ✅    |
| `GET /health`                  | public          |       |       |

`GET /tickets` supports `page`, `pageSize`, `status`, `priority`, `category` (comma-separated or repeated), `assigneeId` (`unassigned` allowed), `search` (text or `#1042`), `sortBy`, `sortOrder`.

### Error shape

Every error response looks like this:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "code": "VALIDATION_FAILED",
  "message": "Request validation failed",
  "details": [
    { "field": "subject", "messages": ["subject must be longer than or equal to 5 characters"] }
  ],
  "path": "/api/tickets",
  "timestamp": "2026-09-30T10:18:42.615Z",
  "requestId": "45f01325-f8a2-4936-9328-8842705239ed"
}
```

## Design notes

- **Refresh tokens** are random, stored only as SHA-256 hashes, sent as an `HttpOnly; SameSite=Strict` cookie scoped to `/api/auth`, and **rotated on every use**. Replaying a used token revokes the whole login session (token family), which is how stolen tokens are detected.
- **Row-level access**: customers get `404` (not `403`) for tickets they don't own, so ticket IDs can't be probed.
- **Business rules are pure functions** (`tickets/ticket-rules.ts`): status transitions and reply side effects are unit-tested without a database.
- **Type safety end to end**: DTO classes `implement` the shared request interfaces, and `common/enum-sync.ts` fails the build if Prisma and shared enums drift apart.
- **AI suggestions are stored separately** (`AiTriage`, `AiReplyDraft`) from the human-owned ticket fields, so "AI suggested vs final" can be measured.
