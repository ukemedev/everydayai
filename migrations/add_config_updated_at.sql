-- Migration: track agent configuration version for history reset
-- Run this in your Supabase SQL editor:
-- https://supabase.com/dashboard/project/_/sql/new
--
-- What this does:
--   Adds a config_updated_at column to the agents table.
--   Every time you save prompt instructions or add/remove a knowledge-base
--   document, this timestamp is updated by the backend.
--   All external channels (WhatsApp, Telegram, Messenger, Instagram) then
--   only feed the AI messages created AFTER this timestamp, so stale
--   conversation history from before the config change is never seen by the AI.

ALTER TABLE agents ADD COLUMN IF NOT EXISTS config_updated_at TIMESTAMPTZ;

-- Initialise existing agents so they don't start with a null cutoff
UPDATE agents
SET config_updated_at = COALESCE(updated_at, created_at, NOW())
WHERE config_updated_at IS NULL;
