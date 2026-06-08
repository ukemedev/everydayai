-- Universal Inbox: conversations + messages tables
-- Run this in your Supabase SQL editor

-- ── conversations ─────────────────────────────────────────────────────────────
-- One row per unique customer session, per agent, per channel.
-- channel_conversation_id: sessionId for web, phone number for WhatsApp/Telegram, etc.

CREATE TABLE IF NOT EXISTS conversations (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id                TEXT        NOT NULL,
  agent_name              TEXT,
  owner_id                TEXT        NOT NULL,
  channel                 TEXT        NOT NULL DEFAULT 'web',
  channel_conversation_id TEXT        NOT NULL,
  customer_display        TEXT,
  mode                    TEXT        NOT NULL DEFAULT 'ai',
  status                  TEXT        NOT NULL DEFAULT 'active',
  unread_count            INTEGER     NOT NULL DEFAULT 0,
  last_message_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_preview    TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT conversations_channel_check
    CHECK (channel IN ('web', 'whatsapp', 'telegram', 'messenger', 'instagram')),
  CONSTRAINT conversations_mode_check
    CHECK (mode IN ('ai', 'human')),
  CONSTRAINT conversations_status_check
    CHECK (status IN ('active', 'archived')),
  CONSTRAINT conversations_unique_session
    UNIQUE (agent_id, channel, channel_conversation_id)
);

-- ── messages ──────────────────────────────────────────────────────────────────
-- Every message in every conversation, regardless of channel.
-- role: 'customer' = inbound, 'ai' = AI reply, 'human' = owner's manual reply

CREATE TABLE IF NOT EXISTS messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT        NOT NULL,
  content         TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT messages_role_check
    CHECK (role IN ('customer', 'ai', 'human'))
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
-- Optimised for the inbox query patterns:
--   owner_id filter + last_message_at sort (conversation list)
--   conversation_id + created_at sort (message history)

CREATE INDEX IF NOT EXISTS idx_conversations_owner_id
  ON conversations (owner_id);

CREATE INDEX IF NOT EXISTS idx_conversations_owner_active
  ON conversations (owner_id, status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_mode
  ON conversations (owner_id, mode)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
  ON messages (conversation_id, created_at ASC);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Service role bypasses RLS — all access from the API server uses service role.
-- Enable RLS so direct client connections can't read other users' data.

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages      ENABLE ROW LEVEL SECURITY;
