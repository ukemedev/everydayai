import { useCallback, useEffect, useRef, useState } from "react";
import { marked } from "marked";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Conversation {
  id:                   string;
  agent_id:             string;
  agent_name:           string | null;
  channel:              "web" | "whatsapp" | "telegram" | "messenger" | "instagram";
  customer_display:     string | null;
  mode:                 "ai" | "human";
  status:               "active" | "archived";
  unread_count:         number;
  last_message_at:      string;
  last_message_preview: string | null;
}

interface Message {
  id:         string;
  role:       "customer" | "ai" | "human";
  content:    string;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CHANNEL_ICONS: Record<string, string> = {
  web:       "🌐",
  whatsapp:  "📱",
  telegram:  "✈️",
  messenger: "💬",
  instagram: "📸",
};

const CHANNEL_LABELS: Record<string, string> = {
  web:       "Web",
  whatsapp:  "WhatsApp",
  telegram:  "Telegram",
  messenger: "Messenger",
  instagram: "Instagram",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)    return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

// ─── Back arrow icon ──────────────────────────────────────────────────────────

function BackArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Send icon ────────────────────────────────────────────────────────────────

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Inbox page ───────────────────────────────────────────────────────────────

export default function Inbox() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [messages,      setMessages]      = useState<Message[]>([]);
  const [selectedConv,  setSelectedConv]  = useState<Conversation | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [modeFilter,    setModeFilter]    = useState<string>("all");
  const [loading,       setLoading]       = useState(true);
  const [replyText,     setReplyText]     = useState("");
  const [sending,       setSending]       = useState(false);
  const [togglingMode,  setTogglingMode]  = useState(false);

  // Mobile: track whether detail panel is showing
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const replyRef       = useRef<HTMLTextAreaElement>(null);

