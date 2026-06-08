-- Input capabilities per agent
-- Tracks what media types the agent accepts from users.
-- Plan gating enforced at the API layer:
--   Files  → Starter plan or above
--   Images → Pro plan or above
--   Voice  → Pro plan or above
--
-- Run this in your Supabase SQL Editor before enabling input capabilities.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'input_capabilities'
  ) THEN
    ALTER TABLE agents
      ADD COLUMN input_capabilities JSONB NOT NULL
        DEFAULT '{"images":false,"voice":false,"files":false}';
  END IF;
END
$$;

-- Back-fill existing rows that may have NULL after the migration
UPDATE agents
SET    input_capabilities = '{"images":false,"voice":false,"files":false}'
WHERE  input_capabilities IS NULL;
