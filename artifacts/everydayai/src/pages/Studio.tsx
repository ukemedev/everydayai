import { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import { useLocation, useParams } from "wouter";
import { supabase } from "@/lib/supabase";
import UpgradeModal from "@/components/UpgradeModal";


// ─── Model catalogue ──────────────────────────────────────────────────────────

const modelGroups = [
  {
    provider: "openai",
    label: "OpenAI",
    models: [
      { value: "gpt-4o-mini", label: "GPT-4o Mini" },
      { value: "gpt-4o", label: "GPT-4o" },
      { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
    ],
  },
  {
    provider: "anthropic",
    label: "Anthropic",
    models: [
      { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
      { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
    ],
  },
  {
    provider: "google",
    label: "Google",
    models: [
      { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
      { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    ],
  },
  {
    provider: "groq",
    label: "Groq (Free)",
    models: [
      { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B (Fast)" },
      { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
      { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
    ],
  },
];

function getProviderForModel(modelValue: string): string {
  for (const group of modelGroups) {
    if (group.models.some((m) => m.value === modelValue)) return group.provider;
  }
  return "openai";
}

const tabs = ["Prompt", "Knowledge", "Tools"] as const;
type Tab = (typeof tabs)[number];

interface Agent {
  id: string;
  name: string;
  description: string | null;
  model: string;
  status: string;
}

interface ToolInput {
  name: string;
  label: string;
  description: string;
}

interface ToolPreview {
  connector: string;
  action: string;
  tool_name: string;
  tool_description: string;
  required_inputs: ToolInput[];
  required_auth: { type: string; provider: string; description: string };
}

const CONNECTOR_ICONS: Record<string, string> = {
  google_sheets: "📊",
  telegram:      "📱",
  gmail:         "📧",
  whatsapp:      "💬",
  instagram:     "📸",
};

const CONNECTOR_LABELS: Record<string, string> = {
  google_sheets: "Google Sheets",
  telegram:      "Telegram",
  gmail:         "Gmail",
  whatsapp:      "WhatsApp",
  instagram:     "Instagram",
};

// ─── Static tools catalogue ──────────────────────────────────────────────────

interface ToolField { key: string; label: string; placeholder: string; type: "text" | "email" | "password" | "textarea" }
interface StaticTool { id: string; name: string; category: string; desc: string; initials: string; color: string; bg: string; fields: ToolField[] }

const STATIC_TOOLS: StaticTool[] = [
  // ── Starter tier ────────────────────────────────────────────────────────────
  {
    id: "google_sheets", name: "Google Sheets", category: "📊 Save Data",
    desc: "Save collected data directly to your spreadsheets",
    initials: "GS", color: "#0F9D58", bg: "rgba(15,157,88,0.12)",
    fields: [
      { key: "sheet_url",  label: "Sheet URL",        placeholder: "https://docs.google.com/spreadsheets/d/...", type: "text" },
      { key: "sheet_name", label: "Sheet Name (Tab)", placeholder: "Sheet1", type: "text" },
    ],
  },
  {
    id: "gmail", name: "Gmail", category: "📧 Email",
    desc: "Send automated emails to your leads and customers",
    initials: "Gm", color: "#EA4335", bg: "rgba(234,67,53,0.12)",
    fields: [
      { key: "email",        label: "Gmail Address", placeholder: "you@gmail.com",       type: "email" },
      { key: "app_password", label: "App Password",  placeholder: "xxxx xxxx xxxx xxxx", type: "password" },
    ],
  },
  {
    id: "telegram", name: "Telegram", category: "💬 Notify Owner",
    desc: "Get instant Telegram alerts whenever a key event happens",
    initials: "Tg", color: "#2AABEE", bg: "rgba(42,171,238,0.12)",
    fields: [
      { key: "bot_token", label: "Bot Token", placeholder: "123456:ABC-DEF...", type: "password" },
      { key: "chat_id",   label: "Chat ID",   placeholder: "-100123456789",     type: "text" },
    ],
  },
  {
    id: "termii", name: "Termii", category: "🔔 SMS",
    desc: "Send OTPs and SMS messages to any phone number in Africa",
    initials: "Tm", color: "#F97316", bg: "rgba(249,115,22,0.12)",
    fields: [
      { key: "api_key",   label: "API Key",   placeholder: "TLtest_xxxxxxxxxx", type: "password" },
      { key: "sender_id", label: "Sender ID", placeholder: "YourBrand",         type: "text" },
    ],
  },
  // ── Pro tier ────────────────────────────────────────────────────────────────
  {
    id: "paystack", name: "Paystack", category: "💰 Payments",
    desc: "Accept payments and process transactions across Africa",
    initials: "PS", color: "#00C3F7", bg: "rgba(0,195,247,0.12)",
    fields: [
      { key: "secret_key", label: "Secret Key", placeholder: "sk_live_xxxxxxxxxxxxxxxxxx", type: "password" },
    ],
  },
  {
    id: "hubspot", name: "HubSpot", category: "👤 Customer Memory",
    desc: "Store and recall customer information directly from your CRM",
    initials: "HS", color: "#FF7A59", bg: "rgba(255,122,89,0.12)",
    fields: [
      { key: "access_token", label: "Private App Token", placeholder: "pat-na1-xxxxxxxxxx", type: "password" },
    ],
  },
  {
    id: "web_search", name: "Web Search", category: "🔍 Intelligence",
    desc: "Let your agent search the internet for live, up-to-date information",
    initials: "WS", color: "#8B5CF6", bg: "rgba(139,92,246,0.12)",
    fields: [
      { key: "api_key", label: "Serper API Key", placeholder: "Your Serper.dev key", type: "password" },
    ],
  },
  {
    id: "google_calendar", name: "Google Calendar", category: "📅 Booking",
    desc: "Let customers book appointments in your calendar in real time",
    initials: "GC", color: "#4285F4", bg: "rgba(66,133,244,0.12)",
    fields: [
      { key: "calendar_id", label: "Calendar ID",          placeholder: "you@gmail.com",                  type: "text" },
      { key: "service_key", label: "Service Account JSON", placeholder: '{ "type": "service_account", ... }', type: "textarea" },
    ],
  },
  {
    id: "google_drive", name: "Google Drive", category: "📄 Documents",
    desc: "Create, read, and manage files and folders in your Drive",
    initials: "GD", color: "#FBBC04", bg: "rgba(251,188,4,0.12)",
    fields: [
      { key: "folder_id",   label: "Target Folder ID",     placeholder: "1BxiMVs0XRA5nFMdKvBdBZjgm...",      type: "text" },
      { key: "service_key", label: "Service Account JSON", placeholder: '{ "type": "service_account", ... }', type: "textarea" },
    ],
  },
  {
    id: "vapi", name: "Vapi.ai", category: "📞 Voice Calls",
    desc: "Make and receive AI-powered phone calls automatically",
    initials: "Vi", color: "#10B981", bg: "rgba(16,185,129,0.12)",
    fields: [
      { key: "api_key",         label: "API Key",         placeholder: "vapi_xxxxxxxxxx",  type: "password" },
      { key: "phone_number_id", label: "Phone Number ID", placeholder: "phnum_xxxxxxxxxx", type: "text" },
    ],
  },
];

const PLAN_ORDER = ["free", "starter", "pro", "business"];

const STARTER_TOOL_IDS = new Set(["google_sheets", "gmail", "telegram", "termii"]);
const PRO_TOOL_IDS     = new Set(["paystack", "hubspot", "web_search", "google_calendar", "google_drive", "vapi"]);

function toolRequiredPlan(connectorId: string): string | null {
  if (STARTER_TOOL_IDS.has(connectorId)) return "Starter";
  if (PRO_TOOL_IDS.has(connectorId))     return "Pro";
  return null;
}

function isPlanSufficientFor(required: string | null, userPlan: string): boolean {
  if (!required) return true;
  return PLAN_ORDER.indexOf(userPlan) >= PLAN_ORDER.indexOf(required.toLowerCase());
}

interface Tool {
  id: string;
  agent_id: string;
  user_id: string;
  tool_name: string;
  tool_description: string | null;
  connector: string;
  action: string;
  required_inputs: ToolInput[] | null;
  required_auth: { type: string; provider: string; description: string } | null;
  status: string;
  created_at: string;
}

interface Document {
  id: string;
  agent_id: string;
  file_name: string;
  file_size: number | null;
  file_type: string | null;
  storage_path: string | null;
  created_at: string;
}

interface ToolCallDebug {
  name: string;
  status: "success" | "failed";
  data: Record<string, string>;
  response: string;
  timestamp: string;
}

interface Message {
  id: string;
  role: "user" | "agent";
  text: string;
  type?: "no-key" | "tool-debug" | "limit-reached";
  provider?: string;
  model?: string;
  toolCall?: ToolCallDebug;
  limitData?: { current: number; limit: number };
}

function getModelLabel(modelValue: string): string {
  for (const group of modelGroups) {
    const m = group.models.find((m) => m.value === modelValue);
    if (m) return m.label;
  }
  return modelValue;
}

// ─── Tool debug card ──────────────────────────────────────────────────────────

function ToolDebugCard({ toolCall }: { toolCall: ToolCallDebug }) {
  const [open, setOpen] = useState(false);
  const succeeded = toolCall.status === "success";
  const time = new Date(toolCall.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div
      className="rounded-xl text-xs overflow-hidden"
      style={{ backgroundColor: "#1a2235", borderLeft: "3px solid rgba(59,91,252,0.5)" }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between px-3 py-2.5 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px]">🔧</span>
          <span className="text-white/40 font-medium uppercase tracking-wider text-[10px]">Tool Called</span>
          <span className="text-white/70 font-semibold truncate">{toolCall.name}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={
              succeeded
                ? { backgroundColor: "rgba(34,197,94,0.15)", color: "#4ade80" }
                : { backgroundColor: "rgba(239,68,68,0.15)", color: "#f87171" }
            }
          >
            {succeeded ? "Success" : "Failed"}
          </span>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 text-white/35 hover:text-white/65 transition-colors text-[10px] font-medium"
          >
            {open ? "Hide" : "Details"}
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none"
              className="transition-transform duration-200"
              style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
            >
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Collapsible details */}
      {open && (
        <div className="border-t border-white/5 px-3 py-2.5 flex flex-col gap-2">
          <div>
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1">Data sent</p>
            <pre
              className="text-[11px] text-white/60 leading-relaxed overflow-x-auto rounded-lg px-3 py-2"
              style={{ backgroundColor: "rgba(0,0,0,0.25)" }}
            >
              {JSON.stringify(toolCall.data, null, 2)}
            </pre>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1">Response</p>
            <p className="text-[11px] text-white/60 leading-relaxed">{toolCall.response}</p>
          </div>
          <p className="text-[10px] text-white/25">{time}</p>
        </div>
      )}
    </div>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-white/30"
          style={{ animation: `typing-bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
      <style>{`
        @keyframes typing-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.3; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── Chat panel ───────────────────────────────────────────────────────────────

interface ChatPanelProps {
  agentId: string;
  instructions: string;
  model: string;
  docCount: number;
  userId: string;
  onSwitchTab: (tab: Tab) => void;
}

function ChatPanel({ agentId, instructions, model, docCount, userId, onSwitchTab }: ChatPanelProps) {
  const [, navigate] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  function clearChat() {
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || isTyping) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    const provider = getProviderForModel(model);

    // Build conversation history in OpenAI format (all previous messages)
    const conversationHistory = messages.map((m) => ({
      role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
      content: m.text,
    }));

    // Do NOT fetch or send the API key from the frontend — the backend looks it up
    // server-side and decrypts it. We send the JWT so the backend can verify who
    // is making the request before looking up their stored API key.
    const { data: { session: chatSession } } = await supabase.auth.getSession();
    const chatHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (chatSession?.access_token) {
      chatHeaders["Authorization"] = `Bearer ${chatSession.access_token}`;
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: chatHeaders,
        body: JSON.stringify({
          message: text,
          instructions: instructions.trim() || "You are a helpful assistant.",
          model,
          provider,
          conversationHistory,
          agentId,
          userId,
        }),
      });

      const data = await res.json() as {
        reply?: string;
        toolCalls?: ToolCallDebug[];
        error?: string;
        current?: number;
        limit?: number;
      };

      if (!res.ok) {
        if (data.error === "NO_API_KEY") {
          setMessages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), role: "agent", type: "no-key", provider, model, text: "" },
          ]);
          setIsTyping(false);
          return;
        }
        if (data.error === "MESSAGE_LIMIT_REACHED") {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "agent",
              type: "limit-reached",
              text: "",
              limitData: { current: data.current ?? 0, limit: data.limit ?? 50 },
            },
          ]);
          setIsTyping(false);
          return;
        }
        throw new Error(data.error ?? "Request failed");
      }

      const newMessages: Message[] = [];

      const toolCalls = Array.isArray(data.toolCalls) ? data.toolCalls as ToolCallDebug[] : [];
      for (const tc of toolCalls) {
        newMessages.push({
          id: crypto.randomUUID(),
          role: "agent",
          type: "tool-debug",
          text: "",
          toolCall: tc,
        });
      }

      newMessages.push({
        id: crypto.randomUUID(),
        role: "agent",
        text: data.reply ?? "No response.",
      });

      setMessages((prev) => [...prev, ...newMessages]);
    } catch (err) {
      const errText = err instanceof Error ? err.message : "Error connecting to agent.";
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "agent", text: errText },
      ]);
    } finally {
      setIsTyping(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  const noInstructions = !instructions.trim();

  return (
    <>
    <UpgradeModal
      isOpen={showUpgradeModal}
      onClose={() => setShowUpgradeModal(false)}
      reason="message_limit"
    />
    <div
      className="flex-1 flex flex-col min-h-0 border-l border-white/5"
      style={{ backgroundColor: "#0d1117" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-medium text-white/40 uppercase tracking-wider">
            Test Your Agent
          </span>
          {docCount > 0 && (
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ backgroundColor: "rgba(59,91,252,0.15)", color: "#7b93ff" }}
            >
              📚 {docCount} {docCount === 1 ? "document" : "documents"} loaded
            </span>
          )}
        </div>
        <button
          onClick={clearChat}
          className="text-xs text-white/35 hover:text-white/65 border border-white/10 hover:border-white/20 px-2.5 py-1 rounded-md transition-all duration-150"
        >
          New Chat
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 flex flex-col gap-3">
        {noInstructions ? (
          <div className="flex-1 flex items-center justify-center text-center px-4">
            <p className="text-xs text-white/25 leading-relaxed">
              Add instructions in the Prompt tab and save before testing.
            </p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-white/20 text-center">Send a message to test your agent…</p>
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              // Tool debug card
              if (msg.type === "tool-debug" && msg.toolCall) {
                return (
                  <div key={msg.id} className="px-1">
                    <ToolDebugCard toolCall={msg.toolCall} />
                  </div>
                );
              }

              // Message limit reached banner
              if (msg.type === "limit-reached") {
                return (
                  <div key={msg.id} className="flex items-start gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: "rgba(251,191,36,0.2)" }}
                    >
                      ⚠️
                    </div>
                    <div
                      className="max-w-[85%] px-3.5 py-3 rounded-2xl text-sm leading-relaxed flex flex-col gap-2.5"
                      style={{
                        backgroundColor: "rgba(251,191,36,0.12)",
                        border: "1px solid rgba(251,191,36,0.25)",
                        borderBottomLeftRadius: "4px",
                      }}
                    >
                      <p className="text-amber-400 text-xs font-semibold">Monthly limit reached</p>
                      <p className="text-amber-200/80 text-xs leading-relaxed">
                        You have reached your {msg.limitData?.limit ?? 50} message limit for this month.
                        Upgrade your plan to continue chatting.
                      </p>
                      <button
                        onClick={() => setShowUpgradeModal(true)}
                        className="self-start text-xs font-semibold px-3 py-1.5 rounded-lg transition-all hover:opacity-90 active:scale-95"
                        style={{ backgroundColor: "rgba(251,191,36,0.25)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.35)" }}
                      >
                        Upgrade Plan →
                      </button>
                    </div>
                  </div>
                );
              }

              // Special "no API key" system message
              if (msg.type === "no-key") {
                return (
                  <div key={msg.id} className="flex items-start gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: "rgba(59,91,252,0.2)" }}
                    >
                      🤖
                    </div>
                    <div
                      className="max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed"
                      style={{ backgroundColor: "#1a2235", borderBottomLeftRadius: "4px" }}
                    >
                      <p className="text-amber-400/90 text-xs mb-1 font-medium">No API key found</p>
                      <p className="text-white/60 text-xs leading-relaxed">
                        <span className="text-white/80">{msg.model ? getModelLabel(msg.model) : "This model"}</span>
                        {" "}requires a{" "}
                        <span className="text-white/80 capitalize">{msg.provider}</span>
                        {" "}API key, but you haven't added one yet.
                      </p>
                      <div className="mt-2.5 flex flex-col gap-1.5">
                        <button
                          onClick={() => navigate("/settings")}
                          className="text-xs text-[#3b5bfc] hover:underline text-left"
                        >
                          → Add {msg.provider} key in Settings
                        </button>
                        <button
                          onClick={() => onSwitchTab("Prompt")}
                          className="text-xs text-white/40 hover:text-white/70 transition-colors text-left"
                        >
                          → Or switch to a different model in the Prompt tab
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={`flex items-end gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  {msg.role === "agent" && (
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 mb-0.5"
                      style={{ backgroundColor: "rgba(59,91,252,0.2)" }}
                    >
                      🤖
                    </div>
                  )}
                  <div
                    className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${msg.role === "user" ? "whitespace-pre-wrap" : ""}`}
                    style={
                      msg.role === "user"
                        ? { backgroundColor: "#3b5bfc", color: "#fff", borderBottomRightRadius: "4px" }
                        : { backgroundColor: "#1a2235", color: "rgba(255,255,255,0.85)", borderBottomLeftRadius: "4px" }
                    }
                  >
                    {msg.role === "agent"
                      ? <span className="md-content" dangerouslySetInnerHTML={{ __html: marked.parse(msg.text) as string }} />
                      : msg.text}
                  </div>
                </div>
              );
            })}

            {isTyping && (
              <div className="flex items-end gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0"
                  style={{ backgroundColor: "rgba(59,91,252,0.2)" }}
                >
                  🤖
                </div>
                <div className="rounded-2xl" style={{ backgroundColor: "#1a2235", borderBottomLeftRadius: "4px" }}>
                  <TypingDots />
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 flex-shrink-0 border-t border-white/5">
        <div
          className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 focus-within:border-[#3b5bfc]/50 transition-colors"
          style={{ backgroundColor: "#111827" }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
            disabled={noInstructions || isTyping}
            className="flex-1 bg-transparent text-sm text-white placeholder-white/20 outline-none disabled:opacity-40"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isTyping || noInstructions}
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-150 disabled:opacity-30"
            style={{ backgroundColor: input.trim() && !noInstructions ? "#3b5bfc" : "rgba(59,91,252,0.3)" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
    </>
  );
}

// ─── Deploy modal ─────────────────────────────────────────────────────────────

type DeployTab = "socials" | "code" | "website";

interface DeployModalProps {
  agentId: string;
  agentName: string;
  userId: string;
  onClose: () => void;
}

function DeployModal({ agentId, agentName, userId, onClose }: DeployModalProps) {
  const [tab, setTab] = useState<DeployTab>("socials");
  const [codeLang, setCodeLang] = useState<"python" | "javascript">("python");
  const [codeCopied, setCodeCopied] = useState(false);

  // Website tab state
  const [widgetName, setWidgetName] = useState(agentName);
  const [widgetDesc, setWidgetDesc] = useState("");
  const [widgetColor, setWidgetColor] = useState("#3b5bfc");
  const [startingMsg, setStartingMsg] = useState("Hi! How can I help you?");
  const [starters, setStarters] = useState<string[]>([""]);
  const [widgetSize, setWidgetSize] = useState<"regular" | "large">("regular");
  const colorInputRef = useRef<HTMLInputElement>(null);

  // Deployment save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [embedCode, setEmbedCode] = useState<string | null>(null);
  const [embedCopied, setEmbedCopied] = useState(false);

  // ── Telegram deployment state ──────────────────────────────────────────────
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [tgBotToken, setTgBotToken] = useState("");
  const [tgBotUsername, setTgBotUsername] = useState("");
  const [tgConnecting, setTgConnecting] = useState(false);
  const [tgError, setTgError] = useState("");
  const [tgDeployment, setTgDeployment] = useState<{ bot_username: string | null } | null>(null);
  const [tgLoadingDeployment, setTgLoadingDeployment] = useState(true);
  const [tgDisconnecting, setTgDisconnecting] = useState(false);

  // ── WhatsApp deployment state ───────────────────────────────────────────────
  const [waOpen, setWaOpen] = useState(false);
  const [waPhoneNumberId, setWaPhoneNumberId] = useState("");
  const [waAccessToken, setWaAccessToken] = useState("");
  const [waVerifyToken, setWaVerifyToken] = useState("");
  const [waDisplayName, setWaDisplayName] = useState("");
  const [waAppSecret, setWaAppSecret] = useState("");
  const [waConnecting, setWaConnecting] = useState(false);
  const [waDisconnecting, setWaDisconnecting] = useState(false);
  const [waError, setWaError] = useState("");
  const [waDeployment, setWaDeployment] = useState<{ phone_number_id: string; display_name: string | null } | null>(null);
  const [waLoadingDeployment, setWaLoadingDeployment] = useState(true);

  // ── Messenger deployment state ──────────────────────────────────────────────
  const [msgrOpen, setMsgrOpen] = useState(false);
  const [msgrPageId, setMsgrPageId] = useState("");
  const [msgrPageName, setMsgrPageName] = useState("");
  const [msgrAccessToken, setMsgrAccessToken] = useState("");
  const [msgrVerifyToken, setMsgrVerifyToken] = useState("");
  const [msgrAppSecret, setMsgrAppSecret] = useState("");
  const [msgrConnecting, setMsgrConnecting] = useState(false);
  const [msgrDisconnecting, setMsgrDisconnecting] = useState(false);
  const [msgrError, setMsgrError] = useState("");
  const [msgrDeployment, setMsgrDeployment] = useState<{ page_id: string; page_name: string | null } | null>(null);
  const [msgrLoadingDeployment, setMsgrLoadingDeployment] = useState(true);

  // ── Instagram deployment state ──────────────────────────────────────────────
  const [igOpen, setIgOpen] = useState(false);
  const [igAccountId, setIgAccountId] = useState("");
  const [igUsername, setIgUsername] = useState("");
  const [igAccessToken, setIgAccessToken] = useState("");
  const [igVerifyToken, setIgVerifyToken] = useState("");
  const [igAppSecret, setIgAppSecret] = useState("");
  const [igConnecting, setIgConnecting] = useState(false);
  const [igDisconnecting, setIgDisconnecting] = useState(false);
  const [igError, setIgError] = useState("");
  const [igDeployment, setIgDeployment] = useState<{ ig_account_id: string; ig_username: string | null } | null>(null);
  const [igLoadingDeployment, setIgLoadingDeployment] = useState(true);

  useEffect(() => {
    fetch(`/api/telegram/deployment/${agentId}`)
      .then((r) => r.json())
      .then((d: { deployment: { bot_username: string | null } | null }) => {
        setTgDeployment(d.deployment ?? null);
      })
      .catch(() => {})
      .finally(() => setTgLoadingDeployment(false));

    fetch(`/api/whatsapp/deployment/${agentId}`)
      .then((r) => r.json())
      .then((d: { deployment: { phone_number_id: string; display_name: string | null } | null }) => {
        setWaDeployment(d.deployment ?? null);
      })
      .catch(() => {})
      .finally(() => setWaLoadingDeployment(false));

    fetch(`/api/messenger/deployment/${agentId}`)
      .then((r) => r.json())
      .then((d: { deployment: { page_id: string; page_name: string | null } | null }) => {
        setMsgrDeployment(d.deployment ?? null);
      })
      .catch(() => {})
      .finally(() => setMsgrLoadingDeployment(false));

    fetch(`/api/instagram/deployment/${agentId}`)
      .then((r) => r.json())
      .then((d: { deployment: { ig_account_id: string; ig_username: string | null } | null }) => {
        setIgDeployment(d.deployment ?? null);
      })
      .catch(() => {})
      .finally(() => setIgLoadingDeployment(false));
  }, [agentId]);

  const apiUrl = `${window.location.origin}/api/chat`;

  const pythonCode = `import requests

response = requests.post(
    "${apiUrl}",
    json={
        "message": "Hello",
        "agentId": "${agentId}"
    }
)
print(response.json()["reply"])`;

  const jsCode = `const response = await fetch("${apiUrl}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message: "Hello",
    agentId: "${agentId}"
  })
});
const data = await response.json();
console.log(data.reply);`;

  const activeCode = codeLang === "python" ? pythonCode : jsCode;

  function handleCopyCode() {
    void navigator.clipboard.writeText(activeCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  function addStarter() {
    if (starters.length < 3) setStarters((p) => [...p, ""]);
  }
  function updateStarter(i: number, val: string) {
    setStarters((p) => p.map((s, idx) => (idx === i ? val : s)));
  }
  function removeStarter(i: number) {
    setStarters((p) => p.filter((_, idx) => idx !== i));
  }

  async function handleCreateDeployment() {
    setSaveError("");
    setSaving(true);
    try {
      const { error } = await supabase.from("widget_deployments").insert({
        agent_id: agentId,
        user_id: userId,
        widget_name: widgetName.trim() || agentName,
        description: widgetDesc.trim() || null,
        color: widgetColor,
        starting_message: startingMsg.trim(),
        conversation_starters: starters.filter((s) => s.trim()),
        size: widgetSize,
      });
      if (error) throw error;

      const origin = window.location.origin;
      const code = `<script>\n  window.EverydayAI = {\n    agentId: "${agentId}",\n    color: "${widgetColor}",\n    size: "${widgetSize}",\n    startingMessage: "${startingMsg.replace(/"/g, '\\"')}"\n  };\n<\/script>\n<script src="${origin}/widget.js"><\/script>`;
      setEmbedCode(code);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleCopyEmbed() {
    if (!embedCode) return;
    void navigator.clipboard.writeText(embedCode);
    setEmbedCopied(true);
    setTimeout(() => setEmbedCopied(false), 2000);
  }

  async function handleConnectTelegram() {
    setTgConnecting(true);
    setTgError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated. Please log in again.");
      const webhookUrl = `${window.location.origin}/api/telegram/webhook/${agentId}`;
      const res = await fetch("/api/telegram/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          botToken: tgBotToken.trim(),
          botUsername: tgBotUsername.trim(),
          agentId,
          userId,
          webhookUrl,
        }),
      });
      const data = await res.json() as { error?: string; deployment?: { bot_username: string | null } };
      if (!res.ok) throw new Error(data.error ?? "Failed to connect bot");
      setTgDeployment(data.deployment ?? { bot_username: tgBotUsername.trim() || null });
      setTelegramOpen(false);
      setTgBotToken("");
      setTgBotUsername("");
    } catch (err) {
      setTgError(err instanceof Error ? err.message : "Failed to connect bot");
    } finally {
      setTgConnecting(false);
    }
  }

  async function handleDisconnectTelegram() {
    setTgDisconnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`/api/telegram/deployment/${agentId}`, {
        method: "DELETE",
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      setTgDeployment(null);
      setTelegramOpen(false);
    } catch {
      // silent — state still cleared
    } finally {
      setTgDisconnecting(false);
    }
  }

  async function handleConnectWhatsApp() {
    setWaConnecting(true);
    setWaError("");
    try {
      const { data: { session: waSess } } = await supabase.auth.getSession();
      if (!waSess?.access_token) throw new Error("Not authenticated. Please log in again.");
      const res = await fetch("/api/whatsapp/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${waSess.access_token}` },
        body: JSON.stringify({
          agentId,
          phoneNumberId: waPhoneNumberId.trim(),
          accessToken:   waAccessToken.trim(),
          verifyToken:   waVerifyToken.trim(),
          displayName:   waDisplayName.trim() || null,
          appSecret:     waAppSecret.trim() || null,
        }),
      });
      const data = await res.json() as { error?: string; deployment?: { phone_number_id: string; display_name: string | null } };
      if (!res.ok) throw new Error(data.error ?? "Failed to connect WhatsApp");
      setWaDeployment(data.deployment ?? { phone_number_id: waPhoneNumberId.trim(), display_name: waDisplayName.trim() || null });
      setWaOpen(false);
      setWaPhoneNumberId("");
      setWaAccessToken("");
      setWaVerifyToken("");
      setWaDisplayName("");
      setWaAppSecret("");
    } catch (err) {
      setWaError(err instanceof Error ? err.message : "Failed to connect WhatsApp");
    } finally {
      setWaConnecting(false);
    }
  }

  async function handleDisconnectWhatsApp() {
    setWaDisconnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`/api/whatsapp/deployment/${agentId}`, {
        method: "DELETE",
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      setWaDeployment(null);
      setWaOpen(false);
    } catch {
      // silent — state still cleared
    } finally {
      setWaDisconnecting(false);
    }
  }

  async function handleConnectMessenger() {
    setMsgrConnecting(true);
    setMsgrError("");
    try {
      const { data: { session: msgrSess } } = await supabase.auth.getSession();
      if (!msgrSess?.access_token) throw new Error("Not authenticated. Please log in again.");
      const res = await fetch("/api/messenger/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${msgrSess.access_token}` },
        body: JSON.stringify({
          agentId,
          pageId:      msgrPageId.trim(),
          pageName:    msgrPageName.trim() || null,
          accessToken: msgrAccessToken.trim(),
          verifyToken: msgrVerifyToken.trim(),
          appSecret:   msgrAppSecret.trim() || null,
        }),
      });
      const data = await res.json() as { error?: string; deployment?: { page_id: string; page_name: string | null } };
      if (!res.ok) throw new Error(data.error ?? "Failed to connect Messenger");
      setMsgrDeployment(data.deployment ?? { page_id: msgrPageId.trim(), page_name: msgrPageName.trim() || null });
      setMsgrOpen(false);
      setMsgrPageId(""); setMsgrPageName(""); setMsgrAccessToken(""); setMsgrVerifyToken(""); setMsgrAppSecret("");
    } catch (err) {
      setMsgrError(err instanceof Error ? err.message : "Failed to connect Messenger");
    } finally {
      setMsgrConnecting(false);
    }
  }

  async function handleDisconnectMessenger() {
    setMsgrDisconnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`/api/messenger/deployment/${agentId}`, {
        method: "DELETE",
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      setMsgrDeployment(null);
      setMsgrOpen(false);
    } catch {
      // silent — state still cleared
    } finally {
      setMsgrDisconnecting(false);
    }
  }

  async function handleConnectInstagram() {
    setIgConnecting(true);
    setIgError("");
    try {
      const { data: { session: igSess } } = await supabase.auth.getSession();
      if (!igSess?.access_token) throw new Error("Not authenticated. Please log in again.");
      const res = await fetch("/api/instagram/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${igSess.access_token}` },
        body: JSON.stringify({
          agentId,
          igAccountId: igAccountId.trim(),
          igUsername:  igUsername.trim() || null,
          accessToken: igAccessToken.trim(),
          verifyToken: igVerifyToken.trim(),
          appSecret:   igAppSecret.trim() || null,
        }),
      });
      const data = await res.json() as { error?: string; deployment?: { ig_account_id: string; ig_username: string | null } };
      if (!res.ok) throw new Error(data.error ?? "Failed to connect Instagram");
      setIgDeployment(data.deployment ?? { ig_account_id: igAccountId.trim(), ig_username: igUsername.trim() || null });
      setIgOpen(false);
      setIgAccountId(""); setIgUsername(""); setIgAccessToken(""); setIgVerifyToken(""); setIgAppSecret("");
    } catch (err) {
      setIgError(err instanceof Error ? err.message : "Failed to connect Instagram");
    } finally {
      setIgConnecting(false);
    }
  }

  async function handleDisconnectInstagram() {
    setIgDisconnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`/api/instagram/deployment/${agentId}`, {
        method: "DELETE",
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      setIgDeployment(null);
      setIgOpen(false);
    } catch {
      // silent — state still cleared
    } finally {
      setIgDisconnecting(false);
    }
  }

  const tabs: { id: DeployTab; label: string }[] = [
    { id: "socials", label: "Socials" },
    { id: "code",    label: "Custom Code" },
    { id: "website", label: "Website" },
  ];

  const socials = [
    {
      id: "whatsapp",
      name: "WhatsApp",
      desc: "Deploy to any WhatsApp number",
      btnLabel: "Connect WhatsApp",
      soon: false,
      icon: (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.974-1.404A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" fill="#25D366"/>
          <path d="M9.04 7.4c-.2-.44-.41-.45-.6-.46H7.8c-.2 0-.52.07-.79.37S6 8.36 6 9.55c0 1.18.86 2.33 .98 2.49.12.17 1.66 2.65 4.09 3.6 2.02.8 2.43.64 2.87.6.43-.04 1.4-.57 1.6-1.12.2-.55.2-1.02.14-1.12-.06-.1-.22-.16-.46-.28-.24-.12-1.4-.69-1.61-.77-.22-.08-.38-.12-.54.12-.16.24-.62.77-.76.93-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.92-1.18-.71-.63-1.19-1.41-1.33-1.65-.14-.24-.01-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78z" fill="#fff"/>
        </svg>
      ),
    },
    {
      id: "telegram",
      name: "Telegram",
      desc: "Deploy to your Telegram bot",
      btnLabel: "Connect Telegram",
      soon: false,
      icon: (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="#229ED9"/>
          <path d="M17.5 7.5L5.5 12l4 1.5 1.5 4 2.5-3 3.5 2.5 1-9.5z" fill="#fff"/>
          <path d="M9.5 13.5l.5 3.5 2-2.5" fill="#d6e4f0"/>
        </svg>
      ),
    },
    {
      id: "messenger",
      name: "Facebook Messenger",
      desc: "Deploy to your Facebook page",
      btnLabel: "Connect Messenger",
      soon: false,
      icon: (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="url(#msgGrad)"/>
          <defs>
            <linearGradient id="msgGrad" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0078FF"/>
              <stop offset="1" stopColor="#A033FF"/>
            </linearGradient>
          </defs>
          <path d="M12 6C8.686 6 6 8.507 6 11.6c0 1.613.7 3.056 1.824 4.07V17.5l1.79-1.006A6.292 6.292 0 0012 16.8c3.314 0 6-2.507 6-5.6S15.314 6 12 6zm.65 7.54l-1.53-1.63-2.99 1.63 3.29-3.49 1.57 1.63 2.95-1.63-3.29 3.49z" fill="#fff"/>
        </svg>
      ),
    },
    {
      id: "instagram",
      name: "Instagram",
      desc: "Automate Instagram DMs",
      btnLabel: "Connect Instagram",
      soon: false,
      icon: (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <rect width="20" height="20" x="2" y="2" rx="5.5" fill="url(#igGrad)"/>
          <defs>
            <radialGradient id="igGrad" cx="30%" cy="107%" r="150%">
              <stop offset="0%" stopColor="#fdf497"/>
              <stop offset="10%" stopColor="#fdf497"/>
              <stop offset="50%" stopColor="#fd5949"/>
              <stop offset="68%" stopColor="#d6249f"/>
              <stop offset="100%" stopColor="#285AEB"/>
            </radialGradient>
          </defs>
          <circle cx="12" cy="12" r="3.5" stroke="#fff" strokeWidth="1.8" fill="none"/>
          <circle cx="17" cy="7" r="1" fill="#fff"/>
          <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="#fff" strokeWidth="1.5" fill="none"/>
        </svg>
      ),
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.70)", backdropFilter: "blur(3px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-white/10 flex flex-col overflow-hidden"
        style={{ backgroundColor: "#111827", fontFamily: "'Inter', sans-serif", maxHeight: "90vh" }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 pt-6 pb-0 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">Deploy Agent</h2>
            <p className="text-xs text-white/40 mt-0.5">Choose how to distribute your agent</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-all text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* ── Tab bar ── */}
        <div className="flex gap-1 px-6 pt-5 pb-0 flex-shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150"
              style={
                tab === t.id
                  ? { backgroundColor: "rgba(59,91,252,0.18)", color: "#818cf8" }
                  : { color: "rgba(255,255,255,0.4)" }
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Divider ── */}
        <div className="mx-6 mt-4 border-t border-white/6 flex-shrink-0" />

        {/* ── Tab content ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* TAB 1: Socials */}
          {tab === "socials" && (
            <div className="flex flex-col gap-3">
              {socials.map((s) => {
                if (s.id === "whatsapp") {
                  return (
                    <div
                      key={s.id}
                      className="flex flex-col rounded-xl border border-white/6 overflow-hidden transition-all duration-150"
                      style={{
                        backgroundColor: "#0d1117",
                        borderColor: waDeployment ? "rgba(74,222,128,0.2)" : undefined,
                      }}
                    >
                      {/* Header row */}
                      <div className="flex items-center gap-4 px-4 py-4">
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
                        >
                          {s.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-white">{s.name}</p>
                            {waDeployment && (
                              <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: "rgba(74,222,128,0.12)", color: "#4ade80" }}
                              >
                                Connected
                              </span>
                            )}
                          </div>

                        </div>

                        {/* Right-side action */}
                        {waLoadingDeployment ? (
                          <div className="w-5 h-5 border-2 border-white/20 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        ) : waDeployment ? (
                          <button
                            onClick={() => void handleDisconnectWhatsApp()}
                            disabled={waDisconnecting}
                            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                            style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#f87171" }}
                          >
                            {waDisconnecting ? "Disconnecting…" : "Disconnect"}
                          </button>
                        ) : !waOpen ? (
                          <button
                            onClick={() => setWaOpen(true)}
                            className="flex-shrink-0 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
                            style={{ backgroundColor: "#3b5bfc" }}
                          >
                            Connect
                          </button>
                        ) : (
                          <button
                            onClick={() => { setWaOpen(false); setWaError(""); setWaPhoneNumberId(""); setWaAccessToken(""); setWaVerifyToken(""); setWaDisplayName(""); }}
                            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/8 transition-all"
                            style={{ color: "rgba(255,255,255,0.4)" }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>

                      {/* Connected info bar */}
                      {waDeployment && (
                        <div className="px-4 pb-4 pt-0">
                          <div
                            className="flex flex-col gap-1.5 rounded-xl px-3 py-2.5 border border-white/5"
                            style={{ backgroundColor: "rgba(74,222,128,0.04)" }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-white/40">Phone Number ID:</span>
                              <span className="text-xs font-mono text-white/70">{waDeployment.phone_number_id}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-white/40">Webhook URL:</span>
                              <span className="text-[11px] font-mono break-all" style={{ color: "#4ade80" }}>
                                {window.location.origin}/api/whatsapp/webhook/{agentId}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Setup form */}
                      {waOpen && !waDeployment && (
                        <div className="px-4 pb-5 pt-0 flex flex-col gap-3 border-t border-white/5">
                          <div className="pt-4">
                            <h3 className="text-sm font-semibold text-white mb-1.5">Connect WhatsApp Business</h3>
                            <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                              1. Go to{" "}
                              <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="underline text-white/60">
                                developers.facebook.com
                              </a>{" "}
                              → your app → WhatsApp → API Setup
                              <br />
                              2. Copy your <span className="text-white/70 font-medium">Phone Number ID</span> and a{" "}
                              <span className="text-white/70 font-medium">Permanent Access Token</span>
                              <br />
                              3. Set your webhook URL in Meta to:{" "}
                              <span className="font-mono text-white/60 break-all">
                                {window.location.origin}/api/whatsapp/webhook/{agentId}
                              </span>
                            </p>
                          </div>
                          <div className="flex flex-col gap-2">
                            {[
                              { label: "Phone Number ID", value: waPhoneNumberId, setter: setWaPhoneNumberId, placeholder: "123456789012345", type: "text" },
                              { label: "Access Token", value: waAccessToken, setter: setWaAccessToken, placeholder: "EAAxxxxxxxxxx…", type: "password" },
                              { label: "Verify Token (choose your own)", value: waVerifyToken, setter: setWaVerifyToken, placeholder: "my-secret-verify-token", type: "text" },
                              { label: "Display Name (optional)", value: waDisplayName, setter: setWaDisplayName, placeholder: "+234 802 123 4567", type: "text" },
                              { label: "App Secret (recommended — enables webhook signature verification)", value: waAppSecret, setter: setWaAppSecret, placeholder: "From App Dashboard → App Settings → Basic", type: "password" },
                            ].map(({ label, value, setter, placeholder, type }) => (
                              <div key={label} className="flex flex-col gap-1">
                                <label className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>
                                  {label}
                                </label>
                                <input
                                  type={type}
                                  value={value}
                                  onChange={(e) => setter(e.target.value)}
                                  placeholder={placeholder}
                                  className="rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/20 outline-none border border-white/8 focus:border-[#3b5bfc]/60 transition-colors"
                                  style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                                />
                              </div>
                            ))}
                          </div>
                          {waError && (
                            <p className="text-xs px-1" style={{ color: "#f87171" }}>{waError}</p>
                          )}
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => void handleConnectWhatsApp()}
                              disabled={waConnecting || !waPhoneNumberId.trim() || !waAccessToken.trim() || !waVerifyToken.trim()}
                              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{ backgroundColor: "#25D366" }}
                            >
                              {waConnecting ? "Connecting…" : "Connect WhatsApp"}
                            </button>
                            <button
                              onClick={() => { setWaOpen(false); setWaError(""); setWaPhoneNumberId(""); setWaAccessToken(""); setWaVerifyToken(""); setWaDisplayName(""); }}
                              className="px-4 py-2.5 rounded-xl text-sm font-medium border border-white/8 transition-all"
                              style={{ color: "rgba(255,255,255,0.4)" }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                if (s.id === "telegram") {
                  return (
                    <div
                      key={s.id}
                      className="flex flex-col rounded-xl border border-white/6 overflow-hidden transition-all duration-150"
                      style={{
                        backgroundColor: "#0d1117",
                        borderColor: tgDeployment ? "rgba(74,222,128,0.2)" : undefined,
                      }}
                    >
                      {/* Header row */}
                      <div className="flex items-center gap-4 px-4 py-4">
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
                        >
                          {s.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-white">{s.name}</p>
                            {tgDeployment && (
                              <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: "rgba(74,222,128,0.12)", color: "#4ade80" }}
                              >
                                Connected
                              </span>
                            )}
                          </div>

                        </div>

                        {/* Right-side action */}
                        {tgLoadingDeployment ? (
                          <div className="w-5 h-5 border-2 border-white/20 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        ) : tgDeployment ? (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {tgDeployment.bot_username && (
                              <a
                                href={`https://t.me/${tgDeployment.bot_username}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 hover:border-white/20 transition-all"
                                style={{ color: "rgba(255,255,255,0.6)" }}
                              >
                                Test Bot
                              </a>
                            )}
                            <button
                              onClick={() => void handleDisconnectTelegram()}
                              disabled={tgDisconnecting}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                              style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#f87171" }}
                            >
                              {tgDisconnecting ? "Disconnecting…" : "Disconnect"}
                            </button>
                          </div>
                        ) : !telegramOpen ? (
                          <button
                            onClick={() => setTelegramOpen(true)}
                            className="flex-shrink-0 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
                            style={{ backgroundColor: "#3b5bfc" }}
                          >
                            Connect
                          </button>
                        ) : (
                          <button
                            onClick={() => { setTelegramOpen(false); setTgError(""); setTgBotToken(""); setTgBotUsername(""); }}
                            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/8 transition-all"
                            style={{ color: "rgba(255,255,255,0.4)" }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>

                      {/* Connected info bar */}
                      {tgDeployment?.bot_username && (
                        <div className="px-4 pb-4 pt-0">
                          <div
                            className="flex items-center gap-2 rounded-xl px-3 py-2.5 border border-white/5"
                            style={{ backgroundColor: "rgba(74,222,128,0.04)" }}
                          >
                            <span className="text-xs text-white/40">Bot:</span>
                            <a
                              href={`https://t.me/${tgDeployment.bot_username}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-semibold hover:underline"
                              style={{ color: "#4ade80" }}
                            >
                              @{tgDeployment.bot_username}
                            </a>
                          </div>
                        </div>
                      )}

                      {/* Setup form */}
                      {telegramOpen && !tgDeployment && (
                        <div className="px-4 pb-5 pt-0 flex flex-col gap-3 border-t border-white/5">
                          <div className="pt-4">
                            <h3 className="text-sm font-semibold text-white mb-1.5">Deploy to Telegram</h3>
                            <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                              1. Open Telegram and search{" "}
                              <span className="text-white/70 font-medium">@BotFather</span>
                              <br />
                              2. Send <span className="text-white/70 font-mono">/newbot</span> and follow the steps
                              <br />
                              3. Copy your bot token and paste below
                            </p>
                          </div>
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>
                                Bot Token
                              </label>
                              <input
                                type="text"
                                value={tgBotToken}
                                onChange={(e) => setTgBotToken(e.target.value)}
                                placeholder="1234567890:ABCdef..."
                                className="rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/20 outline-none border border-white/8 focus:border-[#3b5bfc]/60 transition-colors"
                                style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>
                                Bot Username
                              </label>
                              <input
                                type="text"
                                value={tgBotUsername}
                                onChange={(e) => setTgBotUsername(e.target.value)}
                                placeholder="my_business_bot"
                                className="rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/20 outline-none border border-white/8 focus:border-[#3b5bfc]/60 transition-colors"
                                style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                              />
                            </div>
                          </div>
                          {tgError && (
                            <p className="text-xs px-1" style={{ color: "#f87171" }}>{tgError}</p>
                          )}
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => void handleConnectTelegram()}
                              disabled={tgConnecting || !tgBotToken.trim()}
                              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{ backgroundColor: "#3b5bfc" }}
                            >
                              {tgConnecting ? "Connecting…" : "Connect Bot"}
                            </button>
                            <button
                              onClick={() => { setTelegramOpen(false); setTgError(""); setTgBotToken(""); setTgBotUsername(""); }}
                              className="px-4 py-2.5 rounded-xl text-sm font-medium border border-white/8 transition-all"
                              style={{ color: "rgba(255,255,255,0.4)" }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                if (s.id === "messenger") {
                  return (
                    <div
                      key={s.id}
                      className="flex flex-col rounded-xl border border-white/6 overflow-hidden transition-all duration-150"
                      style={{
                        backgroundColor: "#0d1117",
                        borderColor: msgrDeployment ? "rgba(74,222,128,0.2)" : undefined,
                      }}
                    >
                      <div className="flex items-center gap-4 px-4 py-4">
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
                          {s.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-white">{s.name}</p>
                            {msgrDeployment && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(74,222,128,0.12)", color: "#4ade80" }}>
                                Connected
                              </span>
                            )}
                          </div>

                        </div>
                        {msgrLoadingDeployment ? (
                          <div className="w-5 h-5 border-2 border-white/20 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        ) : msgrDeployment ? (
                          <button onClick={() => void handleDisconnectMessenger()} disabled={msgrDisconnecting}
                            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                            style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#f87171" }}>
                            {msgrDisconnecting ? "Disconnecting…" : "Disconnect"}
                          </button>
                        ) : !msgrOpen ? (
                          <button onClick={() => setMsgrOpen(true)}
                            className="flex-shrink-0 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                            style={{ backgroundColor: "#3b5bfc" }}>
                            Connect
                          </button>
                        ) : (
                          <button onClick={() => { setMsgrOpen(false); setMsgrError(""); setMsgrPageId(""); setMsgrPageName(""); setMsgrAccessToken(""); setMsgrVerifyToken(""); }}
                            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/8 transition-all"
                            style={{ color: "rgba(255,255,255,0.4)" }}>
                            Cancel
                          </button>
                        )}
                      </div>
                      {msgrDeployment && (
                        <div className="px-4 pb-4 pt-0">
                          <div className="flex flex-col gap-1.5 rounded-xl px-3 py-2.5 border border-white/5" style={{ backgroundColor: "rgba(74,222,128,0.04)" }}>
                            {msgrDeployment.page_name && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-white/40">Page:</span>
                                <span className="text-xs font-medium text-white/70">{msgrDeployment.page_name}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-white/40">Webhook URL:</span>
                              <span className="text-[11px] font-mono break-all" style={{ color: "#4ade80" }}>
                                {window.location.origin}/api/messenger/webhook/{agentId}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      {msgrOpen && !msgrDeployment && (
                        <div className="px-4 pb-5 pt-0 flex flex-col gap-3 border-t border-white/5">
                          <div className="pt-4">
                            <h3 className="text-sm font-semibold text-white mb-1.5">Connect Facebook Messenger</h3>
                            <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                              1. Go to{" "}<a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="underline text-white/60">developers.facebook.com</a>{" "}→ your app → Messenger → Settings
                              <br />2. Under <span className="text-white/70 font-medium">Access Tokens</span>, generate a token for your Facebook Page
                              <br />3. Set your Webhook URL to:{" "}
                              <span className="font-mono text-white/60 break-all">{window.location.origin}/api/messenger/webhook/{agentId}</span>
                              <br />4. Subscribe to <span className="text-white/70 font-medium">messages</span> events
                            </p>
                          </div>
                          <div className="flex flex-col gap-2">
                            {[
                              { label: "Facebook Page ID", value: msgrPageId, setter: setMsgrPageId, placeholder: "123456789012345", type: "text" },
                              { label: "Page Name (optional)", value: msgrPageName, setter: setMsgrPageName, placeholder: "My Business Page", type: "text" },
                              { label: "Page Access Token", value: msgrAccessToken, setter: setMsgrAccessToken, placeholder: "EAAxxxxxxxxxx…", type: "password" },
                              { label: "Verify Token (choose your own)", value: msgrVerifyToken, setter: setMsgrVerifyToken, placeholder: "my-messenger-token", type: "text" },
                              { label: "App Secret (recommended — enables webhook signature verification)", value: msgrAppSecret, setter: setMsgrAppSecret, placeholder: "From App Dashboard → App Settings → Basic", type: "password" },
                            ].map(({ label, value, setter, placeholder, type }) => (
                              <div key={label} className="flex flex-col gap-1">
                                <label className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</label>
                                <input type={type} value={value} onChange={e => setter(e.target.value)} placeholder={placeholder}
                                  className="rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/20 outline-none border border-white/8 focus:border-[#3b5bfc]/60 transition-colors"
                                  style={{ backgroundColor: "rgba(255,255,255,0.04)" }} />
                              </div>
                            ))}
                          </div>
                          {msgrError && <p className="text-xs px-1" style={{ color: "#f87171" }}>{msgrError}</p>}
                          <div className="flex gap-2 pt-1">
                            <button onClick={() => void handleConnectMessenger()}
                              disabled={msgrConnecting || !msgrPageId.trim() || !msgrAccessToken.trim() || !msgrVerifyToken.trim()}
                              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{ backgroundColor: "#0078FF" }}>
                              {msgrConnecting ? "Connecting…" : "Connect Messenger"}
                            </button>
                            <button onClick={() => { setMsgrOpen(false); setMsgrError(""); setMsgrPageId(""); setMsgrPageName(""); setMsgrAccessToken(""); setMsgrVerifyToken(""); }}
                              className="px-4 py-2.5 rounded-xl text-sm font-medium border border-white/8 transition-all"
                              style={{ color: "rgba(255,255,255,0.4)" }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                if (s.id === "instagram") {
                  return (
                    <div
                      key={s.id}
                      className="flex flex-col rounded-xl border border-white/6 overflow-hidden transition-all duration-150"
                      style={{
                        backgroundColor: "#0d1117",
                        borderColor: igDeployment ? "rgba(74,222,128,0.2)" : undefined,
                      }}
                    >
                      <div className="flex items-center gap-4 px-4 py-4">
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
                          {s.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-white">{s.name}</p>
                            {igDeployment && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(74,222,128,0.12)", color: "#4ade80" }}>
                                Connected
                              </span>
                            )}
                          </div>

                        </div>
                        {igLoadingDeployment ? (
                          <div className="w-5 h-5 border-2 border-white/20 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        ) : igDeployment ? (
                          <button onClick={() => void handleDisconnectInstagram()} disabled={igDisconnecting}
                            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                            style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#f87171" }}>
                            {igDisconnecting ? "Disconnecting…" : "Disconnect"}
                          </button>
                        ) : !igOpen ? (
                          <button onClick={() => setIgOpen(true)}
                            className="flex-shrink-0 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                            style={{ backgroundColor: "#3b5bfc" }}>
                            Connect
                          </button>
                        ) : (
                          <button onClick={() => { setIgOpen(false); setIgError(""); setIgAccountId(""); setIgUsername(""); setIgAccessToken(""); setIgVerifyToken(""); }}
                            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/8 transition-all"
                            style={{ color: "rgba(255,255,255,0.4)" }}>
                            Cancel
                          </button>
                        )}
                      </div>
                      {igDeployment && (
                        <div className="px-4 pb-4 pt-0">
                          <div className="flex flex-col gap-1.5 rounded-xl px-3 py-2.5 border border-white/5" style={{ backgroundColor: "rgba(74,222,128,0.04)" }}>
                            {igDeployment.ig_username && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-white/40">Account:</span>
                                <span className="text-xs font-medium text-white/70">@{igDeployment.ig_username}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-white/40">Webhook URL:</span>
                              <span className="text-[11px] font-mono break-all" style={{ color: "#4ade80" }}>
                                {window.location.origin}/api/instagram/webhook/{agentId}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      {igOpen && !igDeployment && (
                        <div className="px-4 pb-5 pt-0 flex flex-col gap-3 border-t border-white/5">
                          <div className="pt-4">
                            <h3 className="text-sm font-semibold text-white mb-1.5">Connect Instagram DMs</h3>
                            <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                              1. Connect your Instagram Professional account to a Facebook Page
                              <br />2. Go to{" "}<a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="underline text-white/60">developers.facebook.com</a>{" "}→ your app → Instagram → Settings
                              <br />3. Generate a <span className="text-white/70 font-medium">Page Access Token</span> with <span className="font-mono text-white/60">instagram_manage_messages</span> permission
                              <br />4. Set your Webhook URL to:{" "}
                              <span className="font-mono text-white/60 break-all">{window.location.origin}/api/instagram/webhook/{agentId}</span>
                              <br />5. Subscribe to <span className="text-white/70 font-medium">messages</span> events
                            </p>
                          </div>
                          <div className="flex flex-col gap-2">
                            {[
                              { label: "Instagram Account ID", value: igAccountId, setter: setIgAccountId, placeholder: "17841400000000000", type: "text" },
                              { label: "Instagram Username (optional)", value: igUsername, setter: setIgUsername, placeholder: "mybusiness", type: "text" },
                              { label: "Page Access Token", value: igAccessToken, setter: setIgAccessToken, placeholder: "EAAxxxxxxxxxx…", type: "password" },
                              { label: "Verify Token (choose your own)", value: igVerifyToken, setter: setIgVerifyToken, placeholder: "my-instagram-token", type: "text" },
                              { label: "App Secret (recommended — enables webhook signature verification)", value: igAppSecret, setter: setIgAppSecret, placeholder: "From App Dashboard → App Settings → Basic", type: "password" },
                            ].map(({ label, value, setter, placeholder, type }) => (
                              <div key={label} className="flex flex-col gap-1">
                                <label className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</label>
                                <input type={type} value={value} onChange={e => setter(e.target.value)} placeholder={placeholder}
                                  className="rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/20 outline-none border border-white/8 focus:border-[#3b5bfc]/60 transition-colors"
                                  style={{ backgroundColor: "rgba(255,255,255,0.04)" }} />
                              </div>
                            ))}
                          </div>
                          {igError && <p className="text-xs px-1" style={{ color: "#f87171" }}>{igError}</p>}
                          <div className="flex gap-2 pt-1">
                            <button onClick={() => void handleConnectInstagram()}
                              disabled={igConnecting || !igAccountId.trim() || !igAccessToken.trim() || !igVerifyToken.trim()}
                              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{ background: "linear-gradient(135deg, #fd5949 0%, #d6249f 50%, #285AEB 100%)" }}>
                              {igConnecting ? "Connecting…" : "Connect Instagram"}
                            </button>
                            <button onClick={() => { setIgOpen(false); setIgError(""); setIgAccountId(""); setIgUsername(""); setIgAccessToken(""); setIgVerifyToken(""); }}
                              className="px-4 py-2.5 rounded-xl text-sm font-medium border border-white/8 transition-all"
                              style={{ color: "rgba(255,255,255,0.4)" }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-4 rounded-xl px-4 py-4 border border-white/6 transition-all duration-150"
                    style={{ backgroundColor: "#0d1117", opacity: s.soon ? 0.55 : 1 }}
                  >
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
                    >
                      {s.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white">{s.name}</p>
                        {s.soon && (
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                            style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" }}
                          >
                            Coming Soon
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white/35 mt-0.5">{s.desc}</p>
                    </div>
                    {!s.soon && (
                      <button
                        className="flex-shrink-0 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
                        style={{ backgroundColor: "#3b5bfc" }}
                      >
                        {s.btnLabel}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 2: Custom Code */}
          {tab === "code" && (
            <div className="flex flex-col gap-4">
              {/* Language toggle */}
              <div
                className="flex gap-1 p-1 rounded-xl self-start"
                style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
              >
                {(["python", "javascript"] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setCodeLang(lang)}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all duration-150"
                    style={
                      codeLang === lang
                        ? { backgroundColor: "#1e2a45", color: "#fff" }
                        : { color: "rgba(255,255,255,0.4)" }
                    }
                  >
                    {lang === "javascript" ? "JavaScript" : "Python"}
                  </button>
                ))}
              </div>

              {/* Info callout */}
              <div
                className="rounded-xl px-4 py-3 flex items-start gap-3 border border-white/5"
                style={{ backgroundColor: "rgba(59,91,252,0.08)" }}
              >
                <span className="text-base mt-0.5 flex-shrink-0">💡</span>
                <p className="text-xs text-white/55 leading-relaxed">
                  Send messages directly to this agent using your app or script. No API key required — the agent uses its own credentials.
                </p>
              </div>

              {/* Code block */}
              <div className="relative rounded-xl overflow-hidden border border-white/6" style={{ backgroundColor: "#0d1117" }}>
                {/* Top bar */}
                <div
                  className="flex items-center justify-between px-4 py-2.5 border-b border-white/5"
                  style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                >
                  <span className="text-[11px] font-medium text-white/35 uppercase tracking-wider">
                    {codeLang === "python" ? "Python" : "JavaScript"}
                  </span>
                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-lg transition-all duration-150"
                    style={
                      codeCopied
                        ? { backgroundColor: "rgba(34,197,94,0.15)", color: "#4ade80" }
                        : { backgroundColor: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.55)" }
                    }
                  >
                    {codeCopied ? (
                      <>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="2"/></svg>
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <pre
                  className="text-xs px-5 py-4 overflow-x-auto leading-relaxed"
                  style={{ color: "#a5b4fc", fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
                >
                  <code>{activeCode}</code>
                </pre>
              </div>
            </div>
          )}

          {/* TAB 3: Website */}
          {tab === "website" && (
            <div className="flex flex-col gap-5">
              {/* Widget Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Widget Name</label>
                <input
                  type="text"
                  value={widgetName}
                  onChange={(e) => setWidgetName(e.target.value)}
                  className="rounded-xl px-3.5 py-2.5 text-sm text-white outline-none border border-white/8 focus:border-[#3b5bfc]/60 transition-colors"
                  style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                />
              </div>

              {/* Widget Description */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Description</label>
                <input
                  type="text"
                  value={widgetDesc}
                  onChange={(e) => setWidgetDesc(e.target.value)}
                  placeholder="A short description shown in the chat header"
                  className="rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/20 outline-none border border-white/8 focus:border-[#3b5bfc]/60 transition-colors"
                  style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                />
              </div>

              {/* Color + Starting Message row */}
              <div className="flex gap-4">
                {/* Color picker */}
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Color</label>
                  <button
                    onClick={() => colorInputRef.current?.click()}
                    className="w-11 h-10 rounded-xl border border-white/10 transition-all hover:border-white/25 flex-shrink-0"
                    style={{ backgroundColor: widgetColor }}
                  />
                  <input
                    ref={colorInputRef}
                    type="color"
                    value={widgetColor}
                    onChange={(e) => setWidgetColor(e.target.value)}
                    className="sr-only"
                  />
                </div>

                {/* Starting message */}
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Starting Message</label>
                  <input
                    type="text"
                    value={startingMsg}
                    onChange={(e) => setStartingMsg(e.target.value)}
                    className="rounded-xl px-3.5 py-2.5 text-sm text-white outline-none border border-white/8 focus:border-[#3b5bfc]/60 transition-colors"
                    style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                  />
                </div>
              </div>

              {/* Conversation starters */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
                    Conversation Starters
                    <span className="ml-1.5 normal-case text-white/25">({starters.length}/3)</span>
                  </label>
                  {starters.length < 3 && (
                    <button
                      onClick={addStarter}
                      className="text-xs text-[#818cf8] hover:text-[#a5b4fc] transition-colors font-medium"
                    >
                      + Add
                    </button>
                  )}
                </div>
                {starters.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={s}
                      onChange={(e) => updateStarter(i, e.target.value)}
                      placeholder={`Starter ${i + 1}…`}
                      className="flex-1 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/20 outline-none border border-white/8 focus:border-[#3b5bfc]/60 transition-colors"
                      style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                    />
                    <button
                      onClick={() => removeStarter(i)}
                      className="w-8 h-8 rounded-lg text-white/25 hover:text-white/60 hover:bg-white/5 transition-all text-base flex items-center justify-center flex-shrink-0"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              {/* Size selector */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Widget Size</label>
                <div className="flex gap-2">
                  {(["regular", "large"] as const).map((sz) => (
                    <button
                      key={sz}
                      onClick={() => setWidgetSize(sz)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium capitalize border transition-all duration-150"
                      style={
                        widgetSize === sz
                          ? { backgroundColor: "rgba(59,91,252,0.18)", color: "#818cf8", borderColor: "rgba(59,91,252,0.35)" }
                          : { backgroundColor: "transparent", color: "rgba(255,255,255,0.4)", borderColor: "rgba(255,255,255,0.08)" }
                      }
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error */}
              {saveError && (
                <p className="text-xs text-red-400/80 px-1">{saveError}</p>
              )}

              {/* Actions */}
              <div className="flex flex-col xs:flex-row gap-2 pt-1">
                <button
                  onClick={() => window.open(`/chat/${agentId}`, "_blank")}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-white/10 text-white/50 hover:border-white/20 hover:text-white/75 transition-all duration-150"
                >
                  Preview Widget
                </button>
                <button
                  onClick={() => void handleCreateDeployment()}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: "#3b5bfc" }}
                >
                  {saving ? "Saving…" : "Create Deployment"}
                </button>
              </div>
            </div>
          )}

          {/* ── Success screen (shown after deployment created) ── */}
          {embedCode && (
            <div className="flex flex-col gap-5">
              {/* Title */}
              <div className="flex flex-col items-center gap-2 pt-2 pb-1 text-center">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
                  style={{ backgroundColor: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}
                >
                  🎉
                </div>
                <h3 className="text-base font-bold text-white">Widget Created!</h3>
                <p className="text-xs text-white/40 leading-relaxed">
                  Paste this snippet into your website's HTML before the closing <code className="text-white/60">&lt;/body&gt;</code> tag.
                </p>
              </div>

              {/* Embed code block */}
              <div className="rounded-xl overflow-hidden border border-white/6" style={{ backgroundColor: "#0d1117" }}>
                <div
                  className="flex items-center justify-between px-4 py-2.5 border-b border-white/5"
                  style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                >
                  <span className="text-[11px] font-medium text-white/35 uppercase tracking-wider">Embed Script</span>
                  <button
                    onClick={handleCopyEmbed}
                    className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-lg transition-all duration-150"
                    style={
                      embedCopied
                        ? { backgroundColor: "rgba(34,197,94,0.15)", color: "#4ade80" }
                        : { backgroundColor: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.55)" }
                    }
                  >
                    {embedCopied ? (
                      <>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="2"/></svg>
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <pre
                  className="text-xs px-5 py-4 overflow-x-auto leading-relaxed whitespace-pre"
                  style={{ color: "#a5b4fc", fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
                >
                  <code>{embedCode}</code>
                </pre>
              </div>

              {/* Done */}
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
                style={{ backgroundColor: "#3b5bfc" }}
              >
                Done
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Share modal ──────────────────────────────────────────────────────────────

interface ShareModalProps {
  agentId: string;
  isLive: boolean;
  publishing: boolean;
  onClose: () => void;
  onToggleLive: () => void;
}

function ShareModal({ agentId, isLive, publishing, onClose, onToggleLive }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  const chatUrl = `${window.location.origin}/chat/${agentId}`;

  function handleCopy() {
    void navigator.clipboard.writeText(chatUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleEmailShare(e: React.FormEvent) {
    e.preventDefault();
    if (!shareEmail.trim()) return;
    setEmailSent(true);
    setTimeout(() => setEmailSent(false), 3000);
    setShareEmail("");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 px-7 py-7 flex flex-col gap-6 overflow-hidden"
        style={{ backgroundColor: "#111827", fontFamily: "'Inter', sans-serif" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white">Share Agent</h2>
            <p className="text-sm text-white/45 mt-1.5 leading-relaxed">
              Anyone with the link can chat with this agent when it's live.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-all flex-shrink-0 text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Live toggle */}
        <div
          className="flex items-center justify-between gap-4 rounded-xl px-4 py-3.5 border border-white/5"
          style={{ backgroundColor: isLive ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.03)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: isLive ? "#4ade80" : "rgba(255,255,255,0.25)" }}
            />
            <div>
              <p className="text-sm text-white font-medium">{isLive ? "Agent is Live" : "Agent is Offline"}</p>
              <p className="text-xs text-white/40 mt-0.5">
                {isLive ? "Anyone with the link can chat." : "Publish to allow public access."}
              </p>
            </div>
          </div>
          <button
            onClick={onToggleLive}
            disabled={publishing}
            className="relative w-11 h-6 rounded-full transition-all duration-200 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: isLive ? "#3b5bfc" : "rgba(255,255,255,0.12)" }}
          >
            <span
              className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200"
              style={{ left: isLive ? "calc(100% - 1.375rem)" : "0.125rem" }}
            />
          </button>
        </div>

        {/* Chat link */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Chat link</label>
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 border border-white/8"
            style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
          >
            <span className="flex-1 text-sm text-white/60 truncate select-all">{chatUrl}</span>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
              style={
                copied
                  ? { backgroundColor: "rgba(34,197,94,0.2)", color: "#4ade80" }
                  : { backgroundColor: "rgba(59,91,252,0.2)", color: "#818cf8" }
              }
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        {/* Email share */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Share via email</label>
          <form onSubmit={handleEmailShare} className="flex gap-2 min-w-0">
            <input
              type="email"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
              placeholder="colleague@example.com"
              className="flex-1 min-w-0 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 outline-none border border-white/8 focus:border-[#3b5bfc]/60 transition-colors"
              style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
            />
            <button
              type="submit"
              disabled={!shareEmail.trim() || emailSent}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              style={{ backgroundColor: "#3b5bfc" }}
            >
              {emailSent ? "Sent!" : "Send"}
            </button>
          </form>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl text-sm font-medium text-white/50 border border-white/8 hover:border-white/18 hover:text-white/70 transition-all duration-150"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ─── Studio: No-agent create view ─────────────────────────────────────────────

function StudioNoAgentView() {
  const [, navigate] = useLocation();
  const [agentName, setAgentName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");
  const font = { fontFamily: "'Inter', sans-serif" };

  async function handleCreate() {
    setNameError(""); setError("");
    if (!agentName.trim()) { setNameError("Agent name is required."); return; }
    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("You must be logged in."); setCreating(false); return; }
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ name: agentName.trim(), description: description.trim() || undefined, model }),
      });
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok) { setError(data.error ?? "Failed to create agent"); setCreating(false); return; }
      navigate(`/studio/${(data as { id: string }).id}`);
    } catch { setError("Something went wrong. Please try again."); setCreating(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: "#0a0f1e", ...font }}>
      <div className="w-full max-w-md flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-bold text-white">Create a New Agent</h1>
          <p className="text-sm text-white/40 mt-1">Configure your AI agent to get started</p>
        </div>

        <div
          className="flex flex-col gap-4 rounded-2xl border px-6 py-6"
          style={{ backgroundColor: "#111827", borderColor: "rgba(255,255,255,0.08)" }}
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>Agent Name</label>
            <input
              type="text" placeholder="e.g. Smith's Solar Assistant" autoFocus
              value={agentName} onChange={(e) => { setAgentName(e.target.value); setNameError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
              className="w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none"
              style={{ backgroundColor: "#0a0f1e", border: `1px solid ${nameError ? "#f87171" : "rgba(255,255,255,0.08)"}` }}
            />
            {nameError && <p className="text-xs text-red-400">{nameError}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>
              Description <span style={{ color: "rgba(255,255,255,0.25)" }}>(optional)</span>
            </label>
            <textarea
              placeholder="Describe your agent in a few words"
              value={description} onChange={(e) => setDescription(e.target.value)}
              rows={3} className="w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none resize-none"
              style={{ backgroundColor: "#0a0f1e", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>Model</label>
            <select
              value={model} onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none appearance-none cursor-pointer"
              style={{ backgroundColor: "#0a0f1e", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <option value="gpt-4o-mini">GPT-4o Mini</option>
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-4-turbo">GPT-4 Turbo</option>
            </select>
          </div>

          {error && <p className="text-sm text-red-400 -mt-1">{error}</p>}
        </div>

        <button
          onClick={handleCreate} disabled={creating}
          className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: "#3b5bfc" }}
        >
          {creating ? "Creating…" : "Create Agent"}
        </button>

        <button
          onClick={() => navigate("/dashboard")}
          className="text-sm text-center transition-colors"
          style={{ color: "rgba(255,255,255,0.30)" }}
        >
          ← Back to Dashboard
        </button>
      </div>
    </div>
  );
}

// ─── Studio page ──────────────────────────────────────────────────────────────

interface AgentVersion {
  id: string;
  agent_id: string;
  version_number: number;
  instructions: string | null;
  model: string | null;
  published_at: string;
}

function VersionHistoryModal({
  agentId,
  onClose,
  onRestore,
}: {
  agentId: string;
  onClose: () => void;
  onRestore: (instructions: string, model: string, versionNumber: number) => void;
}) {
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmVersion, setConfirmVersion] = useState<AgentVersion | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    supabase
      .from("agent_versions")
      .select("*")
      .eq("agent_id", agentId)
      .order("version_number", { ascending: false })
      .then(({ data }) => {
        setVersions((data as AgentVersion[]) ?? []);
        setLoading(false);
      });
  }, [agentId]);

  async function doRestore(version: AgentVersion) {
    setRestoring(true);
    await supabase
      .from("agents")
      .update({
        instructions: version.instructions,
        model: version.model,
        prompt_model: version.model,
      })
      .eq("id", agentId);
    setRestoring(false);
    onRestore(version.instructions ?? "", version.model ?? "", version.version_number);
    onClose();
  }

  const font = { fontFamily: "'Inter', sans-serif" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 flex flex-col overflow-hidden"
        style={{ backgroundColor: "#0d1117", maxHeight: "80vh", ...font }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-white/5 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">Version History</h2>
            <p className="text-sm text-white/40 mt-0.5">Track changes to your agent</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/70 transition-colors ml-4 flex-shrink-0 mt-0.5"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 rounded-full border-2 border-[#3b5bfc] border-t-transparent animate-spin" />
            </div>
          ) : versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center gap-2">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-2"
                style={{ backgroundColor: "rgba(59,91,252,0.12)" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#3b5bfc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-sm font-medium text-white/50">No versions yet</p>
              <p className="text-xs text-white/30 leading-relaxed max-w-[200px]">
                Publish your agent to create the first version.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {versions.map((v, idx) => {
                const isCurrent = idx === 0;
                const date = new Date(v.published_at);
                const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                const timeStr = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
                return (
                  <div
                    key={v.id}
                    className="rounded-xl border p-4 flex flex-col gap-2.5"
                    style={{
                      backgroundColor: isCurrent ? "rgba(59,91,252,0.06)" : "#111827",
                      borderColor: isCurrent ? "rgba(59,91,252,0.25)" : "rgba(255,255,255,0.08)",
                    }}
                  >
                    {/* Row: version label + badge + action */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">v{v.version_number}</span>
                        {isCurrent && (
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: "rgba(34,197,94,0.15)", color: "#4ade80" }}
                          >
                            Current
                          </span>
                        )}
                      </div>
                      {!isCurrent && (
                        confirmVersion?.id === v.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-white/40">
                              Restore v{v.version_number}? This will replace your current instructions.
                            </span>
                            <button
                              onClick={() => setConfirmVersion(null)}
                              disabled={restoring}
                              className="text-[11px] text-white/40 hover:text-white/70 transition-colors disabled:opacity-40 flex-shrink-0"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => doRestore(v)}
                              disabled={restoring}
                              className="text-[11px] font-semibold px-2.5 py-1 rounded-lg text-white transition-all hover:opacity-90 disabled:opacity-60 flex items-center gap-1 flex-shrink-0"
                              style={{ backgroundColor: "#3b5bfc" }}
                            >
                              {restoring ? (
                                <>
                                  <span className="w-2.5 h-2.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                                  Restoring…
                                </>
                              ) : "Yes, Restore"}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmVersion(v)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-all duration-150 hover:border-white/25 hover:text-white/80 flex-shrink-0"
                            style={{ color: "rgba(255,255,255,0.5)", borderColor: "rgba(255,255,255,0.14)" }}
                          >
                            Restore
                          </button>
                        )
                      )}
                    </div>

                    {/* Meta: date + model */}
                    <div className="flex items-center gap-2 text-[11px] text-white/40 flex-wrap">
                      <span>{dateStr} at {timeStr}</span>
                      {v.model && (
                        <>
                          <span className="text-white/20">·</span>
                          <span className="font-mono">{v.model}</span>
                        </>
                      )}
                    </div>

                    {/* Instructions preview */}
                    {v.instructions && (
                      <p className="text-[11px] text-white/35 leading-relaxed">
                        {v.instructions.slice(0, 100)}{v.instructions.length > 100 ? "…" : ""}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Studio() {
  const { agentId } = useParams<{ agentId: string }>();
  const [, navigate] = useLocation();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [activeTab, setActiveTab] = useState<Tab>("Prompt");
  const [model, setModel] = useState("gpt-4o-mini");
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [editingInstructions, setEditingInstructions] = useState(false);

  const [showDeployModal, setShowDeployModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [fabPos, setFabPos] = useState(() => ({
    x: window.innerWidth - 156,
    y: window.innerHeight - 72,
  }));
  const fabDragRef = useRef<{ ox: number; oy: number; bx: number; by: number; moved: boolean } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState("");

  // User plan (fetched from billing API)
  const [userPlan, setUserPlan] = useState("free");

  // Input Capabilities — upgrade prompt
  const [capabilityUpgradeFor, setCapabilityUpgradeFor] = useState<string | null>(null);
  const [agentCapabilities, setAgentCapabilities] = useState({ images: false, voice: false, files: false });
  const [savingCapability, setSavingCapability] = useState<string | null>(null);

  // Tools tab — accordion
  const [openToolId, setOpenToolId] = useState<string | null>(null);
  const [toolFields, setToolFields] = useState<Record<string, Record<string, string>>>({});
  const [toolSaved, setToolSaved] = useState<Record<string, boolean>>({});
  const [toolSaving, setToolSaving] = useState<Record<string, boolean>>({});

  const handleSaveToolCreds = async (toolId: string, fields: Record<string, string>) => {
    setToolSaving((prev) => ({ ...prev, [toolId]: true }));
    try {
      const { error } = await supabase
        .from("tools")
        .update({ required_auth: fields, status: "active" })
        .eq("id", toolId);
      if (!error) {
        setToolSaved((prev) => ({ ...prev, [toolId]: true }));
      }
    } catch (_) {
      // silently ignore — user can retry
    } finally {
      setToolSaving((prev) => ({ ...prev, [toolId]: false }));
    }
  };

  // Tools tab
  const [toolPrompt, setToolPrompt] = useState("");
  const [toolAnalyzing, setToolAnalyzing] = useState(false);
  const [toolError, setToolError] = useState("");
  const [toolPreview, setToolPreview] = useState<ToolPreview | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [confirmingTool, setConfirmingTool] = useState(false);
  const [spreadsheetUrl, setSpreadsheetUrl] = useState("");
  const [deletingToolId, setDeletingToolId] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [googleConnected, setGoogleConnected] = useState(false);
  const [checkingGoogle, setCheckingGoogle] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false);
  const [googleDisconnectConfirm, setGoogleDisconnectConfirm] = useState(false);

  // Knowledge Base
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!agentId) return;
    supabase
      .from("agents")
      .select("*")
      .eq("id", agentId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setNotFound(true);
        } else {
          setAgent(data as Agent);
          setModel(data.model ?? "gpt-4o-mini");
          setInstructions(data.instructions ?? "");
          const caps = (data as { input_capabilities?: { images?: boolean; voice?: boolean; files?: boolean } }).input_capabilities;
          if (caps) setAgentCapabilities({ images: !!caps.images, voice: !!caps.voice, files: !!caps.files });
        }
        setLoading(false);
      });
  }, [agentId]);

  // Fetch current user id + billing plan once on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUserId(session.user.id);
        fetch("/api/billing", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
          .then((r) => r.json())
          .then((d: { currentPlan?: string }) => {
            if (d.currentPlan) setUserPlan(d.currentPlan);
          })
          .catch(() => {});
      }
    });
  }, []);

  async function handleToggleCapability(key: "images" | "voice" | "files") {
    const requiredLevel = key === "files" ? 1 : 2;
    const planOrder: Record<string, number> = { free: 0, starter: 1, pro: 2, enterprise: 3 };
    const currentLevel = planOrder[(userPlan ?? "free").toLowerCase()] ?? 0;
    if (currentLevel < requiredLevel) {
      const label = key.charAt(0).toUpperCase() + key.slice(1);
      setCapabilityUpgradeFor((prev) => (prev === label ? null : label));
      return;
    }
    const prevCaps = agentCapabilities;
    const newCaps  = { ...prevCaps, [key]: !prevCaps[key] };
    setAgentCapabilities(newCaps);
    setSavingCapability(key);
    try {
      await supabase.from("agents").update({ input_capabilities: newCaps }).eq("id", agentId!);
    } catch {
      setAgentCapabilities(prevCaps);
    } finally {
      setSavingCapability(null);
    }
  }

  // Check Google connection whenever Tools tab is opened or window regains focus
  async function checkGoogleConnection() {
    if (!userId) return;
    setCheckingGoogle(true);
    const { data } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "google")
      .maybeSingle();
    setGoogleConnected(!!data);
    setCheckingGoogle(false);
    if (data) {
      supabase.auth.getUser().then(({ data: u }) => {
        setGoogleEmail(u.user?.email ?? null);
      });
    } else {
      setGoogleEmail(null);
    }
  }

  async function handleDisconnectGoogle() {
    setDisconnectingGoogle(true);
    await supabase
      .from("integrations")
      .delete()
      .eq("user_id", userId)
      .eq("provider", "google");
    setGoogleConnected(false);
    setGoogleEmail(null);
    setDisconnectingGoogle(false);
    setGoogleDisconnectConfirm(false);
  }

  useEffect(() => {
    if (activeTab !== "Tools" || !userId) return;
    checkGoogleConnection();
    const onFocus = () => checkGoogleConnection();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [activeTab, userId]);

  useEffect(() => {
    if (activeTab !== "Knowledge" || !agent) return;
    setLoadingDocs(true);
    supabase
      .from("documents")
      .select("*")
      .eq("agent_id", agent.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setDocuments((data as Document[]) ?? []);
        setLoadingDocs(false);
      });
  }, [activeTab, agent]);

  function handleFileInput(file: File | null) {
    if (!file) return;
    const allowed = [".pdf", ".txt", ".docx"];
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!allowed.includes(ext)) {
      setUploadError("Only PDF, TXT, and DOCX files are allowed.");
      return;
    }
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadError("File is too large. Maximum size is 5 MB.");
      return;
    }
    setUploadError("");
    setStagedFile(file);
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  async function handleUpload() {
    if (!stagedFile || !agent) return;
    setUploading(true);
    setUploadError("");

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setUploadError("Not authenticated.");
      setUploading(false);
      return;
    }

    const formData = new FormData();
    formData.append("file", stagedFile);
    formData.append("agent_id", agent.id);

    let res: Response;
    try {
      res = await fetch("/api/documents/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });
    } catch {
      setUploadError("Upload failed. Please try again.");
      setUploading(false);
      return;
    }

    if (!res.ok) {
      let errorCode = "";
      try {
        const body = await res.json() as { error?: string };
        errorCode = body.error ?? "";
      } catch { /* ignore parse errors */ }

      if (res.status === 413 || errorCode === "FILE_TOO_LARGE") {
        setUploadError("File is too large. Maximum size is 10MB.");
      } else if (errorCode === "FILE_TYPE_NOT_ALLOWED") {
        setUploadError("File type not allowed. Only PDF, TXT and DOCX files are accepted.");
      } else if (errorCode === "FILE_CONTENT_MISMATCH") {
        setUploadError("File content does not match its extension. Please upload a valid file.");
      } else {
        setUploadError("Upload failed. Please try again.");
      }
      setUploading(false);
      return;
    }

    const { document: docRecord } = await res.json() as { document: Document };
    setDocuments((prev) => [docRecord, ...prev]);
    setStagedFile(null);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    showToast("Document uploaded!");
  }

  useEffect(() => {
    if (activeTab !== "Tools" || !agent) return;
    setLoadingTools(true);
    supabase
      .from("tools")
      .select("*")
      .eq("agent_id", agent.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setTools((data as Tool[]) ?? []);
        setLoadingTools(false);
      });
  }, [activeTab, agent]);

  async function handleConfirmTool() {
    if (!toolPreview || !agent) return;
    if (toolPreview.connector === "google_sheets" && !spreadsheetUrl.trim()) {
      setToolError("Please paste the Google Sheet URL before confirming.");
      return;
    }
    setConfirmingTool(true);
    setToolError("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setToolError("Not authenticated.");
      setConfirmingTool(false);
      return;
    }

    const requiredAuth =
      toolPreview.connector === "google_sheets"
        ? { ...toolPreview.required_auth, spreadsheet_url: spreadsheetUrl.trim() }
        : toolPreview.required_auth;

    const { data: saved, error } = await supabase
      .from("tools")
      .insert({
        agent_id: agent.id,
        user_id: user.id,
        tool_name: toolPreview.tool_name,
        tool_description: toolPreview.tool_description,
        connector: toolPreview.connector,
        action: toolPreview.action,
        required_inputs: toolPreview.required_inputs,
        required_auth: requiredAuth,
        status: "active",
      })
      .select()
      .single();

    setConfirmingTool(false);

    if (error) {
      setToolError("Failed to save tool: " + error.message);
      return;
    }

    setTools((prev) => [saved as Tool, ...prev]);
    setToolPreview(null);
    setToolPrompt("");
    setSpreadsheetUrl("");
    showToast("Tool added successfully!");
  }

  async function handleDeleteTool(id: string) {
    setDeletingToolId(id);
    await supabase.from("tools").delete().eq("id", id);
    setTools((prev) => prev.filter((t) => t.id !== id));
    setDeletingToolId(null);
    showToast("Tool removed.");
  }

  async function handleAnalyzeTool() {
    if (!toolPrompt.trim()) return;
    setToolAnalyzing(true);
    setToolError("");
    setToolPreview(null);

    // Try providers in order: groq → openai → anthropic → google
    const providerOrder = ["groq", "openai", "anthropic", "google"];
    let chosenKey = "";
    let chosenProvider = "";
    for (const p of providerOrder) {
      const { data } = await supabase
        .from("api_keys")
        .select("api_key")
        .eq("provider", p)
        .maybeSingle();
      if (data?.api_key) { chosenKey = data.api_key; chosenProvider = p; break; }
    }

    if (!chosenKey) {
      setToolError("No API key found. Add a Groq or OpenAI key in Settings to use this feature.");
      setToolAnalyzing(false);
      return;
    }

    try {
      const res = await fetch("/api/tools/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: toolPrompt.trim(),
          apiKey: chosenKey,
          provider: chosenProvider,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setToolPreview(data.tool as ToolPreview);
    } catch (err) {
      setToolError(err instanceof Error ? err.message : "Analysis failed. Please try again.");
    } finally {
      setToolAnalyzing(false);
    }
  }

  async function handleDelete(doc: Document) {
    setDeletingId(doc.id);

    if (doc.storage_path) {
      await supabase.storage.from("documents").remove([doc.storage_path]);
    }

    await supabase.from("documents").delete().eq("id", doc.id);

    setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    setDeletingId(null);
    showToast("Document deleted.");
  }

  async function handleSave() {
    if (!agent) return;
    setSaving(true);
    await supabase.from("agents").update({ model, instructions, prompt_model: model }).eq("id", agent.id);
    setSaving(false);
    setSavedMsg(true);
    setEditingInstructions(false);
    setTimeout(() => setSavedMsg(false), 2500);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  async function handlePublish() {
    if (!agent) return;
    setPublishing(true);
    const { error } = await supabase
      .from("agents")
      .update({ status: "live" })
      .eq("id", agent.id);
    if (!error) {
      // Save a version snapshot
      const [{ count }, { data: { user } }] = await Promise.all([
        supabase
          .from("agent_versions")
          .select("id", { count: "exact", head: true })
          .eq("agent_id", agent.id),
        supabase.auth.getUser(),
      ]);
      if (user) {
        await supabase.from("agent_versions").insert({
          agent_id: agent.id,
          user_id: user.id,
          version_number: (count ?? 0) + 1,
          instructions,
          model,
        });
      }
      setAgent((prev) => prev ? { ...prev, status: "live" } : prev);
      setShowDeployModal(false);
      showToast("Agent is now Live! 🎉");
    }
    setPublishing(false);
  }

  function handleVersionRestore(instr: string, mdl: string, vnum: number) {
    setInstructions(instr);
    setModel(mdl);
    showToast(`Restored to v${vnum}!`);
  }

  async function handleUnpublish() {
    if (!agent) return;
    setPublishing(true);
    const { error } = await supabase
      .from("agents")
      .update({ status: "draft" })
      .eq("id", agent.id);
    setPublishing(false);
    if (!error) {
      setAgent((prev) => prev ? { ...prev, status: "draft" } : prev);
      showToast("Agent unpublished.");
    }
  }

  const font = { fontFamily: "'Inter', sans-serif" };

  if (!agentId) {
    return <StudioNoAgentView />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0a0f1e", ...font }}>
        <div className="w-6 h-6 rounded-full border-2 border-[#3b5bfc] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (notFound || !agent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ backgroundColor: "#0a0f1e", ...font }}>
        <p className="text-white/50 text-sm">Agent not found.</p>
        <button onClick={() => navigate("/dashboard")} className="text-[#3b5bfc] text-sm hover:underline">
          ← Back to Dashboard
        </button>
      </div>
    );
  }

  const isLive = agent.status === "live";

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: "#0a0f1e", ...font }}>

      {/* Top bar */}
      <header
        className="flex items-center justify-between px-3 py-3 md:px-8 md:py-4 border-b border-white/5 flex-shrink-0 z-10"
        style={{ backgroundColor: "#0d1117" }}
      >
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          <button
            onClick={() => navigate("/dashboard")}
            className="text-white/40 hover:text-white/80 text-sm transition-colors duration-150 flex items-center gap-1.5 flex-shrink-0"
          >
            ← Dashboard
          </button>
          <span className="text-white/20 text-sm hidden md:block">|</span>
          <div className="min-w-0 hidden md:block">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white truncate">{agent.name}</h1>
              <span
                className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize"
                style={
                  isLive
                    ? { backgroundColor: "rgba(34,197,94,0.15)", color: "#4ade80" }
                    : { backgroundColor: "rgba(251,146,60,0.15)", color: "#fb923c" }
                }
              >
                {agent.status}
              </span>
            </div>
            {agent.description && (
              <p className="text-xs text-white/35 truncate mt-0.5">{agent.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Desktop-only buttons */}
          <button
            onClick={() => navigate("/settings")}
            className="hidden md:flex px-3.5 py-2 rounded-lg text-sm font-medium text-white/50 border border-white/10 hover:border-white/20 hover:text-white/75 transition-all duration-150 items-center gap-1.5"
          >
            <span className="text-sm">⚙️</span>
            Settings
          </button>
          {/* Deploy — always visible */}
          <button
            onClick={() => setShowDeployModal(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
            style={{ backgroundColor: "#3b5bfc" }}
          >
            Deploy
          </button>
          {/* Desktop: Unpublish */}
          {isLive && (
            <button
              onClick={handleUnpublish}
              disabled={publishing}
              className="hidden md:flex px-4 py-2 rounded-lg text-sm font-medium border transition-all duration-150 disabled:opacity-50"
              style={{ color: "rgba(248,113,113,0.85)", borderColor: "rgba(248,113,113,0.25)" }}
            >
              {publishing ? "Saving…" : "Unpublish"}
            </button>
          )}
          {/* Desktop: Share + Version History */}
          <button
            onClick={() => setShowShareModal(true)}
            className="hidden md:flex px-4 py-2 rounded-lg text-sm font-medium text-white/60 border border-white/10 hover:border-white/20 hover:text-white/80 transition-all duration-150"
          >
            Share
          </button>
          <button
            onClick={() => setShowVersionModal(true)}
            className="hidden md:flex px-4 py-2 rounded-lg text-sm font-medium text-white/60 border border-white/10 hover:border-white/20 hover:text-white/80 transition-all duration-150"
          >
            Version History
          </button>
          {/* Mobile "•••" dropdown */}
          <div className="relative md:hidden">
            <button
              onClick={() => setShowMobileMenu((v) => !v)}
              className="px-3 py-2 rounded-lg text-sm font-bold text-white/60 border border-white/10 hover:border-white/20 hover:text-white/80 transition-all duration-150 tracking-widest"
            >
              •••
            </button>
            {showMobileMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMobileMenu(false)} />
                <div
                  className="absolute right-0 top-full mt-1 w-52 rounded-xl border border-white/10 z-50 flex flex-col overflow-hidden shadow-xl"
                  style={{ backgroundColor: "#0d1117" }}
                >
                  {isLive && (
                    <button
                      onClick={() => { setShowMobileMenu(false); handleUnpublish(); }}
                      className="px-4 py-3 text-sm text-left transition-colors hover:bg-white/5"
                      style={{ color: "rgba(248,113,113,0.85)" }}
                    >
                      Unpublish
                    </button>
                  )}
                  <button onClick={() => { setShowMobileMenu(false); setShowShareModal(true); }} className="px-4 py-3 text-sm text-white/70 text-left transition-colors hover:bg-white/5 border-t border-white/5">Share</button>
                  <button onClick={() => { setShowMobileMenu(false); setShowVersionModal(true); }} className="px-4 py-3 text-sm text-white/70 text-left transition-colors hover:bg-white/5 border-t border-white/5">Version History</button>
                  <button onClick={() => { setShowMobileMenu(false); navigate("/settings"); }} className="px-4 py-3 text-sm text-white/70 text-left transition-colors hover:bg-white/5 border-t border-white/5">Settings</button>

                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Body: two columns */}
      <div className="flex flex-1 min-h-0">

        {/* ── Left column: tabs + content ── */}
        <div className="flex flex-col min-h-0 w-full md:w-[60%]">
          {/* Tabs */}
          <div className="flex items-center gap-1 px-3 pt-3 md:px-8 md:pt-4 border-b border-white/5 flex-shrink-0">
            {tabs.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="px-4 py-2 text-sm font-medium transition-all duration-150 relative"
                  style={{ color: isActive ? "#ffffff" : "rgba(255,255,255,0.55)" }}
                >
                  {tab}
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                      style={{ backgroundColor: "#3b5bfc" }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content (scrollable) */}
          <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 md:px-8 md:py-6">
            {activeTab === "Prompt" && (
              <div className="flex flex-col gap-6 max-w-xl">

                {/* ── Model selector ── */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-white/70">Model</label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full max-w-xs rounded-lg px-4 py-2.5 text-sm text-white border border-white/10 outline-none focus:border-[#3b5bfc] transition-colors appearance-none cursor-pointer"
                    style={{ backgroundColor: "#111827" }}
                  >
                    {modelGroups.map((group) => (
                      <optgroup key={group.provider} label={group.label} style={{ backgroundColor: "#111827", color: "rgba(255,255,255,0.5)" }}>
                        {group.models.map((opt) => (
                          <option key={opt.value} value={opt.value} style={{ backgroundColor: "#111827" }}>
                            {opt.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <p className="text-[11px] text-white/30">
                    Provider: <span className="capitalize text-white/45">{getProviderForModel(model)}</span>
                    {" · "}
                    <button
                      onClick={() => navigate("/settings")}
                      className="text-[#3b5bfc]/70 hover:text-[#3b5bfc] transition-colors"
                    >
                      Manage API keys →
                    </button>
                  </p>
                </div>

                {/* ── Instructions ── */}
                <div className="flex flex-col gap-2">
                  {/* Label row */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-white/70">Instructions</label>
                    {!editingInstructions && (
                      <button
                        onClick={() => setEditingInstructions(true)}
                        className="flex items-center gap-1 text-xs text-white/35 hover:text-white/65 transition-colors"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Edit
                      </button>
                    )}
                  </div>

                  {editingInstructions ? (
                    /* ── Edit mode ── */
                    <div className="flex flex-col gap-2.5">
                      <textarea
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        placeholder="Write your agent instructions here..."
                        rows={5}
                        autoFocus
                        className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 border border-[#3b5bfc]/50 outline-none focus:border-[#3b5bfc] transition-colors resize-none leading-relaxed"
                        style={{ backgroundColor: "#111827" }}
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleSave}
                          disabled={saving}
                          className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ backgroundColor: "#3b5bfc" }}
                        >
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={() => setEditingInstructions(false)}
                          disabled={saving}
                          className="px-4 py-2 rounded-lg text-sm font-medium border border-white/10 hover:border-white/20 transition-all disabled:opacity-40"
                          style={{ color: "rgba(255,255,255,0.45)" }}
                        >
                          Cancel
                        </button>
                        {savedMsg && (
                          <span className="text-sm text-green-400 flex items-center gap-1">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            Saved
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* ── Read-only mode ── */
                    <div
                      className="rounded-xl px-4 py-3 text-sm leading-relaxed border border-white/6 cursor-default transition-colors min-h-[5rem]"
                      style={{ backgroundColor: "#111827", color: instructions.trim() ? "rgba(255,255,255,0.75)" : undefined }}
                    >
                      {instructions.trim() ? (
                        <span className="whitespace-pre-wrap">{instructions}</span>
                      ) : (
                        <span style={{ color: "rgba(255,255,255,0.22)", fontStyle: "italic" }}>
                          No instructions yet — click to add…
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Input Capabilities ── */}
                <div className="flex flex-col gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-white/70">Input Capabilities</h3>
                    <p className="text-xs text-white/30 mt-0.5">What types of input your agent accepts</p>
                  </div>

                  <div
                    className="rounded-xl border border-white/8 px-4 py-4"
                    style={{ backgroundColor: "#111827" }}
                  >
                    <div className="grid grid-cols-4 gap-2">

                      {/* ── Text (always on) ── */}
                      <div className="flex flex-col items-center gap-2">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M4 6h16M4 10h16M4 14h10" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                        </div>
                        {/* ON toggle */}
                        <div
                          className="w-9 h-5 rounded-full relative cursor-default flex-shrink-0"
                          style={{ backgroundColor: "rgba(255,255,255,0.3)" }}
                        >
                          <div
                            className="absolute right-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-sm"
                          />
                        </div>
                        <span className="text-[11px] font-medium text-white/55 text-center leading-tight">Text</span>
                      </div>

                      {/* ── Images (Pro+) ── */}
                      {(["images", "voice", "files"] as const).map((key) => {
                        const on = agentCapabilities[key];
                        const saving = savingCapability === key;
                        const icons: Record<string, React.ReactNode> = {
                          images: (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                              <rect x="3" y="3" width="18" height="18" rx="2" stroke={on ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)"} strokeWidth="2"/>
                              <path d="M3 15l5-5 4 4 3-3 6 6" stroke={on ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <circle cx="8.5" cy="8.5" r="1.5" fill={on ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)"}/>
                            </svg>
                          ),
                          voice: (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                              <rect x="9" y="2" width="6" height="11" rx="3" stroke={on ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)"} strokeWidth="2"/>
                              <path d="M5 10a7 7 0 0014 0" stroke={on ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)"} strokeWidth="2" strokeLinecap="round"/>
                              <line x1="12" y1="17" x2="12" y2="21" stroke={on ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)"} strokeWidth="2" strokeLinecap="round"/>
                              <line x1="9" y1="21" x2="15" y2="21" stroke={on ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)"} strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                          ),
                          files: (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke={on ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <polyline points="14,2 14,8 20,8" stroke={on ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          ),
                        };
                        const label = key.charAt(0).toUpperCase() + key.slice(1);
                        return (
                          <button
                            key={key}
                            className="flex flex-col items-center gap-2 cursor-pointer group"
                            onClick={() => void handleToggleCapability(key)}
                            disabled={saving}
                          >
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors group-hover:bg-white/10"
                              style={{ backgroundColor: on ? "rgba(59,91,252,0.18)" : "rgba(255,255,255,0.05)" }}
                            >
                              {saving ? (
                                <div className="w-3.5 h-3.5 rounded-full border border-white/30 border-t-transparent animate-spin" />
                              ) : icons[key]}
                            </div>
                            <div
                              className="w-9 h-5 rounded-full relative flex-shrink-0 transition-colors"
                              style={{ backgroundColor: on ? "#3b5bfc" : "rgba(255,255,255,0.15)", opacity: on ? 1 : 0.45 }}
                            >
                              <div
                                className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all"
                                style={{ left: on ? "auto" : "2px", right: on ? "2px" : "auto" }}
                              />
                            </div>
                            <span
                              className="text-[11px] font-medium text-center leading-tight"
                              style={{ color: on ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.35)" }}
                            >
                              {label}
                            </span>
                          </button>
                        );
                      })}

                    </div>
                  </div>
                </div>

                {/* ── Upgrade banner (shown when a locked capability is clicked) ── */}
                {capabilityUpgradeFor && (
                  <div
                    className="rounded-xl p-4 flex items-start gap-3 border"
                    style={{ backgroundColor: "rgba(239,68,68,0.06)", borderColor: "rgba(239,68,68,0.25)" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 mt-0.5">
                      <circle cx="12" cy="12" r="10" stroke="#f87171" strokeWidth="2"/>
                      <line x1="12" y1="8" x2="12" y2="12" stroke="#f87171" strokeWidth="2" strokeLinecap="round"/>
                      <circle cx="12" cy="16" r="1" fill="#f87171"/>
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold" style={{ color: "#f87171" }}>
                        {capabilityUpgradeFor} input is not available on your current plan
                      </p>
                      <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                        Upgrade your plan to enable {capabilityUpgradeFor.toLowerCase()} capabilities for your agents.
                      </p>
                      <a
                        href="/pricing"
                        className="inline-block mt-2 text-xs font-semibold underline-offset-2 hover:underline"
                        style={{ color: "#f87171" }}
                      >
                        View plans & upgrade →
                      </a>
                    </div>
                    <button
                      onClick={() => setCapabilityUpgradeFor(null)}
                      className="text-white/25 hover:text-white/50 transition-colors flex-shrink-0"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                )}

              </div>
            )}

            {activeTab === "Knowledge" && (
              <div className="flex flex-col gap-6">
                {/* Header */}
                <div>
                  <h2 className="text-base font-semibold text-white">Knowledge Base</h2>
                  <p className="text-sm text-white/40 mt-1">
                    Upload documents your agent will use to answer questions
                  </p>
                </div>

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.docx"
                  className="hidden"
                  onChange={(e) => handleFileInput(e.target.files?.[0] ?? null)}
                />

                {/* Staged file */}
                {stagedFile ? (
                  <div
                    className="rounded-xl border border-white/10 px-5 py-4 flex items-center justify-between gap-4"
                    style={{ backgroundColor: "#111827" }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-2xl flex-shrink-0">📄</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{stagedFile.name}</p>
                        <p className="text-xs text-white/40 mt-0.5">{formatBytes(stagedFile.size)}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setStagedFile(null); setUploadError(""); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                          disabled={uploading}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white/50 border border-white/10 hover:border-white/20 hover:text-white/75 transition-all disabled:opacity-40"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleUpload}
                          disabled={uploading}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60 flex items-center gap-1.5"
                          style={{ backgroundColor: "#3b5bfc" }}
                        >
                          {uploading ? (
                            <>
                              <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                              Uploading…
                            </>
                          ) : "Upload"}
                        </button>
                      </div>
                      {uploadError && (
                        <p className="text-xs text-red-400">{uploadError}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Drop zone */
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      handleFileInput(e.dataTransfer.files?.[0] ?? null);
                    }}
                    className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 py-10 px-6 transition-all duration-150 cursor-pointer"
                    style={{
                      borderColor: isDragOver ? "#3b5bfc" : "rgba(255,255,255,0.12)",
                      backgroundColor: isDragOver ? "rgba(59,91,252,0.06)" : "transparent",
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {/* Cloud upload icon */}
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: "rgba(59,91,252,0.15)" }}
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                        <path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6H16a3 3 0 010 6h-1" stroke="#3b5bfc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M12 12v9M9 15l3-3 3 3" stroke="#3b5bfc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-white/70">Drag and drop files here</p>
                      <p className="text-xs text-white/30 mt-1">Supports PDF, TXT, DOCX</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                      className="mt-1 px-4 py-1.5 rounded-lg text-xs font-medium text-[#3b5bfc] border transition-all duration-150 hover:bg-[#3b5bfc]/10"
                      style={{ borderColor: "rgba(59,91,252,0.4)" }}
                    >
                      Choose Files
                    </button>
                  </div>
                )}

                {/* Document list */}
                <div className="flex flex-col gap-2">
                  {loadingDocs ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-5 h-5 rounded-full border-2 border-[#3b5bfc] border-t-transparent animate-spin" />
                    </div>
                  ) : documents.length === 0 ? (
                    <p className="text-sm text-white/25 text-center py-6">No documents uploaded yet</p>
                  ) : (
                    documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="rounded-xl border border-white/8 px-4 py-3 flex items-center justify-between gap-4"
                        style={{ backgroundColor: "#111827" }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xl flex-shrink-0">📄</span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate">{doc.file_name}</p>
                            <p className="text-xs text-white/35 mt-0.5">
                              {doc.file_size ? formatBytes(doc.file_size) : "—"}
                              {" · "}
                              {formatDate(doc.created_at)}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 sm:gap-2 flex-shrink-0">
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: "rgba(34,197,94,0.15)", color: "#4ade80" }}
                          >
                            Uploaded
                          </span>
                          <button
                            onClick={() => handleDelete(doc)}
                            disabled={deletingId === doc.id}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                            style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#f87171" }}
                          >
                            {deletingId === doc.id ? (
                              <>
                                <span className="w-2.5 h-2.5 rounded-full border-2 border-red-400 border-t-transparent animate-spin" />
                                Deleting…
                              </>
                            ) : "Delete"}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === "Tools" && (
              <div className="flex flex-col gap-3">

                {/* ── Header ── */}
                <div className="mb-2">
                  <h2 className="text-base font-semibold text-white">Integrations</h2>
                  <p className="text-sm text-white/40 mt-0.5">Connect tools to give your agent real capabilities</p>
                </div>

                {/* ── Accordion list ── */}
                {STATIC_TOOLS.map((tool, toolIdx) => {
                  const isOpen = openToolId === tool.id;
                  const fields = toolFields[tool.id] ?? {};
                  const saved  = toolSaved[tool.id]  ?? false;
                  const requiredPlan = toolRequiredPlan(tool.id);
                  const isLocked = !isPlanSufficientFor(requiredPlan, userPlan);

                  return (
                    <div
                      key={tool.id}
                      className="rounded-xl overflow-hidden transition-all duration-150"
                      style={{
                        border: isOpen
                          ? "1px solid rgba(59,91,252,0.4)"
                          : "1px solid rgba(255,255,255,0.07)",
                        backgroundColor: "#0d1117",
                      }}
                    >
                      {/* ── Clickable row ── */}
                      <button
                        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                        onClick={() => setOpenToolId(isOpen ? null : tool.id)}
                      >
                        {/* Brand icon */}
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-[11px] font-bold tracking-wide"
                          style={{ backgroundColor: tool.bg, color: tool.color }}
                        >
                          {tool.initials}
                        </div>

                        {/* Category · Name */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] text-white/35 leading-none">{tool.category}</span>
                            <span className="text-[10px] text-white/20">·</span>
                            <span className="text-sm font-semibold text-white leading-none">{tool.name}</span>
                          </div>
                        </div>

                        {/* Active badge + chevron */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {saved && !isLocked && (
                            <span
                              className="hidden sm:flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: "rgba(34,197,94,0.15)", color: "#4ade80" }}
                            >
                              ✓ Active
                            </span>
                          )}
                          {/* Plan badges removed — upgrade prompt shown inside expanded panel */}
                          <div
                            className="w-6 h-6 rounded-md flex items-center justify-center transition-transform duration-200"
                            style={{
                              backgroundColor: isOpen ? "rgba(59,91,252,0.15)" : "rgba(255,255,255,0.05)",
                              color: isOpen ? "#3b5bfc" : "rgba(255,255,255,0.35)",
                              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                            }}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        </div>
                      </button>

                      {/* ── Expanded panel ── */}
                      {isOpen && (
                        <div
                          className="border-t px-4 pt-4 pb-5 flex flex-col gap-4"
                          style={{ borderColor: "rgba(59,91,252,0.2)", backgroundColor: "rgba(8,14,32,0.6)" }}
                        >
                          {/* Tool header */}
                          <div className="flex items-center gap-3">
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold tracking-wide"
                              style={{ backgroundColor: tool.bg, color: tool.color }}
                            >
                              {tool.initials}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-white">{tool.name}</p>
                              <p className="text-xs text-white/45 mt-0.5 leading-relaxed">{tool.desc}</p>
                            </div>
                          </div>

                          {/* Credential fields */}
                          <div className="flex flex-col gap-3">
                            {tool.fields.map((field) => (
                              <div key={field.key} className="flex flex-col gap-1.5">
                                <label className="text-[11px] font-semibold text-white/45 uppercase tracking-wider">
                                  {field.label}
                                </label>
                                {field.type === "textarea" ? (
                                  <textarea
                                    rows={3}
                                    value={fields[field.key] ?? ""}
                                    onChange={(e) =>
                                      setToolFields((prev) => ({
                                        ...prev,
                                        [tool.id]: { ...(prev[tool.id] ?? {}), [field.key]: e.target.value },
                                      }))
                                    }
                                    placeholder={field.placeholder}
                                    className="w-full rounded-lg px-3 py-2.5 text-xs text-white placeholder-white/20 border border-white/10 outline-none focus:border-[#3b5bfc]/60 transition-colors resize-none font-mono leading-relaxed"
                                    style={{ backgroundColor: "#0a0f1e" }}
                                  />
                                ) : (
                                  <input
                                    type={field.type}
                                    value={fields[field.key] ?? ""}
                                    onChange={(e) =>
                                      setToolFields((prev) => ({
                                        ...prev,
                                        [tool.id]: { ...(prev[tool.id] ?? {}), [field.key]: e.target.value },
                                      }))
                                    }
                                    placeholder={field.placeholder}
                                    className="w-full rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 border border-white/10 outline-none focus:border-[#3b5bfc]/60 transition-colors"
                                    style={{ backgroundColor: "#0a0f1e" }}
                                  />
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Action buttons / Upgrade prompt */}
                          {isLocked ? (
                            <div
                              className="rounded-xl p-4 flex flex-col gap-3 border"
                              style={{ backgroundColor: "rgba(239,68,68,0.06)", borderColor: "rgba(239,68,68,0.25)" }}
                            >
                              <div className="flex items-start gap-2.5">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 mt-0.5">
                                  <circle cx="12" cy="12" r="10" stroke="#f87171" strokeWidth="2"/>
                                  <line x1="12" y1="8" x2="12" y2="12" stroke="#f87171" strokeWidth="2" strokeLinecap="round"/>
                                  <circle cx="12" cy="16" r="1" fill="#f87171"/>
                                </svg>
                                <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
                                  Your current plan doesn't include this tool. Upgrade to unlock it and connect it to your agent.
                                </p>
                              </div>
                              <a
                                href="/pricing"
                                className="w-full py-2.5 rounded-lg text-xs font-semibold text-white text-center transition-all hover:opacity-90 active:scale-95 block"
                                style={{ backgroundColor: "#ef4444" }}
                              >
                                View plans & upgrade →
                              </a>
                            </div>
                          ) : (
                            <>
                              <div className="flex gap-2.5 pt-1">
                                <button
                                  className="flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all duration-150 hover:opacity-80 active:scale-95 border"
                                  style={{
                                    color: "rgba(255,255,255,0.55)",
                                    borderColor: "rgba(255,255,255,0.12)",
                                    backgroundColor: "transparent",
                                  }}
                                >
                                  Test Connection
                                </button>
                                <button
                                  onClick={() => handleSaveToolCreds(tool.id, toolFields[tool.id] ?? {})}
                                  disabled={toolSaving[tool.id]}
                                  className="flex-1 py-2.5 rounded-lg text-xs font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-60"
                                  style={{ backgroundColor: "#3b5bfc" }}
                                >
                                  {toolSaving[tool.id] ? "Saving…" : saved ? "✓ Activated" : "Save & Activate"}
                                </button>
                              </div>
                              {saved && (
                                <p className="sm:hidden text-[11px] font-semibold text-center" style={{ color: "#4ade80" }}>
                                  ✓ This tool is active
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

              </div>
            )}
          </div>
        </div>

        {/* ── Right column: chat panel (desktop only) ── */}
        <div
          className="hidden md:flex flex-col overflow-hidden md:w-[40%]"
          style={{ position: "sticky", top: 0, height: "100vh", flexShrink: 0 }}
        >
          <ChatPanel key={agent.id} agentId={agent.id} instructions={instructions} model={model} docCount={documents.length} userId={userId} onSwitchTab={(tab) => setActiveTab(tab as Tab)} />
        </div>
      </div>

      {/* ── Mobile "Test Agent" FAB — draggable ── */}
      <button
        className="md:hidden fixed z-40 px-5 py-3.5 rounded-2xl text-sm font-semibold text-white shadow-xl flex items-center gap-2 select-none"
        style={{ backgroundColor: "#3b5bfc", left: fabPos.x, top: fabPos.y, touchAction: "none", cursor: "grab" }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          fabDragRef.current = { ox: e.clientX, oy: e.clientY, bx: fabPos.x, by: fabPos.y, moved: false };
        }}
        onPointerMove={(e) => {
          if (!fabDragRef.current) return;
          const dx = e.clientX - fabDragRef.current.ox;
          const dy = e.clientY - fabDragRef.current.oy;
          if (Math.abs(dx) > 5 || Math.abs(dy) > 5) fabDragRef.current.moved = true;
          setFabPos({
            x: Math.max(8, Math.min(window.innerWidth - 148, fabDragRef.current.bx + dx)),
            y: Math.max(8, Math.min(window.innerHeight - 56, fabDragRef.current.by + dy)),
          });
        }}
        onPointerUp={() => {
          if (!fabDragRef.current) return;
          if (!fabDragRef.current.moved) setShowMobileChat(true);
          fabDragRef.current = null;
        }}
      >
        🤖 Test Agent
      </button>

      {/* ── Mobile chat overlay ── */}
      {showMobileChat && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "#0d1117" }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 flex-shrink-0">
            <span className="text-sm font-semibold text-white">Test Agent</span>
            <button
              onClick={() => setShowMobileChat(false)}
              className="text-white/50 hover:text-white/80 text-xl w-8 h-8 flex items-center justify-center transition-colors"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <ChatPanel key={`mobile-${agent.id}`} agentId={agent.id} instructions={instructions} model={model} docCount={documents.length} userId={userId} onSwitchTab={(tab) => setActiveTab(tab as Tab)} />
          </div>
        </div>
      )}

      {/* ── Share modal ── */}
      {showShareModal && (
        <ShareModal
          agentId={agent.id}
          isLive={isLive}
          onClose={() => setShowShareModal(false)}
          onToggleLive={isLive ? handleUnpublish : handlePublish}
          publishing={publishing}
        />
      )}

      {/* ── Deploy modal ── */}
      {showDeployModal && (
        <DeployModal
          agentId={agent.id}
          agentName={agent.name}
          userId={userId}
          onClose={() => setShowDeployModal(false)}
        />
      )}

      {/* ── Version History modal ── */}
      {showVersionModal && agent && (
        <VersionHistoryModal
          agentId={agent.id}
          onClose={() => setShowVersionModal(false)}
          onRestore={handleVersionRestore}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium text-white shadow-lg transition-all"
          style={{ backgroundColor: "#16a34a" }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
