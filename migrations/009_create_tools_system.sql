-- ─────────────────────────────────────────────────────────────────
-- Migration 009: Tools System — three-layer production architecture
--
-- Layer 1: connector_catalogue — master list of all connectors (seeded)
--          Adding a new tool = one INSERT. Zero code changes.
--
-- Layer 2: agent_tools — per-agent configuration with credentials
--          and a deterministic trigger condition per tool.
--          UNIQUE(agent_id, connector_id): one row per connector per agent.
--
-- Layer 3: tool_executions — full audit log.
--          Every run logged: success/fail, payload, result, timestamp.
--
-- SECURITY MODEL:
-- → Service role (Express API) bypasses RLS always
-- → RLS policies protect direct Supabase client access
-- → Users can only read/write their own rows
--
-- PERFORMANCE:
-- → (select auth.uid()) pattern caches result per statement
-- → Indexes on all RLS-filtered columns
-- ─────────────────────────────────────────────────────────────────


-- ── 1. connector_catalogue ────────────────────────────────────────
-- Master list. Seeded below. Frontend reads dynamically — no hardcoding.

CREATE TABLE IF NOT EXISTS connector_catalogue (
  id            text    PRIMARY KEY,
  name          text    NOT NULL,
  category      text    NOT NULL,
  description   text    NOT NULL,
  initials      text    NOT NULL,
  color         text    NOT NULL,
  bg            text    NOT NULL,
  fields        jsonb   NOT NULL DEFAULT '[]',
  required_plan text    NOT NULL DEFAULT 'free',
  sort_order    integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true
);

-- Anon and authenticated users can read the catalogue (needed for frontend)
ALTER TABLE connector_catalogue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "connector_catalogue: anyone can read"
  ON connector_catalogue FOR SELECT
  TO authenticated, anon
  USING (is_active = true);


-- ── 2. agent_tools ────────────────────────────────────────────────
-- Per-agent tool configuration. One row per connector per agent.

CREATE TABLE IF NOT EXISTS agent_tools (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id       uuid        NOT NULL,
  user_id        uuid        NOT NULL,
  connector_id   text        NOT NULL REFERENCES connector_catalogue(id),
  credentials    jsonb       NOT NULL DEFAULT '{}',
  trigger_type   text        NOT NULL DEFAULT 'always',
  trigger_config jsonb       NOT NULL DEFAULT '{}',
  status         text        NOT NULL DEFAULT 'inactive',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, connector_id),
  CONSTRAINT agent_tools_trigger_type_check
    CHECK (trigger_type IN ('always', 'keyword', 'data_collected')),
  CONSTRAINT agent_tools_status_check
    CHECK (status IN ('active', 'inactive'))
);

ALTER TABLE agent_tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_tools: owner full access"
  ON agent_tools FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);


-- ── 3. tool_executions ────────────────────────────────────────────
-- Full audit log of every tool execution.

CREATE TABLE IF NOT EXISTS tool_executions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_tool_id  uuid        NOT NULL REFERENCES agent_tools(id) ON DELETE CASCADE,
  agent_id       uuid        NOT NULL,
  conversation_id uuid       NOT NULL,
  trigger_type   text        NOT NULL,
  status         text        NOT NULL,
  error_message  text,
  payload        jsonb,
  result         jsonb,
  executed_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tool_executions_status_check
    CHECK (status IN ('success', 'failed'))
);

ALTER TABLE tool_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tool_executions: owner read access"
  ON tool_executions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agent_tools at
      WHERE at.id = tool_executions.agent_tool_id
        AND (select auth.uid()) = at.user_id
    )
  );


-- ── Indexes ───────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_agent_tools_agent_id
  ON agent_tools (agent_id);

CREATE INDEX IF NOT EXISTS idx_agent_tools_user_id
  ON agent_tools (user_id);

CREATE INDEX IF NOT EXISTS idx_agent_tools_status
  ON agent_tools (agent_id, status);

CREATE INDEX IF NOT EXISTS idx_tool_executions_agent_tool_id
  ON tool_executions (agent_tool_id);

CREATE INDEX IF NOT EXISTS idx_tool_executions_agent_id
  ON tool_executions (agent_id);

CREATE INDEX IF NOT EXISTS idx_tool_executions_executed_at
  ON tool_executions (executed_at DESC);


-- ── Seed: connector_catalogue ─────────────────────────────────────
-- INSERT OR SKIP — safe to re-run.

INSERT INTO connector_catalogue (id, name, category, description, initials, color, bg, fields, required_plan, sort_order) VALUES

