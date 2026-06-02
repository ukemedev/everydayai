---
name: Input capabilities architecture
description: How vision, voice, file, and image inputs flow across the chat pipeline and webhooks.
---

## Architecture

- **Upload route**: `POST /api/upload` — multer, plan-gated (files=Starter+, images/voice=Pro+), returns `{ type, base64?, mimeType?, content?, filename? }`
- **Whisper**: `lib/whisper.ts` — `transcribeAudio(buffer, mimeType, openaiApiKey?)` — optional key falls back to `OPENAI_API_KEY` env var
- **Vision functions** in `chat.ts`: `callOpenAIVision`, `callAnthropicVision`, `callGoogleVision` — all after `callGroq`
- **Chat route**: `attachments?: Attachment[]` in `ChatBody`; empty message allowed when `hasAttachments`; processes voice/file as text injection; images routed to vision functions
- **Public agent endpoint**: returns `input_capabilities` in select (Chat widget reads this to show/hide media buttons)
- **Telegram webhook**: extended `update.message` type for photo/voice/document; agent.status check (`!== "live"` → drop); media download before AI call; vision-aware call
- **WhatsApp webhook**: extended body type for image/audio/document; accepts multiple message types; media download after `incrementAgentDailyCount`; vision-aware call
- **Studio.tsx**: `agentCapabilities` + `savingCapability` state; `handleToggleCapability` saves to `agents.input_capabilities` column; plan gate (files=Starter/1, images+voice=Pro/2); buttons use `.map()` loop with live toggle state
- **Chat.tsx**: `input_capabilities?` on AgentInfo; `pendingAttachment` state; `handleFileSelect` + `toggleRecording`; attachment preview pill above input; attach/mic buttons only shown when capability enabled

## Key invariants

- `sanitizeText(message ?? "")` — message can be empty string when only attachment
- Voice in webhooks: catches Whisper errors silently (key may not be configured)
- Groq has no vision — falls back to text with `[User sent an image]` prefix
- `effectiveText` is used throughout webhooks instead of raw `text`
