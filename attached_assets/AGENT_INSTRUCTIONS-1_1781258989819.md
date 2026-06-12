You are working on the EverydayAI codebase — a production-grade AI agent SaaS platform. Node.js/Express + TypeScript backend, Supabase (PostgreSQL) database, React/Vite frontend, pnpm monorepo.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE 3 LAWS — NON-NEGOTIABLE. NEVER BREAK THESE.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

LAW 1 — NO VIBE CODING. EVER.
- Never assume. Never guess. Never hallucinate APIs, function names, table names, or file paths.
- Before writing ANY code, web search to verify the exact API, method signature, or pattern.
- If anything is unclear or does not match the codebase, STOP and report. Do not improvise.
- Read every relevant file before touching it. Confirm exact variable names, imports, structure first.

LAW 2 — SENIOR SWE STANDARD ONLY.
- Every piece of code must be simple, powerful, reliable, consistent, zero bugs, very fast, redundant.
- System design first — plan every change before touching a single file.
- TDD always — write the failing test FIRST, then write the code to make it pass.
- Sealed behaviour — every feature is locked behind tests so it can never be accidentally broken.
- Use the Red-Green-Refactor cycle: failing test → minimum code to pass → clean up.

LAW 3 — NEVER BREAK THE TEST SUITE.
- Run pnpm test before touching anything. Confirm 182 tests pass, 0 fail.
- After every single fix, run pnpm test again. Number must never go down. Only up.
- If any fix causes a previously passing test to fail, fix it before moving on.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CODEBASE CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Backend: artifacts/api-server/
- Frontend: artifacts/everydayai/src/
- Tests: artifacts/api-server/src/tests/
- Test framework: Vitest
- Database: Supabase (PostgreSQL) — project ref: stgrsijraeswmxiyinzz, EU West 1
- RLS policies use (select auth.uid()) pattern — performance optimized
- All imports use .js extension e.g. from "../lib/something.js"
- pnpm monorepo — always run pnpm install from root before starting
- BullMQ + ioredis already installed for async jobs
- lucide-react@0.383.0 already installed in frontend

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART A — DASHBOARD FIXES (DO THESE FIRST)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read Dashboard.tsx and OnboardingCard.tsx fully before touching anything.

FIX 1 — Remove greeting text completely
- The dashboard currently shows "Hello 👋" or "Welcome back 👋"
- Remove it completely. No greeting text at all. Nothing.
- Keep all other dashboard content exactly as it is.

TDD:
- GIVEN dashboard renders THEN no greeting text exists in DOM

FIX 2 — Onboarding "Test your agent" not persisting
- The test_agent step resets after every refresh or logout
- Root cause: completed_steps is not being read from DB on load OR not being written to DB on completion
- Read exactly how Dashboard fetches the user profile and where completed_steps is used
- Fix so that:
  a) On load: completed_steps is fetched from profiles table in Supabase
  b) On test completion: PATCH /api/onboarding/complete-step is called with { step: "test_agent" }
  c) After refresh or logout/login: test_agent still shows as completed

TDD:
- GIVEN user completes test_agent WHEN they refresh THEN test_agent shows as completed
- GIVEN PATCH /api/onboarding/complete-step is called THEN step is saved to DB
- GIVEN completed_steps is null in DB THEN frontend defaults to empty array without crashing

FIX 3 — Retake button not showing
- The Retake button should appear next to "Skip setup" when test_agent is in completed_steps
- Read OnboardingCard.tsx and find exactly why it is not rendering
- Fix so that:
  a) When test_agent is completed: "Retake" link appears next to "Skip setup"
  b) When clicked: calls PATCH /api/onboarding/remove-step with { step: "test_agent" }
  c) Test agent modal reopens immediately

TDD:
- GIVEN test_agent is in completed_steps THEN Retake link is visible in DOM
- GIVEN test_agent is NOT in completed_steps THEN Retake link is NOT in DOM
- GIVEN Retake is clicked THEN test_agent is removed from completed_steps in DB

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART B — INBOX FIXES AND UPGRADES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read Inbox.tsx and artifacts/api-server/src/routes/conversations.ts fully before touching anything.

