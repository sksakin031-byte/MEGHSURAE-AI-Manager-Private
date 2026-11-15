# MEGHSURAE AI Manager

An approval-gated, mobile-first dashboard for managing the YouTube channel **@MEGHSURAE**: channel analysis, Bengali + English SEO, thumbnail checks, playlist organisation, analytics, content strategy, an in-app AI assistant, and an MCP server so Claude can work with the same tools.

> **Status.** The project includes checked-in migrations, a generated lockfile, security tests, and the verification commands listed under [Verification](#verification). Live Google/YouTube calls still require the operator's credentials and are not part of CI.

## Features actually implemented

| Area | What it does | Needs |
|---|---|---|
| Sign-in | Google OAuth 2.0 (authorization code + PKCE + state + browser-bound cookie), encrypted token storage, 14-day sessions, single-owner lock | Google OAuth client |
| Channel overview | Title, handle, subscribers (rounded by YouTube; "Hidden" if hidden), views, video count, latest uploads, with retrieval time and API source | OAuth |
| Videos | All uploads (up to 100): title, description, tags, thumbnail, publish date, duration, views, privacy; search, sort; per-video SEO score | OAuth |
| SEO workspace | Rule-based checklist (title, description, tags, hashtags, language, search-intent wording), keyword extraction, title variants, tag/hashtag suggestions; Bengali and English; optional AI rewrite ideas | OAuth; AI key optional |
| Competitor research | Top public videos for a keyword via the official YouTube search API: common keywords, tags, title patterns (costs ~101 quota units; max 5/hour) | OAuth |
| Thumbnails | Pixel analysis of the served thumbnail: contrast, brightness, colourfulness, edge detail, centre focus, mobile-size legibility; concept briefs + copyable image prompts | OAuth |
| Playlists | List playlists, suggest groups by shared keywords, propose create / rename / add-video | OAuth (+ edit access to apply) |
| Channel audit | Prioritised checklist: description, keywords, banner, trailer, homepage sections, playlists, upload cadence, video descriptions/tags/title length | OAuth |
| Analytics | Views, watch time, avg. view duration, net subscribers, likes, comments, thumbnail impressions and CTR (where the API returns them), daily chart, top videos, comparison with the previous equal-length period. **Unavailable data is shown as "Unavailable", never as 0** | OAuth with analytics scope |
| Strategy | Content ideas, weekly/monthly upload plan and checklist computed from *your* views-per-day data; optional AI narrative | OAuth; AI optional |
| AI assistant | Chat that sees a summary of your channel data. It can read and advise; it cannot change anything | AI key |
| Permission modes | **Read**, **Approval**, **Write** (details below) | – |
| Changes & log | Before/after diff, approve/reject, "prepare a revert", full activity log (UI, MCP and system actions) | – |
| MCP server | `POST /api/mcp`, Streamable-HTTP JSON-RPC, Bearer auth, 12 tools | `MCP_AUTH_TOKEN` |
| UI | Android-first layout (bottom nav), desktop sidebar, light/dark theme, installable as a home-screen app (web manifest) | – |

**Not implemented (on purpose or not possible):** deleting videos/playlists (no delete operation exists anywhere in the code), uploading videos or thumbnails, comment moderation, scraping YouTube pages, search-volume data (the YouTube API does not provide it), a promised CTR/ranking improvement of any kind, scheduled background jobs.

## Permission model

| Mode | Can analyse | Can prepare changes | Can change YouTube |
|---|---|---|---|
| **Read** (default) | yes | no | no |
| **Approval** | yes | yes (shows before/after) | only when *you* press **Approve & apply** on the Changes page |
| **Write** | yes | yes | additionally "Apply now" in the UI, each time behind a confirm dialog |

Enforced on the server in `src/lib/permissions.ts` (unit-tested) and re-checked on every request:
* Changes need Google **edit** access (`youtube.force-ssl`). Sign-in defaults to read-only access (`youtube.readonly`).
* MCP clients (Claude) can **prepare** changes and, only in Write mode, call `apply_change` with `confirm: true`. They can **never approve** a pending proposal; that is a UI-only action.
* Executed changes re-fetch the live value first and abort (back to Pending) if it changed since the proposal ("drift check").
* Supported changes: video title / description / tags, playlist create (private by default) / rename / add video. Everything is logged in the activity log.

## Technology and cost

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 3 · Lucide · Prisma 6 · Zod 4 · Vitest 5 · `sharp` (thumbnail pixels). MCP is implemented by hand in `src/mcp/` (no SDK dependency).

| Item | Cost / limit |
|---|---|
| All npm packages | free, open source |
| YouTube Data API v3 + YouTube Analytics API | free, default quota **10,000 units/day** per Google Cloud project (list calls ≈ 1 unit, `videos.update` 50, search 100). Resets at midnight Pacific Time |
| Google OAuth | free |
| SQLite (local dev) | free, local file |
| Gemini API (optional AI) | has a **free tier with rate/daily limits** that Google may change; check current terms |
| Anthropic API (optional AI) | **paid**; never required. Leave `ANTHROPIC_API_KEY` empty to avoid it |
| Hosting | Local: free. Vercel Hobby, Neon/Supabase Postgres etc. have free tiers **with limits and terms** (Vercel Hobby is for personal, non-commercial use). SQLite files do **not** persist on serverless hosts, so production needs Postgres |

The app works with **no AI key at all** (rule-based analysis only). Everything marked "OAuth" needs your own Google Cloud project.

## Quick start

Requires Node.js 20+.

```bash
npm install
cp .env.example .env          # then edit .env (see below)
npm run gen:secrets           # prints TOKEN_ENCRYPTION_KEY and MCP_AUTH_TOKEN values
npm run db:migrate            # applies checked-in migrations and creates prisma/dev.db
npm run dev                   # http://localhost:3000
```

Other commands: `npm run typecheck`, `npm test`, `npm run build`, `npm run db:studio`, `npm run db:migrate:pg`.

### Google Cloud setup

1. Open <https://console.cloud.google.com/>, create a project (e.g. "meghsurae-manager").
2. **APIs & Services → Library**: enable **YouTube Data API v3** and **YouTube Analytics API** (two separate APIs).
3. **OAuth consent screen**: user type *External*; add your Google account as a **test user**.
   * Scopes used: `openid`, `email`, `profile`, `youtube.readonly` *or* `youtube.force-ssl`, `yt-analytics.readonly`.
   * ⚠ While the app is in **Testing** status Google expires refresh tokens after about **7 days**, so you will need to sign in again weekly. Setting the status to *In production* removes that, but an unverified app shows a warning screen and is capped at 100 users, which is fine for a personal tool. Verification is only needed to go beyond that.
4. **Credentials → Create credentials → OAuth client ID → Web application**. Add **Authorized redirect URI** exactly: `http://localhost:3000/api/auth/callback` (and later `https://YOUR-DOMAIN/api/auth/callback`).
5. Copy the client ID and secret into `.env`. The secret stays on the server; it is never sent to the browser.

### Environment variables (`.env.example`)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `file:./dev.db` locally; a `postgresql://…` URL in production |
| `APP_URL` | yes | Public base URL, no trailing slash. Must match the redirect URI host. Used for CSRF origin checks |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | yes | From step 5 |
| `TOKEN_ENCRYPTION_KEY` | yes | ≥ 32 chars; AES-256-GCM key material for stored Google tokens. Changing it invalidates stored tokens (sign in again) |
| `ALLOWED_EMAIL` | recommended | Only this Google account may sign in. If empty, the first account to sign in owns the instance and others are rejected |
| `MCP_AUTH_TOKEN` | optional | ≥ 24 chars. Bootstrap/admin secret for `/api/mcp` and `/api/mcp/token`; prefer short-lived client credentials |
| `MCP_ALLOW_URL_TOKEN` | optional | `true` enables `/api/mcp/<token>` for clients that cannot send headers (less safe) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | optional | Free-tier AI (preferred if both keys are set) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | optional | Paid AI |

The app refuses to start requests with placeholder or invalid values and lists only the **names** of bad variables.

## Using it

1. Open the app, **Sign in with Google (read-only)**. You land in **Read mode**.
2. Explore Overview, Videos, SEO, Thumbnails, Analytics, Channel audit.
3. To apply edits: Settings → **Enable editing** (re-consent with edit scope) → choose **Approval** mode.
4. In the SEO workspace edit title/description/tags → **Prepare change for approval** → open **Changes**, check before/after → **Approve & apply**.
5. Made a mistake? Changes → **Prepare a revert**, then approve it. Reverts are ordinary proposals.

## MCP connection (Claude)

Enable by setting `MCP_AUTH_TOKEN`. Endpoint: `https://YOUR-DOMAIN/api/mcp` (stateless Streamable HTTP; protocol versions 2025-06-18, 2025-03-26, 2024-11-05). It must be reachable over **public HTTPS** for remote clients (localhost only works for local clients). The static token is a bootstrap/admin secret; do not distribute it to every client.

Tools: `get_channel_info`, `list_videos`, `analyze_video`, `suggest_seo`, `analyze_thumbnail`, `list_playlists`, `get_analytics_report`, `audit_channel`, `propose_metadata_update`, `propose_playlist_change`, `list_changes`, `apply_change`.

Examples (client features change; check current docs):

```bash
# Claude Code
claude mcp add --transport http meghsurae https://YOUR-DOMAIN/api/mcp \
  --header "Authorization: Bearer $MCP_AUTH_TOKEN"

# Claude Desktop (claude_desktop_config.json), via the mcp-remote bridge
{ "mcpServers": { "meghsurae": { "command": "npx",
  "args": ["mcp-remote", "https://YOUR-DOMAIN/api/mcp", "--header", "Authorization: Bearer ${MCP_AUTH_TOKEN}"],
  "env": { "MCP_AUTH_TOKEN": "your-token" } } } }
```

For per-client credentials, issue a one-hour token using the bootstrap secret and a client identifier:

```bash
curl -s -X POST https://YOUR-DOMAIN/api/mcp/token \
  -H "Authorization: Bearer $MCP_AUTH_TOKEN" \
  -H "X-MCP-Client-Id: claude-desktop"
```

Use the returned token as `Authorization: Bearer <token>`. Credentials are stored only as hashes, expire after one hour, and can be revoked with `DELETE /api/mcp/token` using the same client ID. Claude.ai's custom-connector screen may not offer a static Bearer-token field. If needed, set `MCP_ALLOW_URL_TOKEN=true` and use `https://YOUR-DOMAIN/api/mcp/<token>` for a **single request only**; URL credentials can leak through logs/history and must not be reused. Full OAuth for the MCP endpoint itself is **not** implemented.

Quick local test:
```bash
curl -s http://localhost:3000/api/mcp -H "Authorization: Bearer $MCP_AUTH_TOKEN" \
  -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
MCP tools act on the account that signed in to the web app (single owner). Tool results are *data*; video titles/descriptions are untrusted text, so MCP and AI prompts treat them as data and never as instructions.

## Database

* Local: SQLite, `prisma/schema.prisma`, `npm run db:migrate`.
* Production: PostgreSQL, `prisma/postgresql/schema.prisma`, `npm run db:migrate:pg && npm run db:generate:pg`.
* Tables: `User` (encrypted tokens, unique owner claim, mode), `Session` (hashed tokens), `OAuthState` (atomically consumed), `RateLimitBucket`, `McpTokenUse`, `McpCredential` (hashed, expiring, revocable client tokens), `PendingChange`, `ActivityLog`.

### Production migration and backup runbook

Before applying the owner-claim hardening migration to an existing database:

1. Take a provider snapshot or run `pg_dump --format=custom --file=before-meghsurae-migration.dump "$DATABASE_URL"` and verify that the dump can be listed/restored in a disposable database.
2. Run a read-only duplicate/ownership review: `SELECT COUNT(*) FROM "User"; SELECT "googleSub", COUNT(*) FROM "User" GROUP BY "googleSub" HAVING COUNT(*) > 1;`. Do not automatically delete or merge users.
3. If more than one user exists, stop and choose the single authorized owner manually; export any required audit data before a controlled cleanup. The unique `ownerKey` migration must not be applied until the data is consistent.
4. Run `npm run db:migrate:pg` and record the migration output. If it fails, restore the snapshot or fix the data/schema issue and rerun; do not use `db push` as a recovery shortcut.
5. Verify `npx prisma validate --schema prisma/schema.postgres.prisma`, application startup, OAuth login, and the MCP credential endpoint after migration.

For local SQLite, copy `dev.db` before `npm run db:migrate`; migrations are additive and can be reapplied only through Prisma's migration history.

## Deployment (free-tier options)

**Vercel Hobby + free Postgres (e.g. Neon or Supabase)**: limits and terms apply; confirm they suit you.
1. Push the project to a **private** GitHub repo (see below).
2. Create a Postgres database; copy its connection string.
3. Vercel → *Add New Project* → import the repo. Set the env vars above (`APP_URL=https://your-project.vercel.app`).
4. Apply production migrations before the application build/start: `npm run db:migrate:pg && npm run db:generate:pg && next build`. Do not use `db push` against production; reserve `db:push:pg` for disposable development databases only.
5. Add `https://your-project.vercel.app/api/auth/callback` to the Google OAuth client's redirect URIs.
6. Open the site and sign in.

Caveats: rate limiting is stored in the configured database and is shared across app instances; cache entries remain in memory per instance; serverless cold starts apply; a free tier may pause or throttle.
Any VPS/Docker host with Node 20+ also works (`npm run build && npm start`); a VPS is usually not free.

## GitHub upload

```bash
git init
git add .
git status            # confirm .env is NOT listed
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOU/meghsurae-ai-manager.git
git push -u origin main
```
Create the repository as **Private**. `.gitignore` already excludes `.env*` (except `.env.example`), `node_modules`, `.next` and `*.db`.

## Android guide

An Android phone is a good *client* but a poor place to build Node/Prisma projects. Recommended path:

1. **Get the code onto GitHub.** Easiest from any computer with the commands above. Phone-only option: install **Termux** (from F-Droid), then `pkg install git unzip`, copy the ZIP into Termux storage (`termux-setup-storage`), `unzip`, run the git commands above, and authenticate with a GitHub personal access token. This step needs only git, not Node.
2. **Deploy** with the Vercel steps above (the Vercel and Google Cloud websites work in Android Chrome; use "Desktop site" for the Google Cloud console).
3. **Install as an app:** open your deployed URL in Chrome → ⋮ menu → *Add to Home screen / Install app*.
4. Sign in; keep **Read mode** unless you are about to apply an edit.

Running the dev server inside Termux is not covered or tested.

## Testing

`npm test` runs Vitest unit tests in `src/tests/`: permission rules, token encryption + PKCE, YouTube field limits, date windows, rate limiter, SEO/keyword/intent logic (Bengali + English), thumbnail metrics, channel audit, strategy, playlist grouping, change validation, MCP protocol core. External integrations (Google OAuth, YouTube APIs, AI providers, thumbnail download) need real credentials and are **not** covered by automated tests.

## Verification

Verified in the remediation workspace:
* ✅ `npm audit --audit-level=moderate`: 0 vulnerabilities.
* ✅ `npm run typecheck`: passed.
* ✅ `npm test`: 54 tests passed across 9 files, including security-remediation invariants.
* ✅ `npx prisma validate` for SQLite and PostgreSQL schemas: passed.
* ✅ SQLite migration deployed to a temporary database; migration diff is empty.
* ✅ `npm run build`: production Next.js build passed.
* ⏳ No live Google/YouTube/AI call or real-browser responsive test was performed because those require the operator's credentials and an external browser session.

## Security notes

* Secrets only from environment variables; `.env` ignored by git; client secret and tokens never reach the browser.
* Google tokens encrypted at rest (AES-256-GCM). Session cookies: random 256-bit token (only its SHA-256 is stored), `HttpOnly`, `SameSite=Lax`, `Secure` + `__Host-` prefix on HTTPS.
* OAuth: PKCE (S256), single-use server-side `state`, browser-bound cookie, 10-minute expiry, verified email, single-owner lock.
* CSRF: every mutating API call requires `Origin` to equal `APP_URL`. All inputs validated with Zod; request bodies size-limited; per-user/IP rate limits.
* Security headers in `next.config.ts` (no framing, nosniff, strict referrer policy). Security-sensitive responses are `no-store`.
* Thumbnail fetching is restricted to YouTube image hosts (SSRF guard) with size/time limits.
* MCP: Bearer token compared in constant time, failed-attempt throttling, Origin check, size limit, no approve tool, no delete tool, errors sanitised.
* Revoke anytime: Settings → *Revoke Google access* (also revoke at <https://myaccount.google.com/permissions>). Rotate `MCP_AUTH_TOKEN` / `TOKEN_ENCRYPTION_KEY` by editing `.env` and restarting.
* Residual risks: cache entries remain in memory per instance; AI output can be wrong or be influenced by text in your own videos (the assistant has no write tools for this reason); a `MCP_ALLOW_URL_TOKEN` URL can leak through logs even though it is single-use. A static `Authorization` bearer token remains reusable until rotated.

## Error handling

All API routes return `{ "error": { "code", "message", "details?" } }`. Examples: `unauthorized` 401, `forbidden` 403 (mode/permission), `invalid_input` 400 (Zod details), `conflict` 409 (value changed since proposal), `quota_exceeded` 429 (YouTube quota), `misconfigured` 500 (bad env). Unexpected errors log only a message server-side and return a generic 500. MCP tool errors return `isError: true` with a safe message.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `redirect_uri_mismatch` | Redirect URI in Google Cloud must be exactly `APP_URL + /api/auth/callback` |
| "Access blocked: app not verified / not completed verification" | Add your account as a test user, or publish the consent screen (see Google Cloud setup) |
| Asked to sign in again every ~7 days | Consent screen is in *Testing*; publish it to *In production* |
| Analytics "Unavailable" | Enable the **YouTube Analytics API**, grant the analytics scope at sign-in, and note data lags 1–3 days; some metrics (e.g. impressions) are not returned for every channel |
| `quota_exceeded` | Daily 10,000-unit quota used; wait for the reset or request more in Google Cloud |
| "Invalid server configuration" | A variable in `.env` is missing, short or still a placeholder (the message lists names) |
| `Read mode does not allow changes` | Settings → choose Approval (and *Enable editing* if prompted) |
| Subscribers look rounded | YouTube rounds public subscriber counts |
| Prisma errors after switching DB | Run the matching `db:push` / `db:generate` scripts for that schema |

## Project layout

```
prisma/            schema.prisma (SQLite), schema.postgres.prisma
scripts/           gen-secrets.mjs
src/app/           pages (login + dashboard) and /api route handlers
src/components/    Shell, UI kit, ProposeButtons, VideoPicker, ThemeToggle
src/hooks/         useApi, useQueryParam
src/lib/           pure logic (seo, thumbnail-metrics, strategy, audit, permissions, crypto, limits…)
src/services/      YouTube/Analytics/AI clients, changes workflow, activity log
src/mcp/           MCP protocol core, HTTP handler, tool definitions
src/tests/         Vitest tests
src/middleware.ts  cheap session-cookie gate (real check is server-side)
```
