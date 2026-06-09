# EverydayAI

> No-code platform to build and deploy AI agents to WhatsApp, Instagram, Messenger, Telegram, and websites.

[![CI](https://github.com/ukemedev/everydayai/actions/workflows/ci.yml/badge.svg)](https://github.com/ukemedev/everydayai/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Node.js](https://img.shields.io/badge/Node.js-20-green)
![Tests](https://img.shields.io/badge/tests-65%20passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## What Is EverydayAI?

EverydayAI lets businesses build AI agents without writing code. Agents can be deployed to:

- 🌐 Website widget (embed on any site)
- 💬 WhatsApp
- 📱 Instagram
- 💌 Messenger
- ✈️ Telegram

Each agent supports multiple AI providers — OpenAI, Anthropic, Groq, and Google Gemini — using the customer's own API key (BYOK).

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    USERS                            │
└─────────────────┬───────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────┐
│              CLOUDFLARE (CDN + DDoS Shield)          │
└─────────────────┬───────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────┐
│                RAILWAY (Cloud Hosting)               │
│  ┌──────────────┐    ┌──────────────────────────┐   │
│  │ React + Vite │    │ Express 5 API Server      │   │
│  │ (Frontend)   │    │ + Helmet + Rate Limiting  │   │
│  └──────────────┘    │ + Pino Logger             │   │
│                      │ + Zod Validation          │   │
│                      │ + Global Error Handler    │   │
│                      └──────────┬────────────────┘   │
└─────────────────────────────────┼───────────────────┘
                                  │
              ┌───────────────────┼──────────────────┐
              │                   │                  │
┌─────────────▼──┐   ┌────────────▼──┐  ┌───────────▼──┐
│   SUPABASE     │   │  REDIS         │  │  BULLMQ      │
│  (PostgreSQL)  │   │  (Cache)       │  │  (AI Queue)  │
│  + Supavisor   │   │               │  │              │
│  + RLS         │   │               │  │              │
└────────────────┘   └───────────────┘  └──────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, TypeScript |
| Backend | Node.js 20, Express 5, TypeScript |
| Database | Supabase (PostgreSQL) + Supavisor pooler |
| ORM | Drizzle ORM |
| Job Queue | BullMQ + Redis |
| Logging | Pino + pino-http |
| Security | Helmet, express-rate-limit, Zod, XSS |
| Testing | Vitest (65 tests) |
| CI/CD | GitHub Actions |
| Hosting | Railway |
| CDN | Cloudflare |

---

## Engineering Pillars

This codebase is built to production standard across 10 pillars:

- ✅ **Secrets** — Zod env validator. App refuses to start if any secret is missing
- ✅ **Logging** — Pino structured logging with request IDs and redaction
- ✅ **Error Handling** — Global error handler. Stack traces never reach users in production
- ✅ **Security** — Helmet, rate limiting (8 limiters), input validation, RLS
- ✅ **Database** — Supavisor connection pooling, Row Level Security on all tables
- ✅ **Scalability** — BullMQ job queue for all AI calls. Never blocks the server
- ✅ **Testing** — 65 tests, TDD Red-Green workflow, CI enforced
- ✅ **Code Structure** — Ports and adapters architecture
- ✅ **Deployment** — GitHub Actions CI/CD. Broken code can never reach production
- ✅ **Documentation** — This README

---

## Project Structure

```
everydayai/
├── artifacts/
│   ├── everydayai/          # React + Vite frontend
│   │   └── src/
│   │       ├── pages/       # Route-level page components
│   │       ├── components/  # Reusable UI components
│   │       └── App.tsx      # Root app with router
│   └── api-server/          # Node/Express backend
│       └── src/
│           ├── config/      # Env validation (Zod)
│           ├── middlewares/ # Error handler, rate limiters
│           ├── queues/      # BullMQ queues + workers
│           ├── routes/      # API route handlers
│           ├── services/    # Business logic (LLM, keys)
│           ├── adapters/    # Supabase implementations
│           ├── ports/       # Interfaces (contracts)
│           ├── lib/         # Shared utilities
│           └── tests/       # All test files
├── lib/
│   ├── api-spec/            # OpenAPI contract (source of truth)
│   ├── api-client-react/    # Generated React Query hooks
│   ├── api-zod/             # Generated Zod validation schemas
│   └── db/                  # Drizzle ORM schema + client
├── migrations/              # Numbered SQL migration files
└── .github/workflows/       # GitHub Actions CI pipeline
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+
- Supabase account
- Redis (local or Railway)

### 1. Clone and install

```bash
git clone https://github.com/ukemedev/everydayai.git
cd everydayai
pnpm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Fill in your values. See `.env.example` for full documentation of each variable.

Required variables:

```
DATABASE_URL         → Supabase Transaction Pooler URL (port 6543)
DATABASE_DIRECT_URL  → Supabase Direct Connection URL (port 5432) — migrations only
SESSION_SECRET       → Minimum 32 characters (generate with: openssl rand -hex 32)
VITE_SUPABASE_URL    → Your Supabase project URL
VITE_SUPABASE_ANON_KEY → Your Supabase anon key
REDIS_URL            → Redis connection URL
PORT                 → Server port (default: 3000)
```

### 3. Run database migrations

Run each file in `migrations/` in order against your Supabase project via the SQL Editor:

```
migrations/001_create_conversations_messages.sql
migrations/002_create_whatsapp_deployments.sql
migrations/003_create_messenger_instagram_deployments.sql
migrations/004_add_app_secret_columns.sql
migrations/005_agents_external_channel.sql
migrations/006_agents_input_capabilities.sql
migrations/007_profiles_onboarding_columns.sql
migrations/008_enable_rls_policies.sql     ← Run this last
```

### 4. Start development

```bash
# Run both frontend and backend
pnpm dev

# Or run separately
pnpm --filter @workspace/api-server run dev    # API on port 3000
pnpm --filter @workspace/everydayai run dev    # Frontend on port 5000
```

---

## Testing

```bash
# Run all tests
cd artifacts/api-server && pnpm test

# Run in watch mode
cd artifacts/api-server && pnpm test:watch
```

65 tests across 6 test files — all must pass before any code is merged.

---

## CI/CD Pipeline

Every push to `main` automatically:

1. Typechecks the entire monorepo
2. Runs all 65 tests
3. Blocks merge if anything fails

See `.github/workflows/ci.yml`.

---

## Security

- **Helmet** — Sets 15 security headers on every response
- **Rate limiting** — 8 limiters protecting every route type
- **Input validation** — Zod schemas + XSS sanitization on all inputs
- **Row Level Security** — Enabled on all Supabase tables
- **Secrets validation** — App refuses to start if any env variable is missing
- **Error handling** — Stack traces never exposed in production

---

## Deployment

EverydayAI is configured for Railway deployment.

See `railway.toml` for the Railway configuration and `Dockerfile` for the container setup.

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Write tests first (TDD Red-Green workflow)
4. Make your changes
5. Ensure all tests pass: `pnpm test`
6. Ensure typecheck passes: `pnpm run typecheck`
7. Push and open a Pull Request

**Rule:** No code merges without passing tests and typecheck.

---

## License

MIT