CAPACITY GOAL: Inbox must serve 10,000 concurrent users without crashing.
Strategy: cursor pagination + proper indexes + soft delete + async message limit enforcement.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DB MIGRATIONS — RUN ALL OF THESE IN SUPABASE FIRST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Unread count
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS unread_count integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_conversations_unread ON conversations (user_id, unread_count) WHERE unread_count > 0;

-- Human takeover
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assignee_type text NOT NULL DEFAULT 'ai' CHECK (assignee_type IN ('ai', 'human'));

-- Tags
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_conversations_tags ON conversations USING gin(tags);

-- Pagination index
CREATE INDEX IF NOT EXISTS idx_conversations_user_created ON conversations (user_id, created_at DESC) WHERE deleted_at IS NULL;

-- Search index
CREATE INDEX IF NOT EXISTS idx_conversations_search ON conversations USING gin(to_tsvector('english', coalesce(visitor_name,'') || ' ' || coalesce(last_message,'')));

Confirm all migrations succeed before writing any code.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUG FIX 1 — Delete per conversation not showing
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Each conversation row must have a trash icon button (use Trash2 from lucide-react)
- On click: show confirmation dialog "Delete this conversation?"
- On confirm: call DELETE /api/conversations/:id
- Backend sets deleted_at = now(), returns 200
- UI removes conversation immediately (optimistic update)
- If server fails: restore conversation and show error message

TDD:
- GIVEN delete button is clicked THEN confirmation dialog appears
- GIVEN user confirms THEN DELETE /api/conversations/:id is called
- GIVEN server returns 200 THEN conversation is removed from list
- GIVEN server returns error THEN conversation is restored and error shows

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUG FIX 2 — Clear all fires but restores back
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Find exactly why the UI restores after clear all — read the code first
- Most likely: a re-fetch runs after delete and overwrites the empty state
- Fix: update local state optimistically BEFORE the server call
- After clear all: list stays empty permanently

TDD:
- GIVEN clear all is confirmed THEN all conversations disappear immediately
- GIVEN re-fetch runs after clear all THEN empty list is maintained, nothing restores
- GIVEN server returns error THEN conversations are restored and error shows

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUG FIX 3 — Message limit not wired
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Find where new messages are saved in backend routes (grep for insert + messages)
- After every message save: queue enforceMessageLimit(conversationId) via BullMQ
- Must be async — never block the chat response
- Do NOT call enforceMessageLimit directly — always queue it

TDD:
- GIVEN new message is saved THEN enforceMessageLimit job is queued in BullMQ
- GIVEN conversation has 500 messages WHEN new message arrives THEN oldest is deleted
- GIVEN conversation has 499 messages WHEN new message arrives THEN nothing is deleted

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FEATURE 1 — Cursor-based pagination
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Backend: GET /api/conversations?limit=20&cursor=<last_conversation_id>
- Returns: { conversations: [...], nextCursor: string | null }
- Frontend: loads 20 conversations on open
- "Load more" button at bottom — hidden when nextCursor is null
- Never load all conversations at once under any circumstance

TDD:
- GIVEN 25 conversations exist WHEN inbox loads THEN only 20 returned
- GIVEN cursor provided THEN next batch returned from that point
- GIVEN nextCursor is null THEN load more button is hidden
- GIVEN deleted_at is set THEN excluded from all pages

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FEATURE 2 — Search conversations
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Search input at top of inbox
- Searches visitor name OR last message content
- Backend: GET /api/conversations?search=<query>&limit=20
- Use PostgreSQL ILIKE for search
- Frontend: debounce 300ms — never fires on every keystroke
- Show "No results for X" when empty

