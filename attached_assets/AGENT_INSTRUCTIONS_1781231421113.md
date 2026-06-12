You are working on the EverydayAI codebase — a production-grade AI agent SaaS platform. This is a Node.js/Express + TypeScript backend, Supabase (PostgreSQL) database, and React/Vite frontend organized as a pnpm monorepo.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE 3 LAWS — NON-NEGOTIABLE. NEVER BREAK THESE.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

LAW 1 — NO VIBE CODING. EVER.
- Never assume. Never guess. Never hallucinate APIs, function names, table names, or file paths.
- Before writing ANY code, web search to verify the exact API, method signature, or pattern you are about to use.
- If anything in this prompt is unclear or does not match what you find in the codebase, STOP and report back. Do not improvise.
- Read every relevant file before touching it. Confirm exact variable names, imports, and structure first.

LAW 2 — SENIOR SWE STANDARD ONLY.
- Every piece of code must be simple, powerful, reliable, consistent, zero bugs, very fast, and redundant.
- System design first — plan every change before touching a single file.
- TDD always — write the failing test FIRST, then write the code to make it pass. Never the other way.
- Sealed behaviour — every feature is locked behind tests so it can never be accidentally broken.
- Use the Red-Green-Refactor cycle: failing test → minimum code to pass → clean up.

LAW 3 — NEVER BREAK THE TEST SUITE.
- Run pnpm test before touching anything. Confirm 152 tests pass, 0 fail.
- After every single fix, run pnpm test again.
- The number must never go down. Only up.
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
SYSTEM DESIGN — READ THIS FULLY BEFORE WRITING A SINGLE LINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PROBLEM 1 — Onboarding "Test your agent" step not persisting

Root cause: Completion state lives only in React memory. Dies on refresh or logout.

Design:
- Add completed_steps jsonb column to profiles table in Supabase
- Default value: '[]'
- Stores array of completed step keys e.g. ["create_account","create_agent","teach_business","test_agent","go_live"]
- Backend exposes PATCH /api/onboarding/complete-step endpoint
- Accepts { step: string } in body
- Appends step to completed_steps array if not already present
- Frontend reads completed_steps from profiles on load — not from memory
- Frontend calls PATCH endpoint when test_agent step is completed
- Step shows as done on refresh and after logout/login

Migration required:
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS completed_steps jsonb NOT NULL DEFAULT '[]';

TDD — write these tests first:
- GIVEN user completes test_agent WHEN they refresh THEN test_agent shows as completed
- GIVEN completed_steps is null in DB WHEN frontend loads THEN it defaults to empty array with no crash
- GIVEN PATCH /api/onboarding/complete-step is called with valid step THEN it appends to array and returns 200
- GIVEN step already exists in array WHEN called again THEN it does not duplicate
- GIVEN invalid step name THEN returns 400


PROBLEM 2 — Add "Retake" link next to "Skip setup"

Design:
- Add a small "Retake" text link next to "Skip setup" in the onboarding card
- Only visible when test_agent is already in completed_steps
- On click: calls PATCH /api/onboarding/remove-step with { step: "test_agent" }
- Backend removes test_agent from completed_steps array
- Frontend reopens the test agent modal immediately

TDD — write these tests first:
- GIVEN test_agent is completed WHEN user clicks Retake THEN test_agent is removed from completed_steps in DB
- GIVEN DB update fails WHEN Retake is clicked THEN UI shows error without corrupting state
- GIVEN test_agent is NOT completed THEN Retake link is not visible in DOM


PROBLEM 3 — Remove "Welcome back" text from login page and dashboard

Design:
- Login page: remove the "Welcome back" heading entirely. Keep all other login UI.
- Dashboard home: remove the "Welcome back 👋" heading entirely. Keep all other dashboard content.
- No backend changes needed.

TDD — write these tests first:
- GIVEN login page renders THEN "Welcome back" text does not exist in DOM
- GIVEN dashboard renders THEN "Welcome back" text does not exist in DOM


PROBLEM 4 — Add Forgot Password feature