  // ── Fetch conversation list ────────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    const headers = await getAuthHeader();
    if (!headers.Authorization) return;
    const params = new URLSearchParams({ status: "active", limit: "50" });
    if (channelFilter !== "all") params.set("channel", channelFilter);
    if (modeFilter    !== "all") params.set("mode",    modeFilter);
    try {
      const res  = await fetch(`/api/conversations?${params}`, { headers });
      const data = await res.json() as { conversations: Conversation[] };
      if (Array.isArray(data.conversations)) {
        setConversations(data.conversations);
        if (selectedId) {
          const updated = data.conversations.find(c => c.id === selectedId);
          if (updated) setSelectedConv(updated);
        }
      }
    } catch { /* non-fatal */ }
    setLoading(false);
  }, [channelFilter, modeFilter, selectedId]);

  // ── Fetch messages for selected conversation ───────────────────────────────
  const fetchMessages = useCallback(async (convId: string): Promise<void> => {
    const headers = await getAuthHeader();
    if (!headers.Authorization) return;
    try {
      const res  = await fetch(`/api/conversations/${convId}/messages`, { headers });
      const data = await res.json() as { conversation: Conversation; messages: Message[] };
      if (data.messages) {
        setMessages(data.messages);
        setSelectedConv(data.conversation);
      }
    } catch { /* non-fatal */ }
  }, []);

  // ── Initial load + polling ────────────────────────────────────────────────
  useEffect(() => {
    void fetchConversations();
    const t = setInterval(() => { void fetchConversations(); }, 5000);
    return () => clearInterval(t);
  }, [fetchConversations]);

  useEffect(() => {
    if (!selectedId) return;
    void fetchMessages(selectedId);
    const t = setInterval(() => { void fetchMessages(selectedId); }, 5000);
    return () => clearInterval(t);
  }, [selectedId, fetchMessages]);

  // ── Scroll to bottom on new messages ──────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Select a conversation ─────────────────────────────────────────────────
  function selectConversation(conv: Conversation) {
    setSelectedId(conv.id);
    setSelectedConv(conv);
    setMessages([]);
    setReplyText("");
    setMobileShowDetail(true);
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
  }

  // ── Back to list (mobile) ─────────────────────────────────────────────────
  function goBackToList() {
    setMobileShowDetail(false);
  }

  // ── Toggle mode ───────────────────────────────────────────────────────────
  async function toggleMode() {
    if (!selectedConv || togglingMode) return;
    const newMode = selectedConv.mode === "ai" ? "human" : "ai";
    setTogglingMode(true);
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`/api/conversations/${selectedConv.id}/mode`, {
        method:  "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body:    JSON.stringify({ mode: newMode }),
      });
      const data = await res.json() as { mode: "ai" | "human" };
      if (data.mode) {
        setSelectedConv(prev => prev ? { ...prev, mode: data.mode } : prev);
        setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, mode: data.mode } : c));
        if (newMode === "human") replyRef.current?.focus();
      }
    } catch { /* non-fatal */ } finally {
      setTogglingMode(false);
    }
  }

  // ── Send human reply ──────────────────────────────────────────────────────
  async function sendReply() {
    if (!selectedConv || !replyText.trim() || sending) return;
    const text = replyText.trim();
    setSending(true);
    setReplyText("");
    const optimistic: Message = {
      id: crypto.randomUUID(), role: "human", content: text, created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    try {
      const headers = await getAuthHeader();
      await fetch(`/api/conversations/${selectedConv.id}/reply`, {
        method:  "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body:    JSON.stringify({ content: text }),
      });
    } catch { /* non-fatal */ } finally {
      setSending(false);
    }
  }

  function handleReplyKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendReply(); }
  }

  // ── Archive conversation ───────────────────────────────────────────────────
  async function archiveConversation(convId: string) {
    const headers = await getAuthHeader();
    await fetch(`/api/conversations/${convId}/archive`, {
      method:  "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body:    JSON.stringify({ archive: true }),
    });
    setConversations(prev => prev.filter(c => c.id !== convId));
    if (selectedId === convId) {
      setSelectedId(null);
      setSelectedConv(null);
      setMessages([]);
      setMobileShowDetail(false);
    }
  }

  const CHANNELS = ["all", "web", "whatsapp", "telegram", "messenger", "instagram"];
  const totalUnread = conversations.reduce((s, c) => s + c.unread_count, 0);

  // Responsive panel visibility:
  // Mobile: show list OR detail (not both). Desktop: always show both.
  const listVisible   = !mobileShowDetail;  // mobile: hide list when detail open
  const detailVisible = mobileShowDetail;   // mobile: show detail when open

  return (
    <AppLayout activeItemId="inbox">
      <div
        className="flex flex-1 h-full overflow-hidden min-h-0"
        style={{ backgroundColor: "var(--app-bg)", fontFamily: "'Inter', sans-serif" }}
      >

        {/* ── LEFT PANEL: Conversation List ────────────────────────────────── */}
        <div
          className={[
            "flex flex-col border-r flex-shrink-0 h-full",
            // Mobile: full screen, hidden when detail is open
            // Desktop: fixed 320px sidebar, always visible
            listVisible ? "flex" : "hidden",
            "md:flex w-full md:w-80",
          ].join(" ")}
          style={{ backgroundColor: "var(--app-sidebar)", borderColor: "var(--app-border)" }}
        >
          {/* Header */}
          <div className="px-4 pt-5 pb-3 border-b flex-shrink-0" style={{ borderColor: "var(--app-border)" }}>
            <div className="flex items-center gap-2 mb-3">
              <h1 className="text-base font-bold flex-1" style={{ color: "var(--app-text)" }}>Inbox</h1>
              {totalUnread > 0 && (
                <span
                  className="min-w-[22px] h-[22px] px-1.5 flex items-center justify-center rounded-full text-xs font-bold"
                  style={{ backgroundColor: "#3b5bfc", color: "#fff" }}
                >
                  {totalUnread}
                </span>
              )}
            </div>

            {/* Channel filters */}
            <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
              {CHANNELS.map(ch => (
                <button
                  key={ch}
                  onClick={() => setChannelFilter(ch)}
                  className="flex-shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                  style={channelFilter === ch
                    ? { backgroundColor: "#3b5bfc", color: "#fff" }
                    : { backgroundColor: "rgba(255,255,255,0.06)", color: "var(--app-text-muted)" }}
                  title={ch === "all" ? "All" : CHANNEL_LABELS[ch]}
                >
                  {ch === "all"
                    ? <><span>All</span></>
                    : (
                      <>
                        <span>{CHANNEL_ICONS[ch]}</span>
                        <span className="hidden sm:inline ml-1">{CHANNEL_LABELS[ch]}</span>
                      </>
                    )
                  }
                </button>
              ))}
            </div>

            {/* Mode filter */}
            <div className="flex gap-1 mt-2">
              {(["all", "ai", "human"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setModeFilter(m)}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                  style={modeFilter === m
                    ? { backgroundColor: "rgba(59,91,252,0.15)", color: "#818cf8" }
                    : { backgroundColor: "transparent", color: "var(--app-text-muted)" }}
                >
                  {m === "all" ? "All" : m === "ai" ? "🤖 AI" : "👤 Human"}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-5 h-5 rounded-full border-2 border-[#3b5bfc] border-t-transparent animate-spin" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-56 gap-3 px-6 text-center">
                <span className="text-4xl">📭</span>
                <p className="text-sm font-medium" style={{ color: "var(--app-text)" }}>No conversations yet</p>
                <p className="text-xs leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
                  When customers chat with your agents, they'll appear here.
                </p>
              </div>
            ) : (
              conversations.map(conv => {
                const isSelected = conv.id === selectedId;
                return (
                  <button
                    key={conv.id}
                    onClick={() => selectConversation(conv)}
                    className="w-full text-left px-4 py-3.5 border-b transition-colors flex gap-3 items-start active:opacity-70"
                    style={{
                      borderColor: "var(--app-border-subtle)",
                      backgroundColor: isSelected ? "rgba(59,91,252,0.10)" : "transparent",
                    }}
                  >
                    {/* Channel avatar */}
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center text-base flex-shrink-0"
                      style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                    >
                      {CHANNEL_ICONS[conv.channel] ?? "💬"}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Name + time */}
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="text-sm font-semibold truncate flex-1" style={{ color: "var(--app-text)" }}>
                          {conv.customer_display ?? "Visitor"}
                        </span>
                        <span className="text-[10px] flex-shrink-0" style={{ color: "var(--app-text-faint)" }}>
                          {timeAgo(conv.last_message_at)}
                        </span>
                        {conv.unread_count > 0 && (
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: "#3b5bfc" }}
                          />
                        )}
                      </div>
                      {/* Agent name */}
                      <p className="text-[11px] truncate mb-0.5" style={{ color: "var(--app-text-faint)" }}>
                        {conv.agent_name ?? conv.agent_id}
                      </p>
                      {/* Preview */}
                      <p className="text-xs truncate" style={{ color: "var(--app-text-muted)" }}>
                        {conv.last_message_preview ?? "—"}
                      </p>
                      {/* Mode badge */}
                      <div className="mt-1.5">
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                          style={conv.mode === "human"
                            ? { backgroundColor: "rgba(234,179,8,0.15)", color: "#eab308" }
                            : { backgroundColor: "rgba(59,91,252,0.12)", color: "#818cf8" }}
                        >
                          {conv.mode === "human" ? "👤 Human" : "🤖 AI"}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL: Conversation Detail ─────────────────────────────── */}
        <div
          className={[
            "flex-col h-full min-w-0 flex-1",
            // Mobile: full screen, only visible when detail is open
            // Desktop: always visible
            detailVisible ? "flex" : "hidden",
            "md:flex",
          ].join(" ")}
        >
          {!selectedConv ? (
            /* Empty state — desktop only (mobile never shows this since list is shown) */
            <div className="flex-1 hidden md:flex flex-col items-center justify-center gap-4" style={{ color: "var(--app-text-muted)" }}>
              <span className="text-5xl">💬</span>
              <p className="text-sm font-medium" style={{ color: "var(--app-text)" }}>Select a conversation</p>
              <p className="text-xs text-center max-w-xs leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
                Click any conversation to see the full history and reply as a human.
              </p>
            </div>
          ) : (
            <div className="flex flex-col h-full">

              {/* Conversation header */}
              <div
                className="flex-shrink-0 px-4 py-3.5 border-b flex items-center gap-3"
                style={{ backgroundColor: "var(--app-sidebar)", borderColor: "var(--app-border)" }}
              >
                {/* Back button — mobile only */}
                <button
                  onClick={goBackToList}
                  className="md:hidden flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl transition-colors active:opacity-60"
                  style={{ color: "var(--app-text-muted)", backgroundColor: "rgba(255,255,255,0.05)" }}
                  aria-label="Back to inbox"
                >
                  <BackArrow />
                </button>

                {/* Channel icon */}
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                >
                  {CHANNEL_ICONS[selectedConv.channel]}
                </div>

                {/* Contact info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight truncate" style={{ color: "var(--app-text)" }}>
                    {selectedConv.customer_display ?? "Web visitor"}
                  </p>
                  <p className="text-[11px] truncate" style={{ color: "var(--app-text-faint)" }}>
                    {CHANNEL_LABELS[selectedConv.channel]} · {selectedConv.agent_name ?? selectedConv.agent_id}
                  </p>
                </div>

                {/* Mode toggle — compact on mobile, full text on desktop */}
                <button
                  onClick={() => void toggleMode()}
                  disabled={togglingMode}
                  className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border disabled:opacity-50"
                  style={selectedConv.mode === "human"
                    ? { backgroundColor: "rgba(234,179,8,0.12)", color: "#eab308",  borderColor: "rgba(234,179,8,0.25)" }
                    : { backgroundColor: "rgba(59,91,252,0.10)", color: "#818cf8", borderColor: "rgba(59,91,252,0.25)" }}
                >
                  {togglingMode ? (
                    <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  ) : selectedConv.mode === "human" ? (
                    <>
                      <span>👤</span>
                      <span className="hidden sm:inline">Hand to AI</span>
                    </>
                  ) : (
                    <>
                      <span>🤖</span>
                      <span className="hidden sm:inline">Take Over</span>
                    </>
                  )}
                </button>

                {/* Archive button */}
                <button
                  onClick={() => void archiveConversation(selectedConv.id)}
                  className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl text-sm transition-colors hover:opacity-70 active:opacity-50"
                  title="Archive conversation"
                  style={{ color: "var(--app-text-faint)", backgroundColor: "rgba(255,255,255,0.04)" }}
                >
                  🗂
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
                {messages.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="w-5 h-5 rounded-full border-2 border-[#3b5bfc] border-t-transparent animate-spin" />
                  </div>
                ) : (
                  messages.map(msg => {
                    const isCustomer = msg.role === "customer";
                    const isHuman    = msg.role === "human";
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col gap-1 ${isCustomer ? "items-start" : "items-end"}`}
                      >
                        <span className="text-[10px] px-1" style={{ color: "var(--app-text-faint)" }}>
                          {isCustomer ? "Customer" : isHuman ? "You" : "🤖 AI"}
                        </span>
                        <div
                          className="max-w-[80%] sm:max-w-[70%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
                          style={isCustomer
                            ? {
                                backgroundColor: "rgba(255,255,255,0.07)",
                                color: "var(--app-text)",
                                borderBottomLeftRadius: "4px",
                                border: "1px solid rgba(255,255,255,0.06)",
                              }
                            : isHuman
                            ? {
                                backgroundColor: "rgba(34,197,94,0.15)",
                                color: "rgba(255,255,255,0.9)",
                                borderBottomRightRadius: "4px",
                                border: "1px solid rgba(34,197,94,0.2)",
                              }
                            : {
                                backgroundColor: "rgba(59,91,252,0.15)",
                                color: "rgba(255,255,255,0.9)",
                                borderBottomRightRadius: "4px",
                                border: "1px solid rgba(59,91,252,0.2)",
                              }}
                        >
                          {isCustomer || isHuman
                            ? msg.content
                            : <span dangerouslySetInnerHTML={{ __html: marked.parse(msg.content) as string }} />}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply area */}
              <div
                className="flex-shrink-0 px-4 py-3 border-t"
                style={{ backgroundColor: "var(--app-sidebar)", borderColor: "var(--app-border)" }}
              >
                {selectedConv.mode === "ai" ? (
                  <div
                    className="rounded-xl px-4 py-3 flex items-center gap-3"
                    style={{ backgroundColor: "rgba(59,91,252,0.06)", border: "1px solid rgba(59,91,252,0.15)" }}
                  >
                    <span className="text-base flex-shrink-0">🤖</span>
                    <p className="text-xs flex-1 leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
                      AI is handling this. Tap{" "}
                      <button
                        onClick={() => void toggleMode()}
                        className="font-semibold underline underline-offset-2"
                        style={{ color: "#818cf8" }}
                      >
                        Take Over
                      </button>
                      {" "}to reply yourself.
                    </p>
                  </div>
                ) : (
                  <div
                    className="flex gap-2 rounded-2xl p-2.5"
                    style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <textarea
                      ref={replyRef}
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={handleReplyKeyDown}
                      placeholder="Reply…"
                      rows={2}
                      className="flex-1 bg-transparent text-sm resize-none outline-none leading-relaxed"
                      style={{ color: "var(--app-text)", paddingTop: "4px" }}
                    />
                    <button
                      onClick={() => void sendReply()}
                      disabled={!replyText.trim() || sending}
                      className="self-end w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all hover:opacity-90 active:scale-95 disabled:opacity-30"
                      style={{ backgroundColor: "#3b5bfc" }}
                    >
                      {sending ? (
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <SendIcon />
                      )}
                    </button>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

      </div>
    </AppLayout>
  );
}
