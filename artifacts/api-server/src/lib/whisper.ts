import OpenAI from "openai";

// ─── mimeType → file extension ────────────────────────────────────────────────

function mimeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    "audio/webm":   "webm",
    "audio/ogg":    "ogg",
    "audio/mpeg":   "mp3",
    "audio/mp3":    "mp3",
    "audio/mp4":    "mp4",
    "audio/wav":    "wav",
    "audio/x-wav":  "wav",
    "audio/m4a":    "m4a",
    "audio/x-m4a":  "m4a",
    "audio/3gpp":   "3gp",
    "audio/amr":    "amr",
  };
  return map[mimeType] ?? "webm";
}

// ─── transcribeAudio ──────────────────────────────────────────────────────────
//
// Sends an audio buffer to OpenAI Whisper and returns the plain-text transcript.
// `mimeType` should be a value like "audio/webm" or "audio/ogg".

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType:    string,
  openaiApiKey?: string
): Promise<string> {
  const resolvedKey = openaiApiKey ?? process.env.OPENAI_API_KEY;
  if (!resolvedKey) throw new Error("No OpenAI API key available for Whisper transcription");
  const client = new OpenAI({ apiKey: resolvedKey });
  const ext    = mimeToExt(mimeType.split(";")[0]?.trim() ?? mimeType);

  // new Uint8Array(audioBuffer) produces a Uint8Array<ArrayBuffer> — a valid BlobPart.
  const audioFile = new File(
    [new Uint8Array(audioBuffer)],
    `audio.${ext}`,
    { type: mimeType }
  );

  const response = await client.audio.transcriptions.create({
    model: "whisper-1",
    file:  audioFile,
  });

  return response.text;
}
