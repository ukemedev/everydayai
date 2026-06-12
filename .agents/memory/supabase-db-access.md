---
name: Supabase remote DB access blocked
description: Direct database access to Supabase from Replit environment is not possible; use dashboard SQL editor for migrations.
---

## Rule
Cannot run raw DDL SQL against the remote Supabase project from within the Replit environment.

**Why:** Multiple connection methods all fail:
- `psql postgresql://postgres.PROJECT_REF:KEY@pooler...` → ENOTFOUND (tenant not found)
- `psql postgresql://postgres:KEY@db.PROJECT_REF.supabase.co:5432` → connection refused/empty
- `supabase.rpc('exec_sql', {...})` → function doesn't exist in schema cache
- Supabase Management API `/v1/projects/REF/database/query` → "JWT failed verification" (service role key ≠ management API key)

**How to apply:** When DB migrations are needed, write the SQL and instruct the user to run it in the Supabase dashboard SQL editor (https://supabase.com/dashboard → Project → SQL Editor). The local postgres at `DATABASE_URL` works fine for development and tests.
