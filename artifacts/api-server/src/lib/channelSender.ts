import { sendWhatsAppMessage } from "./whatsappClient.js";
import { sendMetaMessage } from "./metaClient.js";
import { getServiceClient } from "./supabaseService.js";
import { decrypt, isEncrypted } from "./encryption.js";
import { logger } from "./logger.js";
import { truncateForTelegram } from "./aiDispatch.js";

/**
 * Deliver an AI reply to the correct channel.
 * All tokens are decrypted before use – matching existing route patterns.
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
    case "messenger":
    case "instagram": {
      const { accessToken, senderId } = await getMetaParams(channel, agentId, conversationId);
      await sendMetaMessage(accessToken, senderId, reply);
      break;
    }
    case "telegram": {
      const { botToken, chatId } = await getTelegramParams(agentId, conversationId);
      await sendTelegramMessage(botToken, chatId, reply);
      break;
    }
    case "web_widget":
    case "test":
      // No push needed – reply already in DB; UI polls for it.
      break;
    default:
      logger.warn({ channel, agentId }, "Unknown channel, cannot deliver reply");
  }
}

// ── Helpers ──────────────────────────────────────────────

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

async function getMetaParams(channel: string, agentId: string, conversationId: string) {
  const sb = getServiceClient();
  if (!sb) throw new Error("No Supabase client");

  const table = channel === "instagram" ? "instagram_deployments" : "messenger_deployments";
  const { data: dep } = await sb
    .from(table)
    .select("access_token")
    .eq("agent_id", agentId)
    .eq("status", "active")
    .maybeSingle();
  if (!dep) throw new Error(`No active ${channel} deployment`);

  const { data: conv } = await sb
    .from("conversations")
    .select("channel_conversation_id")
    .eq("id", conversationId)
    .single();
  if (!conv) throw new Error("Conversation not found");

  const rawToken = dep.access_token as string;
  const accessToken = isEncrypted(rawToken) ? decrypt(rawToken) : rawToken;

  return {
    accessToken,
    senderId: (conv as { channel_conversation_id: string }).channel_conversation_id,
  };
}

async function getTelegramParams(agentId: string, conversationId: string) {
  const sb = getServiceClient();
  if (!sb) throw new Error("No Supabase client");

  const { data: dep } = await sb
    .from("telegram_deployments")
    .select("bot_token")
    .eq("agent_id", agentId)
    .eq("status", "active")
    .maybeSingle();
  if (!dep) throw new Error("No active Telegram deployment");

  const { data: conv } = await sb
    .from("conversations")
    .select("channel_conversation_id")
    .eq("id", conversationId)
    .single();
  if (!conv) throw new Error("Conversation not found");

  const rawToken = dep.bot_token as string;
  const botToken = isEncrypted(rawToken) ? decrypt(rawToken) : rawToken;

  return {
    botToken,
    chatId: (conv as { channel_conversation_id: string }).channel_conversation_id,
  };
}

async function sendTelegramMessage(botToken: string, chatId: string, text: string) {
  const truncated = truncateForTelegram(text);
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: truncated }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "(unreadable)");
    logger.error({ chatId, status: res.status, errBody }, "Telegram API send failed");
    throw new Error(`Telegram API error ${res.status}: ${errBody}`);
  }
}
