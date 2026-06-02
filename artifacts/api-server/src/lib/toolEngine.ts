import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger.js";
import { appendToSheet } from "./googleSheets.js";
import { sendTelegramMessage } from "./telegram.js";
import { sendEmail } from "./gmail.js";
import { searchWeb } from "./serper.js";
import { checkPaystackBalance } from "./paystackTools.js";
import { upsertHubSpotContact } from "./hubspotTools.js";
import { sendTermiiSms } from "./termii.js";
import { createCalendarEvent } from "./googleCalendar.js";
import { triggerVapiCall } from "./vapi.js";
import { createDriveFile } from "./googleDrive.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolRecord {
  id: string;
  tool_name: string;
  tool_description: string | null;
  connector: string;
  action: string;
  required_inputs: Array<{ name: string; label: string; description: string }> | null;
  required_auth: Record<string, string> | null;
  user_id?: string;
}

export interface ToolCallMarker {
  raw: string;
  json: string;
}

export interface ToolCallResult {
  name: string;
  status: "success" | "failed";
  data: Record<string, string>;
  response: string;
  timestamp: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function extractSpreadsheetId(url: string): string {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? url;
}

// ─── extractToolCallMarkers ───────────────────────────────────────────────────
// Finds every [TOOL_CALL:{...}] marker in an AI reply.
// Tolerates missing outer brackets and nested JSON objects.

export function extractToolCallMarkers(text: string): ToolCallMarker[] {
  const results: ToolCallMarker[] = [];
  const markerRe = /\[?TOOL_CALL:\s*(\{)/g;
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(text)) !== null) {
    const braceStart = m.index + m[0].length - 1;
    let depth = 0;
    let i = braceStart;
    for (; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") { depth--; if (depth === 0) break; }
    }
    if (depth !== 0) continue;
    const jsonStr = text.slice(braceStart, i + 1);
    const hasClosingBracket = text[i + 1] === "]";
    const raw = text.slice(m.index, i + 1 + (hasClosingBracket ? 1 : 0));
    results.push({ raw, json: jsonStr });
    markerRe.lastIndex = i + 1 + (hasClosingBracket ? 1 : 0);
  }
  return results;
}

// ─── buildToolsContext ────────────────────────────────────────────────────────
// Fetches active tools for an agent and builds the system-prompt injection
// that tells the AI how to emit [TOOL_CALL:...] markers.

export async function buildToolsContext(
  agentId: string,
  sb?: ReturnType<typeof getServiceClient>
): Promise<{ prompt: string; tools: ToolRecord[] }> {
  const client = sb ?? getServiceClient();
  if (!client) return { prompt: "", tools: [] };

  const { data, error } = await client
    .from("tools")
    .select("*")
    .eq("agent_id", agentId)
    .eq("status", "active");

  if (error || !data || data.length === 0) return { prompt: "", tools: [] };

  const tools = data as ToolRecord[];

  const toolDescriptions = tools
    .map((t) => {
      const inputs =
        t.required_inputs
          ?.map((i) => `  - ${i.name} (${i.label}): ${i.description}`)
          .join("\n") ?? "  (none)";

      let notes = "";
      if (t.connector === "google_sheets") {
        notes = "\nNOTE: The spreadsheet destination is already configured — do NOT ask the user for any URL or spreadsheet ID. Just collect the required data fields and trigger the tool.";
      } else if (t.connector === "telegram") {
        notes = "\nNOTE: The Telegram bot is already configured — do NOT ask the user for any Telegram handle, chat ID, or bot token. When triggered, the notification is sent automatically.";
      } else if (t.connector === "gmail") {
        notes = "\nNOTE: The Gmail account is already connected — do NOT ask the user for OAuth tokens or credentials. Just collect the recipient address, subject, and body from the conversation.";
      } else if (t.connector === "web_search") {
        notes = "\nNOTE: Web search is pre-configured. When the user asks anything that requires current information, recent events, prices, or live data — trigger this tool immediately with the user's question as the query.";
      } else if (t.connector === "paystack") {
        notes = "\nNOTE: Paystack is pre-configured with the merchant's account. You can check account balance or recent transactions. Trigger when the user asks about balance, payments, or transactions.";
      } else if (t.connector === "hubspot") {
        notes = "\nNOTE: HubSpot CRM is pre-configured. Automatically create or update a contact record after collecting the customer's name and contact details. Do NOT ask for CRM credentials.";
      } else if (t.connector === "termii") {
        notes = "\nNOTE: Termii SMS is pre-configured. Send an SMS to a phone number — do NOT ask for the API key or sender ID. Just collect the recipient phone (with country code) and message content.";
      } else if (t.connector === "google_calendar") {
        notes = "\nNOTE: Google Calendar is pre-configured. Book an appointment by collecting the event title, start time, end time (ISO 8601 format e.g. 2025-06-15T10:00:00), and optionally the attendee email. Do NOT ask for calendar credentials.";
      } else if (t.connector === "vapi") {
        notes = "\nNOTE: Vapi.ai voice calling is pre-configured. Trigger an outbound call by collecting the customer's phone number (with country code) and optionally their name and a short context message. Do NOT ask for API keys.";
      } else if (t.connector === "google_drive") {
        notes = "\nNOTE: Google Drive is pre-configured. Create a file by collecting the file name and the text content to save. Do NOT ask for Drive credentials or folder IDs.";
      }

      return `Tool ID: ${t.id}\nName: ${t.tool_name}\nDescription: ${t.tool_description ?? ""}\nConnector: ${t.connector}\nAction: ${t.action}\nRequired inputs:\n${inputs}${notes}`;
    })
    .join("\n\n---\n\n");

  const prompt = `

You have access to the following tools. When you have collected ALL required inputs from the user, output each tool call on its own line in EXACTLY this format, then continue with a friendly confirmation:

[TOOL_CALL:{"tool_id":"<id>","inputs":{"<field_name>":"<value>"}}]

CRITICAL RULES:
- If multiple tools are relevant (e.g. save to Google Sheets AND send a Telegram notification), output ALL tool calls one after another without waiting — use every relevant tool automatically in a single response.
- For google_sheets: NEVER ask the user for a spreadsheet URL or ID — it is already saved. Collect only the data fields listed under "Required inputs", then trigger immediately.
- For telegram: NEVER ask for Telegram credentials. Trigger with a "message" input summarising what happened.
- For gmail: NEVER ask for credentials. Collect to/subject/body from the conversation.
- For web_search: trigger with "query" set to the user's search intent. Use the results to answer the question directly.
- For paystack: trigger with "action" set to "check_balance" or "recent_transactions".
- For hubspot: trigger with name, email, and optionally phone. Trigger automatically after collecting customer info.
- For termii: trigger with phone (including country code e.g. 2348012345678) and message.

Available tools:
---
${toolDescriptions}`;

  logger.info({ agentId, toolCount: tools.length }, "tools context built");
  return { prompt, tools };
}

// ─── executeToolsInReply ──────────────────────────────────────────────────────
// Takes the full AI reply string + the list of ToolRecords loaded for this agent.
// Finds every [TOOL_CALL:...] marker, executes the corresponding tool, replaces
// the marker with a human-readable status message, and returns the cleaned reply.

export async function executeToolsInReply(
  reply: string,
  tools: ToolRecord[],
  ownerId: string,
  sb?: ReturnType<typeof getServiceClient>
): Promise<{ reply: string; results: ToolCallResult[] }> {
  const markers = extractToolCallMarkers(reply);
  if (markers.length === 0 || tools.length === 0) return { reply, results: [] };

  const client = sb ?? getServiceClient();
  const results: ToolCallResult[] = [];
  let modifiedReply = reply;

  for (const { raw, json } of markers) {
    try {
      const parsed = JSON.parse(json) as {
        tool_id: string;
        inputs: Record<string, string>;
        spreadsheet_id?: string;
        sheet_name?: string;
      };

      const tool = tools.find((t) => t.id === parsed.tool_id);
      if (!tool) {
        modifiedReply = modifiedReply.replace(raw, "");
        continue;
      }

      const auth = tool.required_auth ?? {};
      let resultMsg = "";
      let result: ToolCallResult;

      // ── google_sheets ──────────────────────────────────────────────────────
      if (tool.connector === "google_sheets" && client) {
        const { data: integration } = await client
          .from("integrations")
          .select("access_token")
          .eq("user_id", ownerId)
          .eq("provider", "google")
          .maybeSingle();

        if (integration?.access_token) {
          const rowData = tool.required_inputs?.length
            ? tool.required_inputs.map((i) => parsed.inputs[i.name] ?? "")
            : Object.values(parsed.inputs);

          const sheetUrl = auth.spreadsheet_url ?? "";
          const spreadsheetId = sheetUrl
            ? extractSpreadsheetId(sheetUrl)
            : (parsed.spreadsheet_id ?? "");
          const sheetName =
            parsed.sheet_name ?? auth.sheet_name ?? "Sheet1";

          const sheetResult = await appendToSheet(
            integration.access_token as string,
            spreadsheetId,
            sheetName,
            rowData
          );
          const ok = sheetResult.success;
          resultMsg = ok
            ? "✓ Saved to Google Sheets"
            : `⚠ Could not save to Google Sheets: ${sheetResult.error}`;
          result = {
            name: tool.tool_name,
            status: ok ? "success" : "failed",
            data: parsed.inputs,
            response: ok ? "Row appended" : (sheetResult.error ?? "Unknown"),
            timestamp: new Date().toISOString(),
          };
        } else {
          resultMsg = "⚠ Google Sheets not connected. Please connect Google in the Tools tab.";
          result = { name: tool.tool_name, status: "failed", data: parsed.inputs, response: "Google account not connected", timestamp: new Date().toISOString() };
        }

      // ── telegram ───────────────────────────────────────────────────────────
      } else if (tool.connector === "telegram" && client) {
        const toolOwnerId = (tool as { user_id?: string }).user_id ?? ownerId;
        const { data: integration } = await client
          .from("integrations")
          .select("access_token, refresh_token")
          .eq("user_id", toolOwnerId)
          .eq("provider", "telegram")
          .maybeSingle();

        const botToken = integration?.access_token as string | undefined;
        const chatId   = integration?.refresh_token as string | undefined;

        if (botToken && chatId) {
          const summary  = parsed.inputs.message ?? Object.entries(parsed.inputs).map(([k, v]) => `${k}: ${v}`).join(", ");
          const tgMsg    = `🔔 New notification from ${tool.tool_name}:\n${summary}`;
          const tgResult = await sendTelegramMessage(botToken, chatId, tgMsg);
          const ok = tgResult.success;
          resultMsg = ok
            ? "✓ Telegram notification sent"
            : `⚠ Could not send Telegram message: ${tgResult.error}`;
          result = {
            name: tool.tool_name,
            status: ok ? "success" : "failed",
            data: parsed.inputs,
            response: ok ? "Delivered" : (tgResult.error ?? "Unknown"),
            timestamp: new Date().toISOString(),
          };
        } else {
          resultMsg = "⚠ Telegram not connected. Please add your Bot Token and Chat ID in Settings.";
          result = { name: tool.tool_name, status: "failed", data: parsed.inputs, response: "Telegram credentials not configured", timestamp: new Date().toISOString() };
        }

      // ── gmail ──────────────────────────────────────────────────────────────
      } else if (tool.connector === "gmail" && client) {
        const to      = parsed.inputs.to ?? parsed.inputs.email ?? "";
        const subject = parsed.inputs.subject ?? "(no subject)";
        const body    = parsed.inputs.body ?? parsed.inputs.message ?? "";

        const { data: integration } = await client
          .from("integrations")
          .select("access_token")
          .eq("user_id", ownerId)
          .eq("provider", "google")
          .maybeSingle();

        if (integration?.access_token) {
          const gmailResult = await sendEmail(integration.access_token as string, to, subject, body);
          const ok = gmailResult.success;
          resultMsg = ok
            ? "✓ Email sent via Gmail"
            : `⚠ Could not send email: ${gmailResult.error}`;
          result = {
            name: tool.tool_name,
            status: ok ? "success" : "failed",
            data: parsed.inputs,
            response: ok ? `Email delivered to ${to}` : (gmailResult.error ?? "Unknown"),
            timestamp: new Date().toISOString(),
          };
        } else {
          resultMsg = "⚠ Gmail not connected. Please connect Google in the Tools tab.";
          result = { name: tool.tool_name, status: "failed", data: parsed.inputs, response: "Google account not connected", timestamp: new Date().toISOString() };
        }

      // ── web_search (Serper) ────────────────────────────────────────────────
      } else if (tool.connector === "web_search") {
        const apiKey = auth.api_key ?? "";
        const query  = parsed.inputs.query ?? parsed.inputs.search ?? Object.values(parsed.inputs)[0] ?? "";

        if (!apiKey) {
          resultMsg = "⚠ Serper API key not configured. Add it in the Tools tab.";
          result = { name: tool.tool_name, status: "failed", data: parsed.inputs, response: "Missing api_key", timestamp: new Date().toISOString() };
        } else if (!query) {
          resultMsg = "⚠ No search query provided.";
          result = { name: tool.tool_name, status: "failed", data: parsed.inputs, response: "Missing query", timestamp: new Date().toISOString() };
        } else {
          const searchResult = await searchWeb(apiKey, query);
          const ok = searchResult.success;
          resultMsg = ok
            ? `✓ Web search results:\n${searchResult.summary ?? "No results"}`
            : `⚠ Web search failed: ${searchResult.error}`;
          result = {
            name: tool.tool_name,
            status: ok ? "success" : "failed",
            data: parsed.inputs,
            response: searchResult.summary ?? searchResult.error ?? "Unknown",
            timestamp: new Date().toISOString(),
          };
        }

      // ── paystack ───────────────────────────────────────────────────────────
      } else if (tool.connector === "paystack") {
        const secretKey = auth.secret_key ?? "";
        const action    = parsed.inputs.action ?? "check_balance";

        if (!secretKey) {
          resultMsg = "⚠ Paystack secret key not configured. Add it in the Tools tab.";
          result = { name: tool.tool_name, status: "failed", data: parsed.inputs, response: "Missing secret_key", timestamp: new Date().toISOString() };
        } else {
          const pResult = await checkPaystackBalance(secretKey, action);
          const ok = pResult.success;
          resultMsg = ok
            ? `✓ Paystack: ${pResult.summary}`
            : `⚠ Paystack error: ${pResult.error}`;
          result = {
            name: tool.tool_name,
            status: ok ? "success" : "failed",
            data: parsed.inputs,
            response: pResult.summary ?? pResult.error ?? "Unknown",
            timestamp: new Date().toISOString(),
          };
        }

      // ── hubspot ────────────────────────────────────────────────────────────
      } else if (tool.connector === "hubspot") {
        const accessToken = auth.access_token ?? "";

        if (!accessToken) {
          resultMsg = "⚠ HubSpot access token not configured. Add it in the Tools tab.";
          result = { name: tool.tool_name, status: "failed", data: parsed.inputs, response: "Missing access_token", timestamp: new Date().toISOString() };
        } else {
          const hsResult = await upsertHubSpotContact(accessToken, {
            name:  parsed.inputs.name  ?? "",
            email: parsed.inputs.email ?? "",
            phone: parsed.inputs.phone,
          });
          const ok = hsResult.success;
          resultMsg = ok
            ? `✓ HubSpot: ${hsResult.summary}`
            : `⚠ HubSpot error: ${hsResult.error}`;
          result = {
            name: tool.tool_name,
            status: ok ? "success" : "failed",
            data: parsed.inputs,
            response: hsResult.summary ?? hsResult.error ?? "Unknown",
            timestamp: new Date().toISOString(),
          };
        }

      // ── termii ─────────────────────────────────────────────────────────────
      } else if (tool.connector === "termii") {
        const apiKey   = auth.api_key   ?? "";
        const senderId = auth.sender_id ?? "EverydayAI";
        const phone    = parsed.inputs.phone   ?? parsed.inputs.to ?? "";
        const message  = parsed.inputs.message ?? parsed.inputs.body ?? "";

        if (!apiKey) {
          resultMsg = "⚠ Termii API key not configured. Add it in the Tools tab.";
          result = { name: tool.tool_name, status: "failed", data: parsed.inputs, response: "Missing api_key", timestamp: new Date().toISOString() };
        } else if (!phone || !message) {
          resultMsg = `⚠ Termii: missing ${!phone ? "phone number" : "message"}.`;
          result = { name: tool.tool_name, status: "failed", data: parsed.inputs, response: "Missing required fields", timestamp: new Date().toISOString() };
        } else {
          const tResult = await sendTermiiSms(apiKey, senderId, phone, message);
          const ok = tResult.success;
          resultMsg = ok
            ? `✓ SMS sent to ${phone}`
            : `⚠ Termii error: ${tResult.error}`;
          result = {
            name: tool.tool_name,
            status: ok ? "success" : "failed",
            data: parsed.inputs,
            response: ok ? "SMS delivered" : (tResult.error ?? "Unknown"),
            timestamp: new Date().toISOString(),
          };
        }

      // ── google_calendar ────────────────────────────────────────────────────
      } else if (tool.connector === "google_calendar") {
        const serviceKey = auth.service_key ?? "";
        const calendarId = auth.calendar_id ?? "";

        if (!serviceKey || !calendarId) {
          resultMsg = "⚠ Google Calendar not configured. Add your Service Account JSON and Calendar ID in the Tools tab.";
          result = { name: tool.tool_name, status: "failed", data: parsed.inputs, response: "Missing credentials", timestamp: new Date().toISOString() };
        } else {
          const calResult = await createCalendarEvent(serviceKey, calendarId, {
            summary:       parsed.inputs.summary       ?? parsed.inputs.title ?? "Appointment",
            startTime:     parsed.inputs.start_time    ?? parsed.inputs.start ?? "",
            endTime:       parsed.inputs.end_time      ?? parsed.inputs.end   ?? "",
            description:   parsed.inputs.description,
            attendeeEmail: parsed.inputs.attendee_email ?? parsed.inputs.email,
            timeZone:      parsed.inputs.time_zone      ?? auth.time_zone,
          });
          const ok = calResult.success;
          resultMsg = ok
            ? `✓ Appointment booked: ${calResult.summary}`
            : `⚠ Calendar error: ${calResult.error}`;
          result = {
            name: tool.tool_name,
            status: ok ? "success" : "failed",
            data: parsed.inputs,
            response: calResult.summary ?? calResult.error ?? "Unknown",
            timestamp: new Date().toISOString(),
          };
        }

      // ── vapi ───────────────────────────────────────────────────────────────
      } else if (tool.connector === "vapi") {
        const apiKey       = auth.api_key         ?? "";
        const phoneNumberId = auth.phone_number_id ?? "";
        const toPhone       = parsed.inputs.phone  ?? parsed.inputs.to ?? "";

        if (!apiKey || !phoneNumberId) {
          resultMsg = "⚠ Vapi.ai not configured. Add your API Key and Phone Number ID in the Tools tab.";
          result = { name: tool.tool_name, status: "failed", data: parsed.inputs, response: "Missing credentials", timestamp: new Date().toISOString() };
        } else if (!toPhone) {
          resultMsg = "⚠ Vapi: no phone number provided.";
          result = { name: tool.tool_name, status: "failed", data: parsed.inputs, response: "Missing phone", timestamp: new Date().toISOString() };
        } else {
          const vapiResult = await triggerVapiCall(apiKey, phoneNumberId, {
            toPhone,
            customerName: parsed.inputs.name    ?? parsed.inputs.customer_name,
            context:      parsed.inputs.context ?? parsed.inputs.message,
          });
          const ok = vapiResult.success;
          resultMsg = ok
            ? `✓ Voice call initiated to ${toPhone}: ${vapiResult.summary}`
            : `⚠ Vapi error: ${vapiResult.error}`;
          result = {
            name: tool.tool_name,
            status: ok ? "success" : "failed",
            data: parsed.inputs,
            response: vapiResult.summary ?? vapiResult.error ?? "Unknown",
            timestamp: new Date().toISOString(),
          };
        }

      // ── google_drive ───────────────────────────────────────────────────────
      } else if (tool.connector === "google_drive") {
        const serviceKey = auth.service_key ?? "";
        const folderId   = auth.folder_id   ?? "";

        if (!serviceKey || !folderId) {
          resultMsg = "⚠ Google Drive not configured. Add your Service Account JSON and Folder ID in the Tools tab.";
          result = { name: tool.tool_name, status: "failed", data: parsed.inputs, response: "Missing credentials", timestamp: new Date().toISOString() };
        } else {
          const fileName = parsed.inputs.file_name ?? parsed.inputs.name ?? `document-${Date.now()}.txt`;
          const content  = parsed.inputs.content   ?? parsed.inputs.body ?? "";
          const mimeType = parsed.inputs.mime_type ?? "text/plain";
          const driveResult = await createDriveFile(serviceKey, folderId, fileName, content, mimeType);
          const ok = driveResult.success;
          resultMsg = ok
            ? `✓ File saved to Drive: ${driveResult.summary}`
            : `⚠ Drive error: ${driveResult.error}`;
          result = {
            name: tool.tool_name,
            status: ok ? "success" : "failed",
            data: parsed.inputs,
            response: driveResult.summary ?? driveResult.error ?? "Unknown",
            timestamp: new Date().toISOString(),
          };
        }

      } else {
        modifiedReply = modifiedReply.replace(raw, "");
        continue;
      }

      logger.info({ toolId: tool.id, connector: tool.connector, status: result.status }, "tool execution complete");
      results.push(result);
      modifiedReply = modifiedReply.replace(raw, resultMsg ? `[${resultMsg}]` : "");

    } catch (err) {
      logger.error({ err }, "tool call parse/execution error — removing marker");
      modifiedReply = modifiedReply.replace(raw, "");
    }
  }

  return { reply: modifiedReply, results };
}
