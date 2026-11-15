# MEGHSURAE AI Manager — Security Remediation Report

Date: 2026-11-15

## Scope and source preservation

The GitHub repository was cloned into a separate workspace. The original tracked archive `meghsurae-ai-manager.zip` was inspected and left untouched. Its SHA-256 before work was:

`c84837139e05ecf8ac0afc89a6b80495db6475b88242143d5aad053c8f016640`

All corrections were made in an extracted working copy. No GitHub push was performed.

## Completed fixes

### Security and reliability

- Replaced process-local API/MCP rate limiting with a database-backed sliding-window limiter using the new `RateLimitBucket` table. The pure in-memory helper remains only for deterministic unit tests.
- Added streaming request-body limits for normal API JSON and MCP JSON-RPC requests. Both paths check `Content-Length` early and enforce the limit while consuming the `ReadableStream`, preventing oversized chunked requests from being buffered without bound.
- Closed the OAuth single-owner check-then-create race with a database-enforced unique `User.ownerKey = "owner"` claim. Concurrent ownership conflicts are handled as `instance_taken` rather than creating another account.
- Made URL-form MCP credentials single-use through the new `McpTokenUse` table and constant-time comparison. Static `Authorization: Bearer` credentials remain supported for MCP clients and must be rotated if exposed.
- Preserved atomic pending-change claims with `UPDATE ... WHERE status = PENDING`, preventing concurrent double execution.
- Added an explicit `UNCERTAIN` change state for network, timeout, and 5xx failures after a YouTube write is started. Such operations are not automatically returned to retryable `PENDING`, because YouTube may have accepted the write before the response was lost.
- Kept drift checks, explicit confirmation, approval-only UI execution, MCP prohibition from approving changes, CSRF Origin checks, constant-time comparisons, encrypted token storage, sanitized errors, and YouTube thumbnail SSRF restrictions.

### Database and dependencies

- Added SQLite and PostgreSQL schema support for `ownerKey`, `RateLimitBucket`, and `McpTokenUse`.
- Added deployable migration histories:
  - `prisma/migrations/20261115000000_initial/migration.sql`
  - `prisma/postgresql/migrations/20261115000000_initial/migration.sql`
- Added connector lock files and explicit `db:migrate` / `db:migrate:pg` scripts.
- Added a generated `package-lock.json` and verified a clean `npm ci` installation.
- Updated direct dependencies including Next.js 16.4.6, Sharp 0.35.5, PostCSS 8.5.23, Vitest 5.1.0, Vite 8.3.8, Zod 4.6.7, and Prisma/@prisma/client 6.19.3. The Prisma version was kept at the compatible stable release rather than moving to the incompatible Prisma 7 runtime configuration.
- Added an npm override for the vulnerable `deepmerge-ts` transitive package.

### Documentation and tests

- Updated `README.md` and `.env.example` for migrations, shared rate limiting, one-use URL credentials, verification status, and current limitations.
- Added `src/tests/security-remediation.test.ts` covering the source-level invariants for bounded bodies, database rate limiting, owner uniqueness, uncertain writes, and MCP tool restrictions.

## Verification performed

All commands below were run after a clean `npm ci` installation from the generated lockfile.

| Check | Result |
|---|---|
| `npm ci --no-audit --no-fund` | Passed; 175 packages installed and Prisma client generated |
| `npm audit --audit-level=moderate` | Passed; 0 vulnerabilities |
| `npm run typecheck` | Passed |
| `npm test -- --reporter=dot` | Passed; 9 test files, 54 tests |
| `npx prisma validate --schema prisma/schema.prisma` | Passed |
| `npx prisma validate --schema prisma/schema.postgres.prisma` | Passed |
| SQLite `prisma migrate deploy` to temporary database | Passed; initial migration applied |
| SQLite migration diff against schema | Passed; empty diff apart from migration metadata comment |
| `npm run build` | Passed; Next.js production build completed and all routes compiled |

The test runner prints a non-failing Vite warning about the current CommonJS/ESM loading convention in `vitest.config.ts`. Next.js prints a non-failing warning that the `middleware` convention is deprecated in favor of `proxy`; behavior remains compiled and verified.

## Remaining limitations

- No live Google OAuth, YouTube Data API, YouTube Analytics API, AI provider, or real-browser responsive test was run because those require operator credentials and external services.
- PostgreSQL schema validation and migration SQL generation were completed, but applying the PostgreSQL migration against a live server was not possible without a database connection.
- A static MCP bearer token is reusable until rotated. URL-form tokens are single-use but can still appear in logs/history before being consumed; use header authentication where possible.
- Database-backed rate limiting is shared across app instances, while application cache entries remain process-local.
- Existing deployments must apply the appropriate migration before serving requests after upgrading. Back up the database first, especially if it already contains more than one `User` row; the new singleton owner constraint intentionally allows only one owner.
- YouTube does not provide an idempotency key for all supported writes. The `UNCERTAIN` state prevents unsafe automatic retries, but an operator must verify the live channel before making a new proposal.
