-- ─────────────────────────────────────────────────────────────────
-- Migration 008: Enable RLS and add policies on unprotected tables
--
-- WHY this exists:
-- → agents, profiles, payments had NO RLS — any authenticated user
--   could read every row from every user through Supabase API
-- → conversations, messages, whatsapp_deployments had RLS enabled
--   but NO policies written — zero rows returned for everyone
--
-- SECURITY MODEL:
-- → Service role (used by our Express API) bypasses RLS always
-- → These policies protect direct Supabase client access only
-- → Every user can only see and modify their OWN rows
--
-- PERFORMANCE NOTE:
-- → We use (select auth.uid()) not bare auth.uid()
-- → This lets PostgreSQL cache the result per statement
-- → Much faster at scale — avoids calling auth.uid() per row
-- → SOURCE: https://supabase.com/docs/guides/database/postgres/row-level-security
-- ─────────────────────────────────────────────────────────────────

-- ── 1. agents ─────────────────────────────────────────────────────
-- agents.user_id = UUID of the owner
-- Authenticated owner → full access to their own agents
-- Anonymous public → can only read LIVE agents (web widget)

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents: owner full access"
  ON agents FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "agents: public can read live agents"
  ON agents FOR SELECT
  TO anon
  USING (status = 'live');

-- ── 2. profiles ───────────────────────────────────────────────────
-- profiles.id = auth.uid() (Supabase standard pattern)
-- id is the primary key AND references auth.users
-- Each user owns exactly one profile row

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: owner can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = id);

CREATE POLICY "profiles: owner can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "profiles: owner can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = id);

-- ── 3. payments ───────────────────────────────────────────────────
-- payments.user_id = UUID of the paying user
-- Users can only read their own payment records
-- No INSERT/UPDATE/DELETE for users — service role only writes payments

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments: owner can read own payments"
  ON payments FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- ── 4. conversations ──────────────────────────────────────────────
-- conversations.owner_id = TEXT (agent owner's user id)
-- RLS was enabled but NO policies existed — nothing was accessible
-- Cast auth.uid() to text because owner_id is TEXT not UUID

CREATE POLICY "conversations: owner full access"
  ON conversations FOR ALL
  TO authenticated
  USING ((select auth.uid())::text = owner_id)
  WITH CHECK ((select auth.uid())::text = owner_id);

-- ── 5. messages ───────────────────────────────────────────────────
-- messages has no direct user_id column
-- Access is granted if user owns the parent conversation

CREATE POLICY "messages: owner access via conversation"
  ON messages FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
      AND (select auth.uid())::text = c.owner_id
    )
  );

-- ── 6. whatsapp_deployments ───────────────────────────────────────
-- whatsapp_deployments.user_id = TEXT
-- RLS was enabled but NO policies existed

CREATE POLICY "whatsapp_deployments: owner full access"
  ON whatsapp_deployments FOR ALL
  TO authenticated
  USING ((select auth.uid())::text = user_id)
  WITH CHECK ((select auth.uid())::text = user_id);

-- ── Indexes for RLS performance ───────────────────────────────────
-- RLS policies add implicit WHERE clauses to every query
-- Without indexes on filtered columns, every query does a full scan
-- SOURCE: Supabase RLS best practices — always index RLS columns

CREATE INDEX IF NOT EXISTS idx_agents_user_id
  ON agents (user_id);

CREATE INDEX IF NOT EXISTS idx_payments_user_id
  ON payments (user_id);
