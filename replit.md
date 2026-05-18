# TrustClaw

A self-hostable personal AI agent powered by OpenCode Zen AI (minimax-m2.5-free) with Composio tool integrations. Users interact with their AI agent via a web chat interface or Telegram, schedule tasks via cron jobs, and connect external apps (Gmail, GitHub, etc.) through Composio.

## Run & Operate

- `pnpm --filter @workspace/trustclaw run dev` — run the frontend (port from `PORT` env)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/api-server run build` — build the API server bundle
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- **Frontend**: Vite + React + Wouter (SPA at `/`)
- **API**: Express 5 at `/api` (built to `dist/index.mjs` via esbuild)
- **AI**: OpenCode Zen (`https://opencode.ai/zen`) via `@ai-sdk/openai` — model `minimax-m2.5-free`
- **Auth**: better-auth with Prisma adapter + username plugin
- **DB**: PostgreSQL + Prisma ORM (client at `src/generated/prisma`)
- **Tools**: Composio (`@composio/core`) with VercelAI SDK compat
- **Memory**: pgvector embeddings via `openai/text-embedding-3-large` through OpenCode
- **Queue/Streams**: ioredis + resumable-stream (optional, graceful without Redis)
- **Cron**: croner jobs running via `/api/cron/trustclaw` endpoint

## Where Things Live

- `artifacts/trustclaw/` — React/Vite SPA frontend
- `artifacts/api-server/` — Express API server
  - `src/server/api/root.ts` — tRPC app router
  - `src/server/api/routers/trustclaw/` — main agent procedures
  - `src/server/api/routers/trustclaw/agent/setup.ts` — `prepareAgentRun()`
  - `src/server/clients/ai-provider.ts` — OpenCode AI provider config
  - `src/server/clients/db.ts` — Prisma client singleton
  - `src/server/auth.ts` — better-auth config (no Next.js dependencies)
  - `src/routes/` — Express route adapters (trpc, auth, chat, cron, telegram)
  - `prisma/schema.prisma` — DB schema source of truth
- `artifacts/trustclaw/src/server/api/root.ts` — AppRouter TYPE STUB (for tRPC client inference only; never bundled)

## Architecture Decisions

- **Path alias `~`**: resolves to `src/` in both frontend (via Vite `resolve.alias`) and API server (via esbuild `alias` in `build.mjs`).
- **Same-origin API routing**: Replit's path-based proxy routes `/api/*` → API server (8080), `/` → frontend (20460). The frontend uses `getBaseUrl() = ""` so all `/api/trpc` and `/api/auth` requests hit the proxy correctly.
- **Type-only server import**: Frontend imports `type AppRouter` — TypeScript strips it at build time; Vite never bundles the server code.
- **OpenCode provider**: Uses `@ai-sdk/openai` with `baseURL: "https://opencode.ai/zen"` and `OPENCODE_API_KEY`. The model is configurable via `OPENCODE_MODEL` env var.
- **Redis optional**: All Redis-dependent features (resumable streams, rate limiting, Telegram dedup) gracefully degrade when `REDIS_URL` is not set.
- **No SSL enforcement on DB**: Removed `sslmode=verify-full` enforcement so Replit's internal Postgres URL works without SSL params.

## Required Environment Secrets

Set these in Replit's Secrets panel:

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | **Yes** |
| `BETTER_AUTH_SECRET` | Random secret for session signing (32+ chars) | **Yes** |
| `OPENCODE_API_KEY` | OpenCode API key | **Yes** (already set) |
| `COMPOSIO_API_KEY` | Composio API key for tool integrations | **Yes** |
| `CRON_SECRET` | Bearer token for cron endpoint auth | Recommended |
| `REDIS_URL` | Redis connection string (ioredis format) | Optional |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | Optional |
| `TELEGRAM_BOT_USERNAME` | Telegram bot username (without @) | Optional |
| `TELEGRAM_WEBHOOK_SECRET` | Secret for Telegram webhook validation | Optional |

Optional env (already set via `.replit` userenv):
- `OPENCODE_BASE_URL` = `https://opencode.ai/zen`
- `OPENCODE_MODEL` = `minimax-m2.5-free`
- `ENABLE_TOOL_SEARCH` = `true`

## Product

- **Web chat**: Users send messages to their AI agent; the agent uses Composio tools to act on connected apps (Gmail, GitHub, Slack, etc.)
- **Onboarding**: Multi-step setup to name/configure the agent, set personality and writing style, add emoji, backstory, connect integrations, and optionally link Telegram
- **Settings**: Manage connected toolkits, memory, cron jobs, Telegram link, model selection, and danger zone (delete account)
- **Telegram bot**: Send messages to the agent via Telegram; agent responds with full tool access
- **Cron jobs**: Schedule recurring tasks with natural language prompts (e.g. "Summarize my unread emails every morning")
- **Memory**: Agent remembers past interactions via pgvector semantic search

## Gotchas

- Run `prisma generate` before building: `cd artifacts/api-server && npx prisma generate`
- Run `pnpm approve-builds` if prompted after install (needed for Prisma engine binaries)
- The `trustclaw/src/server/` directory is a TYPE STUB only — do not add runtime logic there; actual implementation is in `api-server/src/server/`
- Express 5 uses strict path-to-regexp: use `/auth/*path` not `/auth/*` for wildcard routes
- esbuild bundles `@opentelemetry/*` (not externalized) because the packages aren't installed separately
- The `/api/healthz` endpoint (not `/api/health`) is the liveness probe

## User Preferences

_Populate as you build — explicit user instructions worth remembering across sessions._
