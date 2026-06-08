-- ─────────────────────────────────────────────────────────────────────────────
-- Add app_secret column to Meta channel deployment tables
-- Allows HMAC-SHA256 signature verification on incoming webhook requests.
-- app_secret is optional — if null, signature verification is skipped (with a warning).
-- Run this in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

alter table whatsapp_deployments
  add column if not exists app_secret text;   -- AES-256 encrypted Meta App Secret

alter table messenger_deployments
  add column if not exists app_secret text;   -- AES-256 encrypted Meta App Secret

alter table instagram_deployments
  add column if not exists app_secret text;   -- AES-256 encrypted Meta App Secret
