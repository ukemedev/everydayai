---
name: Channel guard implementation status
description: What was already implemented vs what needed to be added for T001-T005.
---

## Already done before Phase 2

- `lib/channelGuard.ts` — `verifyAgentOwnership` + `checkChannelExclusivity` — fully implemented
- Telegram setup route — `req.user?.id`, ownership check, exclusivity check
- Telegram webhook — IP rate limit, daily agent limit
- WhatsApp setup route — ownership check, exclusivity check
- WhatsApp webhook — IP rate limit, daily agent limit, HMAC-SHA256 signature verification
- `index.ts` — `requireAuth` + `deployLimiter` on all setup/deployment routes; `webhookLimiter` on all webhook routes

## Added in Phase 2 session

- `supabase-agent-channel-lock.sql` — already existed and correct (adds `external_channel` column)
- Telegram webhook: `agent.status !== "live"` guard, extended message type for photo/voice/document, media download, vision-aware AI call
- WhatsApp webhook: extended body type for image/audio/document, media download, vision-aware AI call
- Vision functions: `callOpenAIVision`, `callAnthropicVision`, `callGoogleVision` in `chat.ts`
- Attachment processing pipeline in `chat.ts` handler
- Studio.tsx capabilities UI — live toggles saving to `agents.input_capabilities`
- Chat.tsx — media buttons, voice recording, file upload, attachment preview
