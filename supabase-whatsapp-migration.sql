-- WhatsApp deployment credentials per agent
-- Run this in your Supabase SQL editor after supabase-inbox-migration.sql

CREATE TABLE IF NOT EXISTS whatsapp_deployments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        TEXT        NOT NULL,
  user_id         TEXT        NOT NULL,
  phone_number_id TEXT        NOT NULL,
  access_token    TEXT        NOT NULL,
  verify_token    TEXT        NOT NULL,
  display_name    TEXT,
  status          TEXT        NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT whatsapp_deployments_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT whatsapp_deployments_agent_unique
    UNIQUE (agent_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_deployments_agent_id
  ON whatsapp_deployments (agent_id, status);

ALTER TABLE whatsapp_deployments ENABLE ROW LEVEL SECURITY;
