---
name: Whisper transcribeAudio signature
description: Function signature quirks for the Whisper helper — Buffer type fix, optional API key.
---

## Signature

```typescript
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType:    string,
  openaiApiKey?: string   // optional — falls back to process.env.OPENAI_API_KEY
): Promise<string>
```

## Buffer type fix

`new File([audioBuffer], ...)` causes TS error: `Buffer<ArrayBufferLike>` not assignable to `BlobPart`.

**Fix**: `new File([new Uint8Array(audioBuffer)], ...)` — wrapping in Uint8Array gives `Uint8Array<ArrayBuffer>` which is a valid BlobPart.

## Why optional key

Webhooks (Telegram, WhatsApp) download media before loading the per-user API key. Making the key optional with env var fallback avoids a DB round-trip just for Whisper. Users with `OPENAI_API_KEY` env var get voice transcription automatically. Callers in webhooks pass `undefined` explicitly.
