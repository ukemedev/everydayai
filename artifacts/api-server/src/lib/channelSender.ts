import { sendWhatsAppMessage } from "./whatsappClient.js";
import { getServiceClient } from "./supabaseService.js";
import { decrypt, isEncrypted } from "./encryption.js";
import { logger } from "./logger.js";

/**
 * Deliver an AI reply to the correct channel.
 * v2 supported channels: whatsapp, web_widget, test.
 */
export async function sendChannelReply(
  channel: string,
  agentId: string,
  conversationId: string,
  reply: string
): Promise<void> {
  switch (channel) {
    case "whatsapp": {
      const { phoneNumberId, accessToken, to } = await getWhatsAppParams(agentId, conversationId);
      await sendWhatsAppMessage(phoneNumberId, accessToken, to, reply);
      break;
    }
    case "web_widget":
    case "web":
    case "test":
      // No push needed — reply already in DB; UI polls for it.
      break;
    default:
      logger.warn({ channel, agentId }, "Unknown channel, cannot deliver reply");
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getWhatsAppParams(agentId: string, conversationId: string) {
  const sb = getServiceClient();
  if (!sb) throw new Error("No Supabase client");

  const { data: dep } = await sb
    .from("whatsapp_deployments")
    .select("phone_number_id, access_token")
    .eq("agent_id", agentId)
    .eq("status", "active")
    .maybeSingle();
  if (!dep) throw new Error("No active WhatsApp deployment");

  const { data: conv } = await sb
    .from("conversations")
    .select("channel_conversation_id")
    .eq("id", conversationId)
    .single();
  if (!conv) throw new Error("Conversation not found");

  const rawToken = dep.access_token as string;
  const accessToken = isEncrypted(rawToken) ? decrypt(rawToken) : rawToken;

  return {
    phoneNumberId: dep.phone_number_id as string,
    accessToken,
    to: (conv as { channel_conversation_id: string }).channel_conversation_id,
  };
}