TDD:
- GIVEN search=Emeka THEN only matching conversations returned
- GIVEN search is empty THEN all conversations returned normally
- GIVEN no matches THEN empty array, no crash
- GIVEN search input changes THEN API not called until 300ms after last keystroke

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FEATURE 3 — Unread message count
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- unread_count column already added via migration above
- Increment unread_count when new visitor message arrives (all 5 channels)
- Reset to 0 when owner opens conversation
- Show number badge on each conversation row
- Show total unread count in Inbox header
- Backend: PATCH /api/conversations/:id/read sets unread_count = 0

TDD:
- GIVEN new visitor message arrives THEN unread_count increments by 1
- GIVEN owner opens conversation THEN unread_count resets to 0
- GIVEN unread_count is 0 THEN no badge in UI
- GIVEN unread_count is 5 THEN badge shows "5"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FEATURE 4 — Human takeover
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- assignee_type column already added via migration above
- "Take over" button inside each open conversation
- When clicked: PATCH /api/conversations/:id/assign with { assignee_type: "human" }
- While human: AI does NOT reply to that conversation. Owner replies manually.
- "Hand back to AI" button restores AI mode
- Show badge on conversation row: green "AI" or blue "Human"
- In all 5 channel routes: check assignee_type before generating AI reply
  IF assignee_type = 'human' THEN skip AI entirely, return 200 silently

TDD:
- GIVEN PATCH assign with human THEN assignee_type set to human
- GIVEN assignee_type is human WHEN message arrives THEN AI does NOT reply
- GIVEN assignee_type is ai WHEN message arrives THEN AI replies normally
- GIVEN take over clicked THEN UI badge changes to Human immediately
- GIVEN hand back clicked THEN UI badge changes to AI immediately

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FEATURE 5 — Conversation tags
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- tags column already added via migration above
- Available tags: Lead, Complaint, Order, Urgent, Follow-up
- Show tag chips on each conversation row
- Owner adds/removes tags by clicking inside conversation
- Backend: PATCH /api/conversations/:id/tags with { tags: string[] }
- Filter: GET /api/conversations?tag=Lead

TDD:
- GIVEN PATCH tags with ["Lead","Urgent"] THEN tags saved correctly
- GIVEN GET ?tag=Lead THEN only Lead-tagged conversations returned
- GIVEN tags empty THEN no chips on row
- GIVEN invalid tag THEN 400 returned

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXECUTION ORDER — FOLLOW EXACTLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 0 — Run pnpm test. Confirm 182 passed, 0 failed. If not, STOP.

STEP 1 — Run ALL DB migrations in Supabase SQL editor. Confirm all succeed.

STEP 2 — Fix in this exact order:
1. Dashboard Fix 1 — Remove greeting text
2. Dashboard Fix 2 — Onboarding persistence
3. Dashboard Fix 3 — Retake button
4. Inbox Bug Fix 1 — Delete per conversation
5. Inbox Bug Fix 2 — Clear all restores bug
6. Inbox Bug Fix 3 — Wire message limit
7. Inbox Feature 1 — Cursor pagination
8. Inbox Feature 2 — Search
9. Inbox Feature 3 — Unread count
10. Inbox Feature 4 — Human takeover
11. Inbox Feature 5 — Tags

For EACH item:
a) Write failing tests first
b) Confirm they fail
c) Write implementation
d) Confirm tests pass
e) Run full pnpm test — must never go below 182
f) Only then move to next item

STEP 3 — Final verification:
- pnpm test must show minimum 240 passed, 0 failed
- pnpm tsc --noEmit from artifacts/api-server — zero new TypeScript errors

STEP 4 — Report back:
- Final test count
- All files changed
- All DB migrations run
- Any pre-existing errors (do not fix — just report)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE RULES — NEVER VIOLATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Never load all conversations at once — always paginate
- Never block chat response with synchronous DB operations
- Never skip writing tests before implementation
- Never use emoji in production UI
- Never add dependencies without checking package.json first
- Never leave TODO comments in production code
- Never touch toolRunner.ts, triggerEvaluator.ts, toolExecutor.ts unless explicitly required
- If unsure about anything — STOP and ask. Do not guess.