Design:
- Add "Forgot password?" link below the password field on login page
- Clicking it shows an inline form (no new page needed) with one email input and a "Send reset link" button
- Calls supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/reset-password" })
- Always shows generic success message regardless of whether email exists — security best practice to prevent email enumeration
- Create new page: ResetPassword.tsx at route /reset-password
- On load: reads access_token from URL hash using supabase.auth.onAuthStateChange
- Shows new password + confirm password form
- On submit: calls supabase.auth.updateUser({ password: newPassword })
- On success: redirect to /home
- Validate: passwords must match, minimum 8 characters, show inline errors

Security rules:
- Generic success message always — never reveal if email exists
- Token expires in 1 hour (Supabase default)
- Rate limit: already handled by Supabase

TDD — write these tests first:
- GIVEN user submits valid email THEN success message shows regardless of whether account exists
- GIVEN user submits empty email THEN validation error shows, no API call made
- GIVEN passwords do not match on reset form THEN inline error shows
- GIVEN password is less than 8 characters THEN inline error shows
- GIVEN valid token in URL WHEN user submits new password THEN supabase.auth.updateUser is called
- GIVEN Supabase returns error THEN friendly error message shows, no crash


PROBLEM 5 — Remove Templates feature entirely

Design:
- Remove Templates nav link from sidebar
- Delete or empty the Templates page/route
- Redirect /templates to /home
- Remove all imports and references to Templates across the codebase
- No DB migration needed

Steps:
1. grep -rn "templates\|Templates" artifacts/everydayai/src --include="*.tsx" --include="*.ts" -l to find all files
2. Remove only Templates-related code. Touch nothing else.
3. Add redirect: if user navigates to /templates, send them to /home

TDD — write these tests first:
- GIVEN app renders THEN Templates link does not exist in nav DOM
- GIVEN user navigates to /templates THEN they are redirected to /home


PROBLEM 6 — Inbox: Add delete conversation + clear all

Design:
- Add soft delete pattern to conversations table
- Add column: deleted_at timestamptz DEFAULT NULL
- Soft delete means: set deleted_at = now(). Do NOT physically delete the row yet.
- RLS policy automatically hides deleted rows from users
- Add DELETE /api/conversations/:id endpoint — sets deleted_at, returns 200
- Add DELETE /api/conversations endpoint — soft deletes ALL conversations for the user
- Frontend: add delete icon button on each conversation row in inbox
- Frontend: add "Clear all" button at top of inbox
- Both show a confirmation dialog before proceeding
- After delete: conversation disappears from inbox immediately (optimistic UI update)

Migration required:
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_deleted_at ON conversations (deleted_at) WHERE deleted_at IS NULL;
Update RLS policy to add: AND deleted_at IS NULL to the USING clause

TDD — write these tests first:
- GIVEN DELETE /api/conversations/:id is called THEN deleted_at is set, returns 200
- GIVEN conversation has deleted_at set WHEN inbox query runs THEN that conversation is NOT returned
- GIVEN DELETE /api/conversations is called THEN all user conversations get deleted_at set
- GIVEN delete button is clicked in UI THEN confirmation dialog appears
- GIVEN user confirms delete THEN conversation disappears from inbox immediately


PROBLEM 7 — Inbox: Message retention system for 10,000 concurrent users

Design:
This protects the database from growing forever and crashing under load.

Rules:
- Maximum 500 messages per conversation. When message 501 arrives, oldest message is permanently deleted.
- Conversations older than 90 days with deleted_at set are permanently purged nightly.
- Use BullMQ (already installed) for the nightly cleanup job — never blocks the chat flow.

Implementation:
- Create src/jobs/retentionJob.ts
- Job 1: cleanOldDeletedConversations — runs nightly at 2AM — permanently deletes rows where deleted_at < now() - interval '90 days'
- Job 2: enforceMessageLimit — runs after every new message is saved — counts messages in conversation, deletes oldest if count > 500
- Register both jobs in the existing BullMQ worker setup
- Use batched deletes of max 1000 rows at a time to avoid locking the DB

TDD — write these tests first:
- GIVEN cleanup job runs WHEN conversation deleted_at is older than 90 days THEN row is permanently deleted
- GIVEN cleanup job runs WHEN conversation deleted_at is less than 90 days THEN row is NOT deleted
- GIVEN conversation has 500 messages WHEN new message arrives THEN oldest message is deleted, total stays 500
- GIVEN conversation has 499 messages WHEN new message arrives THEN no message is deleted
- GIVEN batch delete runs THEN it deletes in batches of max 1000, never all at once


