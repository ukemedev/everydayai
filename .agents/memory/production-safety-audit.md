---
name: Production safety audit findings
description: Six critical/high production gaps found and fixed across aiDispatch, rateLimiter, webhook channel handlers, and chat route.
---

## Findings and fixes

### 1. Webhook rate limiter keyed by IP (CRITICAL)
**Problem:** `webhookLimiter` used default IP key. Meta (WA/Messenger/IG) and Telegram send all webhooks from a small pool of their own server IPs. 20 agents × 8 msg/min = 160 req/min > 120/min limit → legitimate messages silently dropped.
**Fix:** `makeWebhookLimiter()` factory in `rateLimiter.ts` keys by agentId from `req.path`. Requires `validate: { keyGeneratorIpFallback: false }` to suppress express-rate-limit IPv6 validation error. One factory call per channel in `routes/index.ts` so each channel has its own MemoryStore.

### 2. No timeout on AI calls (CRITICAL)
**Problem:** `callAI`/`callAIVision` in `aiDispatch.ts` had zero timeout. Hung provider calls accumulate as unresolved promises → event loop exhaustion.
**Fix:** `withTimeout<T>(promise, label)` using `Promise.race` with 30 second rejection. Applied to every provider call.

### 3. No max_tokens on OpenAI/Groq/Google (CRITICAL)
**Problem:** Only Anthropic had `max_tokens: 1024`. Others could return 4K–16K tokens per reply.
**Fix:** `MAX_REPLY_TOKENS = 1_024` applied to all four providers (`max_tokens` for OpenAI/Groq, `maxOutputTokens` for Google).

### 4. Missing in-flight guard on WhatsApp, Messenger, Instagram (CRITICAL)
**Problem:** Only Telegram had `_inFlight` Set. Fast senders triggered concurrent AI calls per conversation → duplicate replies + duplicate DB writes.
**Fix:** Module-level `_inFlight = new Set<string>()` added to all three channel routes. `let inFlightKey = ""` declared before `try` block; set after human-mode check; cleared in `finally` block so all exit paths (normal, early return, exception) always clean up.

### 5. Session limit hardcoded "free" for authenticated users (HIGH)
**Problem:** `chat.ts` line ~170 called `checkSessionLimit("free", history.length)` for ALL callers including Pro users testing their own agents in Studio → they hit the 15-message cap on their own platform.
**Fix:** Added `isPublicChat &&` guard. Session limit now only applies to unauthenticated public chat visitors.

### 6. enforceMessageLimit on every web chat message (HIGH)
**Problem:** `enforceMessageLimit(conversationId)` was called fire-and-forget on every single chat message — added a DB read+delete to every request.
**Fix:** `if (Math.random() < 0.05)` gate reduces frequency to ~1-in-20 messages. Nightly retention job already handles bulk cleanup.

## Architecture invariants to maintain
- The `_inFlight` guard goes AFTER human-mode check and BEFORE API key load. Human-mode exit must not set the key (no lock needed); API-key-missing exit is safely cleared by `finally`.
- `makeWebhookLimiter()` must be called once per channel, not shared across channels, to avoid cross-channel key collisions for the same agentId.
- `withTimeout` uses `Promise.race` (not `AbortController`) for cross-provider compatibility — Google's SDK doesn't support AbortSignal the same way.
