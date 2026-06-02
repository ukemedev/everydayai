import { logger } from "./logger.js";

interface VapiCallInput {
  toPhone: string;
  customerName?: string;
  context?: string;
}

interface VapiResult {
  success: boolean;
  summary?: string;
  callId?: string;
  error?: string;
}

export async function triggerVapiCall(
  apiKey: string,
  phoneNumberId: string,
  input: VapiCallInput
): Promise<VapiResult> {
  try {
    const body: Record<string, unknown> = {
      phoneNumberId,
      customer: {
        number: input.toPhone,
        ...(input.customerName ? { name: input.customerName } : {}),
      },
      assistant: {
        model: {
          provider: "openai",
          model:    "gpt-4o-mini",
          messages: [
            {
              role:    "system",
              content: input.context ?? "You are a helpful AI assistant making an outbound call. Be concise and professional.",
            },
          ],
        },
        voice: {
          provider: "11labs",
          voiceId:  "sarah",
        },
        firstMessage: input.context
          ? `Hello${input.customerName ? `, ${input.customerName}` : ""}! ${input.context}`
          : `Hello${input.customerName ? `, ${input.customerName}` : ""}! How can I assist you today?`,
      },
    };

    const res = await fetch("https://api.vapi.ai/call", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json() as { id?: string; status?: string; error?: string; message?: string };

    if (!res.ok) {
      const msg = data.error ?? data.message ?? `HTTP ${res.status}`;
      logger.warn({ toPhone: input.toPhone, msg }, "Vapi call failed");
      return { success: false, error: msg };
    }

    const summary = `Outbound call initiated to ${input.toPhone} (call ID: ${data.id ?? "unknown"}, status: ${data.status ?? "queued"})`;
    logger.info({ callId: data.id, toPhone: input.toPhone }, "Vapi call triggered");
    return { success: true, summary, callId: data.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "triggerVapiCall threw");
    return { success: false, error: msg };
  }
}
