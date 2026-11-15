# MEGHSURAE AI Manager — Security Remediation Report

**Date:** 2026-11-15  
**Scope:** Remaining security hardening tasks only. Existing architecture, approval model, and mobile dashboard were preserved.  
**Repository:** `YOUTUBE-MEGHSURAE-AI-Manager`  
**Working tree:** Separate remediation workspace; no GitHub push was performed.

## Executive summary

The remaining verified findings from the previous technical audit were addressed in the current source tree:

- Competitor research now uses the shared database limiter rather than the process-local limiter.
- Database limiter updates now run under serializable transaction isolation and retry Prisma serialization conflicts (`P2034`), preventing concurrent requests from silently losing updates.
- OAuth state records are atomically claimed with a conditional update before the verifier is used; concurrent callbacks cannot both consume the same state.
- MCP now supports short-lived, per-client credentials. Tokens are hashed at rest, expire after one hour, update last-used time, and can be revoked by client ID. The existing static `MCP_AUTH_TOKEN` remains as a bootstrap/admin credential for backward compatibility.
- Existing URL-form MCP tokens remain single-use, with their prior leakage warning preserved.
- Additive SQLite and PostgreSQL migrations were added for consumed OAuth state and MCP credentials.
- Migration, backup, ownership-cleanup, and production deployment instructions were corrected and expanded.
- Regression tests cover the new hardening invariants and concurrency model.

No live Google, YouTube, PostgreSQL, AI-provider, or real Android/browser test was performed. Those limitations are not represented as successful tests.

## Before-and-after checklist

| Finding | Before | After | Status |
|---|---|---|---|
| Competitor quota limiter | `src/services/ai-tasks.ts` used process-local `rateLimit` | Uses `databaseRateLimit` with a user-scoped shared bucket | FIXED |
| Concurrent DB limiter requests | Read/modify/upsert transaction had no explicit serialization or retry | Serializable transaction plus bounded `P2034` retry | FIXED for supported Prisma providers; live multi-instance test not run |
| OAuth callback state | `findUnique` followed by `delete` | Conditional `updateMany` claims unexpired, unconsumed state; only winner proceeds | FIXED |
| Static MCP bearer token | Reusable static token was the only header credential | Short-lived hashed per-client credentials issued through `/api/mcp/token`; static token retained only as bootstrap/admin fallback | PARTIALLY FIXED by design/backward compatibility |
| MCP URL token | Single-use database record, but URL leakage risk | Single-use behavior retained; documentation explicitly recommends headers and notes leakage | FIXED with residual transport risk |
| MCP credential storage | No per-client credential table | `McpCredential` stores hash, client ID, expiry, revocation, timestamps | FIXED |
| Owner constraint migration | Fresh-schema migration existed; upgrade procedure was underspecified | Additive migrations plus read-only validation, backup, manual ownership cleanup, and rollback guidance | FIXED procedurally; existing production DB not exercised |
| Production deployment docs | README recommended `db:push:pg` in Vercel build command | Production instructions use `db:migrate:pg`; `db push` is explicitly limited to disposable development DBs | FIXED |
| Regression coverage | Existing source invariants and pure tests | Added hardening tests, credential validation tests, OAuth-claim checks, limiter serialization checks, and contention model | FIXED at unit/source-test level |
| Approval safety | Server-side permission gates, drift checks, atomic change claim, uncertain state | Preserved unchanged and covered by existing tests plus new source checks | PRESERVED |

## Changed files

### Security and application code

- `src/lib/rate-limit.ts` — serializable transaction isolation, malformed bucket recovery, and `P2034` conflict retry.
- `src/services/ai-tasks.ts` — competitor quota changed to `databaseRateLimit`.
- `src/app/api/auth/callback/route.ts` — atomic OAuth state claim using `consumedAt`.
- `src/mcp/http.ts` — accepts validated short-lived per-client credentials in addition to bootstrap/static and one-use URL paths.
- `src/mcp/credentials.ts` — new hashed credential issue/authenticate/revoke/purge helpers.
- `src/app/api/mcp/token/route.ts` — protected POST issuance and DELETE revocation endpoint.
- `src/app/(app)/settings/page.tsx` — recommends per-client MCP credentials rather than distributing the bootstrap token.

### Database and migrations

- `prisma/schema.prisma` — `OAuthState.consumedAt` and `McpCredential` model.
- `prisma/schema.postgres.prisma` — matching PostgreSQL model changes.
- `prisma/postgresql/schema.prisma` — copied production schema synchronized with the hardening models and migration workflow.
- `prisma/migrations/20261115010000_security_hardening/migration.sql` — SQLite additive migration.
- `prisma/postgresql/migrations/20261115010000_security_hardening/migration.sql` — PostgreSQL additive migration.

### Tests and documentation

- `src/tests/security-hardening.test.ts` — new security/concurrency regression coverage.
- `README.md` — MCP credential workflow, production migration workflow, ownership validation, backup, and rollback guidance.
- `.env.example` — bootstrap-token and safer MCP credential guidance.
- `SECURITY-REMEDIATION-REPORT.md` — this report.

No secrets, API keys, OAuth tokens, or credentials were added to the repository.

## Detailed implementation notes

### Distributed rate limiting

`src/services/ai-tasks.ts` now imports and awaits `databaseRateLimit` for the five-search-per-hour competitor quota. `src/lib/rate-limit.ts` performs the read/filter/upsert operation in a Prisma transaction with `Prisma.TransactionIsolationLevel.Serializable`. Serialization conflicts identified as `P2034` are retried up to two times with a short backoff. Expired/malformed JSON bucket contents are safely treated as empty rather than crashing the request.

