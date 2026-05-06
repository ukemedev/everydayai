# EverydayAI

A full-stack web application built with React + Vite (frontend) and Node.js + Express (backend).

## Stack

- **Frontend**: React 18, Vite, Tailwind CSS, TypeScript
- **Backend**: Node.js, Express 5, TypeScript
- **Database**: Supabase (PostgreSQL via Drizzle ORM)
- **Font**: Inter (Google Fonts)

## Theme

- Background: `#0a0f1e` (dark navy)
- Primary accent: `#3b5bfc` (blue)
- Dark theme by default

## Project Structure

```
artifacts/
├── everydayai/         React + Vite frontend
│   └── src/
│       ├── pages/      Route-level page components
│       ├── components/ Reusable UI components
│       └── App.tsx     Root app with router
└── api-server/         Node/Express backend
    └── src/
        ├── routes/     API route handlers
        ├── lib/        Shared utilities (logger, etc.)
        └── app.ts      Express app setup

lib/
├── api-spec/           OpenAPI contract (source of truth)
├── api-client-react/   Generated React Query hooks
├── api-zod/            Generated Zod validation schemas
└── db/                 Drizzle ORM schema + client
```

## Running Locally

```bash
# Install dependencies
pnpm install

# Start the API server
pnpm --filter @workspace/api-server run dev

# Start the frontend (separate terminal)
pnpm --filter @workspace/everydayai run dev

# Typecheck everything
pnpm run typecheck
```

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```
DATABASE_URL=your_supabase_connection_string_here
SESSION_SECRET=your_session_secret_here
NODE_ENV=development
```

## API

The API server runs at `/api`. Available endpoints:

- `GET /api/healthz` — health check
