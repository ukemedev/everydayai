---
name: Channel guard status
description: What the channel guard system enforces and what was already in place.
---

## Already done before Phase 2

- `lib/channelGuard.ts` — ownership verification + exclusivity check — fully implemented
- Telegram setup route — ownership check, exclusivity check
- Telegram webhook — IP rate limit, daily agent limit
- WhatsApp setup route — ownership check, exclusivity check
- WhatsApp webhook — IP rate limit, daily agent limit, HMAC-SHA256 signature verification
- `index.ts` — `requireAuth` + `deployLimiter` on all setup/deployment routes; `webhookLimiter` on all webhook routes

## Added in Phase 2 session

- Vision-aware AI call pipeline for chat route, Telegram, and WhatsApp webhooks
- Attachment processing (voice, file, image) in chat handler
- `input_capabilities` column on agents table with live toggles in Studio UI
- Chat widget reads `input_capabilities` to conditionally show media buttons
