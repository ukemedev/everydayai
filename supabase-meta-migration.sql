-- ─────────────────────────────────────────────────────────────────────────────
-- Meta Channels Migration: Messenger + Instagram DMs
-- Run this in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Messenger deployments ─────────────────────────────────────────────────────
create table if not exists messenger_deployments (
  id             uuid        default gen_random_uuid() primary key,
  agent_id       uuid        not null references agents(id) on delete cascade,
  user_id        uuid        not null,
  page_id        text        not null,
  page_name      text,
  access_token   text        not null,   -- AES-256 encrypted
  verify_token   text        not null,
  status         text        not null default 'active' check (status in ('active','inactive')),
  created_at     timestamptz default now()
);

create index if not exists messenger_deployments_agent_idx on messenger_deployments(agent_id);
create index if not exists messenger_deployments_user_idx  on messenger_deployments(user_id);

-- ── Instagram DM deployments ──────────────────────────────────────────────────
create table if not exists instagram_deployments (
  id             uuid        default gen_random_uuid() primary key,
  agent_id       uuid        not null references agents(id) on delete cascade,
  user_id        uuid        not null,
  ig_account_id  text        not null,  -- Instagram-scoped user ID (from Graph API)
  ig_username    text,
  access_token   text        not null,  -- AES-256 encrypted Page Access Token
  verify_token   text        not null,
  status         text        not null default 'active' check (status in ('active','inactive')),
  created_at     timestamptz default now()
);

create index if not exists instagram_deployments_agent_idx on instagram_deployments(agent_id);
create index if not exists instagram_deployments_user_idx  on instagram_deployments(user_id);

-- ── RLS: agents can only touch their own rows ─────────────────────────────────
alter table messenger_deployments enable row level security;
alter table instagram_deployments  enable row level security;

-- Service role bypasses RLS automatically; these policies cover direct client access
create policy "messenger: owner access"
  on messenger_deployments for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "instagram: owner access"
  on instagram_deployments for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());
