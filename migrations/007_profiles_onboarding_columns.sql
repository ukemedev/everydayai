-- ─── Onboarding columns on profiles ─────────────────────────────────────────
-- Run this in your Supabase SQL Editor

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_tested_chat     BOOLEAN NOT NULL DEFAULT FALSE;
