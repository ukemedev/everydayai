-- Agent channel exclusivity tracking
-- Optional: tracks which external channel an agent is deployed to.
-- The actual enforcement happens at the deployment layer (API routes).
-- This column is useful for the frontend UI and for audit/reporting.
-- Run this in your Supabase SQL Editor.

-- Add external_channel column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'external_channel'
  ) THEN
    ALTER TABLE agents ADD COLUMN external_channel TEXT;
  END IF;
END
$$;

-- Constraint: must be one of the allowed channels, or NULL
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_external_channel_check;
ALTER TABLE agents ADD CONSTRAINT agents_external_channel_check
  CHECK (external_channel IS NULL OR external_channel IN ('telegram', 'whatsapp', 'messenger', 'instagram'));

-- Note: the agent lifecycle (web -> external channel) is managed by the application layer:
--   - When an agent is created, external_channel is NULL (web only).
--   - When deployed to Telegram, external_channel is set to 'telegram'.
--   - When disconnected, external_channel is set back to NULL.
--   - This prevents the same agent being deployed to multiple channels simultaneously.