PROBLEM 8 — Replace unprofessional icons

Design:
Part A — Test Agent button:
- Remove robot emoji from the Test Agent floating button
- Replace with <Play size={16} /> from lucide-react (already installed)

Part B — Inbox channel icons:
- Create a single channelIcons.ts file in artifacts/everydayai/src/lib/
- Map each channel to a proper icon:
  - web/widget → <Globe /> from lucide-react
  - whatsapp → inline WhatsApp SVG (green #25D366, official brand shape)
  - telegram → inline Telegram SVG (blue #2AABEE, official brand shape)
  - instagram → inline Instagram SVG (gradient, official brand shape)
  - messenger → inline Messenger SVG (blue #0084FF, official brand shape)
- Import channelIcons in the Inbox component and replace existing icons
- Web search for the exact official SVG paths for each brand icon before writing them

TDD — write these tests first:
- GIVEN inbox renders with a WhatsApp conversation THEN WhatsApp icon renders correctly
- GIVEN inbox renders with a Telegram conversation THEN Telegram icon renders correctly
- GIVEN Test Agent button renders THEN robot emoji does not exist in DOM
- GIVEN Test Agent button renders THEN Play icon exists in DOM


PROBLEM 9 — Test Agent: Improve error state when API key is missing

Design:
- When user sends a message in Test Agent and no API key is configured:
  - Show a clear, friendly card message: "No API key configured. Go to Settings → API Keys to add your key."
  - Include a direct link that navigates to Settings page
  - Do NOT show a raw error or crash
- When API key IS configured and call fails for another reason:
  - Show: "Something went wrong. Please try again."
- Never show raw error objects or stack traces to the user

TDD — write these tests first:
- GIVEN agent has no API key WHEN user sends message THEN friendly error card renders with Settings link
- GIVEN agent has API key WHEN call fails with non-auth error THEN generic error message renders
- GIVEN agent has API key WHEN call succeeds THEN no error message in DOM

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXECUTION ORDER — FOLLOW THIS EXACTLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 0 — Orient yourself
- Run: pnpm test
- Confirm: 152 passed, 0 failed
- If it does not match, STOP and report. Do not proceed.

STEP 1 — Run all DB migrations first
- Run migration for Problem 1 (completed_steps column)
- Run migration for Problem 6 (deleted_at column + index + RLS update)
- Confirm both succeed in Supabase before writing any code

STEP 2 — Fix problems in this exact order
1. Problem 1 — Onboarding persistence
2. Problem 2 — Retake button
3. Problem 3 — Remove Welcome back
4. Problem 4 — Forgot Password
5. Problem 5 — Remove Templates
6. Problem 6 — Inbox delete
7. Problem 7 — Retention system
8. Problem 8 — Icons
9. Problem 9 — Test Agent error state

For EACH problem:
a) Write failing tests first
b) Confirm they fail
c) Write the implementation
d) Confirm tests pass
e) Run full pnpm test — confirm all previous tests still pass
f) Only then move to next problem

STEP 3 — Final verification
- Run pnpm test one final time
- Must show minimum 185 passed, 0 failed
- Run TypeScript check: pnpm tsc --noEmit from artifacts/api-server
- Confirm zero new TypeScript errors

STEP 4 — Report back
Provide:
- Final test count
- List of all files changed
- List of all DB migrations run
- Confirmation that zero toolEngine or Templates references remain
- Any pre-existing errors that existed before this session (do not fix those — just report)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE RULES — NEVER VIOLATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Never touch toolRunner.ts, triggerEvaluator.ts, toolExecutor.ts, or any file in src/lib/ unless a problem explicitly requires it
- Never refactor code outside the scope of each problem
- Never add new dependencies without checking if an equivalent already exists in package.json first
- Never skip writing tests before implementation
- Never leave a TODO comment in production code
- Never use emoji in production UI unless explicitly specified in this prompt
- If you are unsure about anything — STOP and ask. Do not guess.