This prevents the previous lost-update class of race under providers supporting the requested isolation semantics. A production deployment should still confirm the selected PostgreSQL provider supports the configured isolation level and should monitor transaction-conflict rates.

### MCP credentials

`POST /api/mcp/token` requires the configured bootstrap `MCP_AUTH_TOKEN` and `X-MCP-Client-Id`. It returns a newly generated `mcp_...` token once and an expiry timestamp. Only `sha256Hex(token)` is stored. `authenticateMcpCredential` rejects malformed, expired, revoked, or unknown tokens and updates `lastUsedAt` after successful authentication.

`DELETE /api/mcp/token` revokes all active credentials for the supplied client ID. The endpoint is rate limited. Existing static bearer authentication remains supported as an administrative/bootstrap path so current MCP integrations do not break. It should not be distributed to ordinary clients.

URL tokens remain intentionally single-use only when `MCP_ALLOW_URL_TOKEN=true`; header-based credentials are preferred because URLs can leak through logs, browser history, proxy history, or referrer handling.

### OAuth state replay protection

The callback now uses:

```ts
updateMany({
  where: { state, expiresAt: { gt: now }, consumedAt: null },
  data: { consumedAt: now },
})
```

Only a callback returning `count === 1` can continue to use the verifier. A second concurrent callback sees `count === 0` and is rejected. PKCE, browser-bound state-cookie comparison, expiry, and email/owner checks remain intact.

### Migration and ownership safety

The new migrations are additive. They do not delete user data. Before applying the production migration, the README now requires a provider snapshot or verified `pg_dump`, read-only ownership/duplicate review, manual selection of the authorized owner if multiple users exist, and a controlled migration run. Migration failure is handled by restoring the verified snapshot or correcting the underlying issue; `db push` is not recommended as a recovery shortcut.

Fresh SQLite migration deployment and schema-diff validation were run successfully. PostgreSQL schema validation passed; a live PostgreSQL migration was not run because no PostgreSQL server was available.

## Verification results

All commands below were run against the hardened source tree after removing `node_modules` and reinstalling with `npm ci`.

| Check | Result |
|---|---|
| `npm ci --no-audit --no-fund` | PASSED; 175 packages installed and Prisma postinstall generation completed |
| `npm audit --audit-level=moderate` | PASSED; 0 vulnerabilities |
| `npm run typecheck` | PASSED |
| `npm test -- --reporter=dot` | PASSED; 10 test files, 59 tests |
| SQLite `prisma validate` | PASSED |
| PostgreSQL `prisma validate` | PASSED |
| Fresh SQLite `prisma migrate deploy` | PASSED; both initial and hardening migrations applied |
| SQLite migration schema diff | PASSED; empty diff after applying migrations |
| `npm run build` | PASSED; production Next.js build completed and `/api/mcp/token` was included |
| Live PostgreSQL migration | NOT RUN; no PostgreSQL server/credentials available |
| Live Google OAuth | NOT RUN; credentials/browser session unavailable |
| Live YouTube read/write | NOT RUN; credentials unavailable |
| Live MCP client interoperability | NOT RUN; external client unavailable |
| Real Android/browser responsive test | NOT RUN |

Non-blocking warnings: Next.js reports that the `middleware` convention is deprecated in favor of `proxy`; Vitest/Vite reports the existing CommonJS/ESM config-loader warning.

## Remaining risks and unresolved limitations

1. Static `MCP_AUTH_TOKEN` remains reusable until rotated because it is retained as the bootstrap/admin compatibility path. Do not give it to ordinary clients; issue per-client tokens instead.
2. Per-client MCP credentials are short-lived and revocable but not single-use. Reuse during their one-hour lifetime is intentional for MCP sessions.
3. URL-based MCP authentication remains inherently leak-prone even though it is single-use.
4. PostgreSQL multi-instance behavior and provider support for serializable transaction retries were not live-tested.
5. OAuth state atomicity is implemented in source and schema but not exercised against two live concurrent HTTP callbacks.
6. Existing production databases with multiple users require manual ownership resolution before the unique owner constraint can safely be applied. The application never performs automatic deletion or merging.
7. No scheduled worker, queue, continuous YouTube monitor, or autonomous automation was added. This task intentionally remained limited to security hardening.
8. No live external integration test proves YouTube write outcomes. The existing `UNCERTAIN` state and no-automatic-retry policy remain necessary.

## Deployment readiness

The application is suitable for a controlled staging deployment after configuring Node.js 20+, HTTPS, Google OAuth, YouTube APIs, PostgreSQL, secrets, and backups. Production deployment should follow this sequence:

1. Configure and verify a private deployment and PostgreSQL database.
2. Snapshot/backup the database and perform the documented read-only ownership review.
3. Run `npm run db:migrate:pg` and `npm run db:generate:pg`.
4. Run schema/typecheck/test/build checks in CI.
5. Configure `APP_URL`, Google redirect URI, `ALLOWED_EMAIL`, and encrypted secrets.
6. Run a controlled live OAuth/read test.
7. Issue a per-client MCP credential and test read-only MCP tools.
8. If enabling YouTube writes, use Approval mode first and perform one controlled private-resource write with manual verification.
9. Keep static bootstrap credentials out of client configuration and rotate them if exposure is suspected.

This is **not** a claim of live production readiness without those external steps.