-- ── Free tier ───────────────────────────────────────────────────────
('custom_webhook',
 'Custom Webhook',
 '🔗 Custom',
 'POST conversation data to any URL — connect to Notion, Airtable, Slack, or your own backend',
 'CW', '#6366f1', 'rgba(99,102,241,0.12)',
 '[{"key":"webhook_url","label":"Webhook URL","placeholder":"https://hooks.example.com/your-endpoint","type":"text"}]',
 'free', 0),

-- ── Starter tier ────────────────────────────────────────────────────
('google_sheets',
 'Google Sheets',
 '📊 Save Data',
 'Save collected leads and customer data directly to your spreadsheet',
 'GS', '#0F9D58', 'rgba(15,157,88,0.12)',
 '[{"key":"sheet_url","label":"Sheet URL","placeholder":"https://docs.google.com/spreadsheets/d/...","type":"text"},{"key":"sheet_name","label":"Sheet Name (Tab)","placeholder":"Sheet1","type":"text"}]',
 'starter', 10),

('gmail',
 'Gmail',
 '📧 Email',
 'Send automated emails to your leads and customers',
 'Gm', '#EA4335', 'rgba(234,67,53,0.12)',
 '[{"key":"email","label":"Gmail Address","placeholder":"you@gmail.com","type":"email"},{"key":"app_password","label":"App Password","placeholder":"xxxx xxxx xxxx xxxx","type":"password"}]',
 'starter', 20),

('telegram_notify',
 'Telegram Notify',
 '💬 Notify Owner',
 'Get instant Telegram alerts whenever a key event happens in a conversation',
 'Tg', '#2AABEE', 'rgba(42,171,238,0.12)',
 '[{"key":"bot_token","label":"Bot Token","placeholder":"123456:ABC-DEF...","type":"password"},{"key":"chat_id","label":"Chat ID","placeholder":"-100123456789","type":"text"}]',
 'starter', 30),

('termii',
 'Termii',
 '🔔 SMS',
 'Send OTPs and SMS messages to any phone number in Africa',
 'Tm', '#F97316', 'rgba(249,115,22,0.12)',
 '[{"key":"api_key","label":"API Key","placeholder":"TLtest_xxxxxxxxxx","type":"password"},{"key":"sender_id","label":"Sender ID","placeholder":"YourBrand","type":"text"}]',
 'starter', 40),

-- ── Pro tier ────────────────────────────────────────────────────────
('paystack',
 'Paystack',
 '💰 Payments',
 'Accept payments and process transactions across Africa',
 'PS', '#00C3F7', 'rgba(0,195,247,0.12)',
 '[{"key":"secret_key","label":"Secret Key","placeholder":"sk_live_xxxxxxxxxxxxxxxxxx","type":"password"}]',
 'pro', 50),

('hubspot',
 'HubSpot',
 '👤 CRM',
 'Store and recall customer information directly from your CRM',
 'HS', '#FF7A59', 'rgba(255,122,89,0.12)',
 '[{"key":"access_token","label":"Private App Token","placeholder":"pat-na1-xxxxxxxxxx","type":"password"}]',
 'pro', 60),

('web_search',
 'Web Search',
 '🔍 Intelligence',
 'Let your agent search the internet for live, up-to-date information',
 'WS', '#8B5CF6', 'rgba(139,92,246,0.12)',
 '[{"key":"api_key","label":"Serper API Key","placeholder":"Your Serper.dev key","type":"password"}]',
 'pro', 70),

('google_calendar',
 'Google Calendar',
 '📅 Booking',
 'Let customers book appointments in your calendar in real time',
 'GC', '#4285F4', 'rgba(66,133,244,0.12)',
 '[{"key":"calendar_id","label":"Calendar ID","placeholder":"you@gmail.com","type":"text"},{"key":"service_key","label":"Service Account JSON","placeholder":"{\"type\": \"service_account\", ...}","type":"textarea"}]',
 'pro', 80),

('google_drive',
 'Google Drive',
 '📄 Documents',
 'Create, read, and manage files and folders in your Drive',
 'GD', '#FBBC04', 'rgba(251,188,4,0.12)',
 '[{"key":"folder_id","label":"Target Folder ID","placeholder":"1BxiMVs0XRA5nFMdKvBdBZjgm...","type":"text"},{"key":"service_key","label":"Service Account JSON","placeholder":"{\"type\": \"service_account\", ...}","type":"textarea"}]',
 'pro', 90),

('vapi',
 'Vapi.ai',
 '📞 Voice Calls',
 'Make and receive AI-powered phone calls automatically',
 'Vi', '#10B981', 'rgba(16,185,129,0.12)',
 '[{"key":"api_key","label":"API Key","placeholder":"vapi_xxxxxxxxxx","type":"password"},{"key":"phone_number_id","label":"Phone Number ID","placeholder":"phnum_xxxxxxxxxx","type":"text"}]',
 'pro', 100)

ON CONFLICT (id) DO NOTHING;
