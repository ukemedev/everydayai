# EverydayAI

A full-stack web application scaffold with a dark-themed React frontend and Express backend, ready for AI-powered features to be built on top.

## Run & Operate

- `pnpm --filter @workspace/everydayai run dev` — run the frontend (Vite dev server)
- `pnpm --filter @workspace/api-server run dev` — run the API server (Express)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required env: `DATABASE_URL` — Supabase/Postgres connection string (configure when ready), `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 18, Vite, Tailwind CSS, Wouter (routing)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM (Supabase when configured)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Font: Inter (Google Fonts)

## Where things live

- Frontend: `artifacts/everydayai/src/` — pages in `src/pages/`, components in `src/components/`
- Backend: `artifacts/api-server/src/` — routes in `src/routes/`, controllers in `src/controllers/`, middleware in `src/middlewares/`
- API contract (source of truth): `lib/api-spec/openapi.yaml`
- DB schema: `lib/db/src/schema/index.ts`
- Theme/CSS: `artifacts/everydayai/src/index.css`
- Env example: `.env.example`

## Architecture decisions

- Dark theme is the default and only theme — CSS variables are set dark-first in `:root` with no light mode override
- Background hardcoded to `#0a0f1e` (very dark navy); primary accent is `#3b5bfc` (blue)
- Frontend served at `/` (root), API served at `/api` via the shared reverse proxy
- Database: Supabase Postgres to be connected via `DATABASE_URL` — schema managed by Drizzle ORM
- OpenAPI-first workflow: all API contracts defined in `lib/api-spec/openapi.yaml`, codegen produces React Query hooks and Zod schemas

## Product

Placeholder scaffold only. Shows "EverydayAI" centered on dark navy background. No features built yet.

## User preferences

- Dark theme as default (`#0a0f1e` background, `#3b5bfc` primary accent)
- Font: Inter (Google Fonts)
- Database: Supabase (to be configured with `DATABASE_URL`)
- Clean working structure — no features until explicitly requested

## Gotchas

- `DATABASE_URL` must be set before running the API server (it throws on startup without it). Configure Supabase connection string in the environment.
- Always run codegen after any OpenAPI spec change: `pnpm --filter @workspace/api-spec run codegen`
- Do not run `pnpm dev` at workspace root — use `--filter` per artifact

## Pointers

- See `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- API routes reference: `.local/skills/pnpm-workspace/references/server.md`
- DB schema reference: `.local/skills/pnpm-workspace/references/db.md`
