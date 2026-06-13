import { useCallback, useEffect, useRef, useState } from "react";
import { marked } from "marked";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/lib/supabase";
import { AgentAvatar } from "@/components/AgentAvatar";

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
  tags:                 string[];
}

interface Message {
  id:         string;
  role:       "customer" | "ai" | "human";
  content:    string;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ChannelIcon({ channel, className = "w-4 h-4" }: { channel: string; className?: string }) {
  switch (channel) {
    case "whatsapp":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" style={{ color: "#25D366" }}>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      );
    case "telegram":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" style={{ color: "#229ED9" }}>
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
      );
    case "messenger":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" style={{ color: "#0084FF" }}>
          <path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.498 1.744 6.614 4.469 8.652V24l4.088-2.242c1.092.3 2.246.464 3.443.464 6.627 0 12-4.974 12-11.111C24 4.974 18.627 0 12 0zm1.191 14.963l-3.055-3.26-5.963 3.26L10.732 8l3.131 3.26L19.752 8l-6.561 6.963z"/>
        </svg>
      );
    case "instagram":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" style={{ color: "#E1306C" }}>
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
      );
    case "web":
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} style={{ color: "#94a3b8" }}>
          <circle cx="12" cy="12" r="10"/>
          <path strokeLinecap="round" d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
        </svg>
      );
  }
}

const CHANNEL_LABELS: Record<string, string> = {
  web:       "Web",
  whatsapp:  "WhatsApp",
  telegram:  "Telegram",
  messenger: "Messenger",
  instagram: "Instagram",
};

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14H6L5,6"/><path d="M10,11v6M14,11v6"/><path d="M9,6V4h6v2"/>
    </svg>
  );
}

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
  const [statusFilter,  setStatusFilter]  = useState<"active" | "archived">("active");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [modeFilter,    setModeFilter]    = useState<string>("all");
  const [loading,         setLoading]         = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messagesError,   setMessagesError]   = useState<string | null>(null);
  const [replyText,       setReplyText]       = useState("");
  const [sending,         setSending]         = useState(false);
  const [replyError,      setReplyError]      = useState<string | null>(null);
  const [togglingMode,    setTogglingMode]    = useState(false);
  const [deletingId,      setDeletingId]      = useState<string | null>(null);
  const [showClearAll,    setShowClearAll]    = useState(false);
  const [clearingAll,     setClearingAll]     = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [searchQuery,     setSearchQuery]     = useState("");

  // Tags
  const [convTags,    setConvTags]    = useState<string[]>([]);
  const [tagInput,    setTagInput]    = useState("");
  const [savingTags,  setSavingTags]  = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Mobile: track whether detail panel is showing
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const replyRef       = useRef<HTMLTextAreaElement>(null);

  // ── Fetch conversation list ────────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    const headers = await getAuthHeader();
    if (!headers.Authorization) return;
    const params = new URLSearchParams({ status: statusFilter, limit: "50" });
    if (channelFilter !== "all") params.set("channel", channelFilter);
    if (modeFilter    !== "all") params.set("mode",    modeFilter);
    if (searchQuery.trim())      params.set("search",  searchQuery.trim());
    try {
      const res  = await fetch(`/api/conversations?${params}`, { headers, cache: "no-store" });
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
  }, [statusFilter, channelFilter, modeFilter, selectedId, searchQuery]);

  // ── Fetch messages for selected conversation ───────────────────────────────
  const fetchMessages = useCallback(async (convId: string, isInitial = false): Promise<void> => {
    const headers = await getAuthHeader();
    if (!headers.Authorization) {
      if (isInitial) setMessagesError("Session expired — please refresh the page.");
      return;
    }
    if (isInitial) setLoadingMessages(true);
    try {
      const res  = await fetch(`/api/conversations/${convId}/messages`, { headers, cache: "no-store" });
      if (!res.ok) {
        if (isInitial) setMessagesError(`Failed to load messages (${res.status}). Try selecting the conversation again.`);
        return;
      }
      const data = await res.json() as { conversation: Conversation; messages: Message[] };
      if (data.messages) {
        setMessages(data.messages);
        setMessagesError(null);
      }
      if (data.conversation) setSelectedConv(data.conversation);
    } catch {
      if (isInitial) setMessagesError("Network error loading messages. Check your connection.");
    } finally {
      if (isInitial) setLoadingMessages(false);
    }
  }, []);

  // ── Initial load + polling ────────────────────────────────────────────────
  useEffect(() => {
    void fetchConversations();
    const t = setInterval(() => { void fetchConversations(); }, 5000);
    return () => clearInterval(t);
  }, [fetchConversations]);

  useEffect(() => {
    if (!selectedId) return;
    void fetchMessages(selectedId, true);
    const t = setInterval(() => { void fetchMessages(selectedId); }, 5000);
    return () => clearInterval(t);
  }, [selectedId, fetchMessages]);

  // ── Scroll to bottom on new messages ──────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Sync tags when selected conversation changes ──────────────────────────
  useEffect(() => {
    setConvTags(selectedConv?.tags ?? []);
    setTagInput("");
  }, [selectedConv?.id]);

  // ── Save tags to API ──────────────────────────────────────────────────────
  async function saveTags(next: string[]) {
    if (!selectedConv) return;
    setSavingTags(true);
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`/api/conversations/${selectedConv.id}/tags`, {
        method:  "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body:    JSON.stringify({ tags: next }),
      });
      if (res.ok) {
        setConvTags(next);
        setSelectedConv(prev => prev ? { ...prev, tags: next } : prev);
        setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, tags: next } : c));
      }
    } catch { /* non-fatal */ } finally {
      setSavingTags(false);
    }
  }

  function commitTagInput() {
    const raw = tagInput.trim().toLowerCase().replace(/[^a-z0-9\-_]/g, "").slice(0, 50);
    if (!raw || convTags.includes(raw) || convTags.length >= 20) {
      setTagInput("");
      return;
    }
    const next = [...convTags, raw];
    setTagInput("");
    void saveTags(next);
  }

  function removeTag(tag: string) {
    void saveTags(convTags.filter(t => t !== tag));
  }

  // ── Select a conversation ─────────────────────────────────────────────────
  function selectConversation(conv: Conversation) {
    setSelectedId(conv.id);
    setSelectedConv(conv);
    setMessages([]);
    setMessagesError(null);
    setReplyText("");
    setReplyError(null);
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
    setReplyError(null);
    setReplyText("");
    const optimistic: Message = {
      id: crypto.randomUUID(), role: "human", content: text, created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`/api/conversations/${selectedConv.id}/reply`, {
        method:  "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body:    JSON.stringify({ content: text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setReplyError(err.error ?? `Failed to send (${res.status}). Try again.`);
        // Roll back optimistic message
        setMessages(prev => prev.filter(m => m.id !== optimistic.id));
        setReplyText(text);
      }
    } catch {
      setReplyError("Network error. Check your connection and try again.");
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setReplyText(text);
    } finally {
      setSending(false);
    }
  }

  function handleReplyKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendReply(); }
  }

  // ── Delete conversation (soft-delete) ─────────────────────────────────────
  async function deleteConversation(convId: string) {
    setDeletingId(convId);
    try {
      const headers = await getAuthHeader();
      await fetch(`/api/conversations/${convId}`, { method: "DELETE", headers });
      setConversations(prev => prev.filter(c => c.id !== convId));
      if (selectedId === convId) {
        setSelectedId(null);
        setSelectedConv(null);
        setMessages([]);
        setMobileShowDetail(false);
      }
    } catch { /* non-fatal */ } finally {
      setDeletingId(null);
    }
  }

  // ── Clear all conversations ────────────────────────────────────────────────
  async function clearAllConversations() {
    setClearingAll(true);
    setConversations([]);
    setSelectedId(null);
    setSelectedConv(null);
    setMessages([]);
    setMobileShowDetail(false);
    try {
      const headers = await getAuthHeader();
      await fetch("/api/conversations", { method: "DELETE", headers });
    } catch { /* non-fatal */ } finally {
      setClearingAll(false);
      setShowClearAll(false);
    }
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

  // ── Unarchive conversation ─────────────────────────────────────────────────
  async function unarchiveConversation(convId: string) {
    const headers = await getAuthHeader();
    await fetch(`/api/conversations/${convId}/archive`, {
      method:  "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body:    JSON.stringify({ archive: false }),
    });
    setConversations(prev => prev.filter(c => c.id !== convId));
    if (selectedId === convId) {
      setSelectedId(null);
      setSelectedConv(null);
      setMessages([]);
      setMobileShowDetail(false);
    }
  }

  // ── Switch status tab ──────────────────────────────────────────────────────
  function switchStatusTab(tab: "active" | "archived") {
    setStatusFilter(tab);
    setSelectedId(null);
    setSelectedConv(null);
    setMessages([]);
    setMobileShowDetail(false);
    setLoading(true);
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
              {totalUnread > 0 && statusFilter === "active" && (
                <span
                  className="min-w-[22px] h-[22px] px-1.5 flex items-center justify-center rounded-full text-xs font-bold"
                  style={{ backgroundColor: "#3b5bfc", color: "#fff" }}
                >
                  {totalUnread}
                </span>
              )}
              {conversations.length > 0 && (
                <button
                  onClick={() => setShowClearAll(true)}
                  className="text-[11px] px-2 py-1 rounded-lg transition-colors hover:opacity-80"
                  style={{ backgroundColor: "rgba(239,68,68,0.10)", color: "#f87171" }}
                  title="Delete all conversations"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Active / Archived tabs */}
            <div className="flex gap-1 mb-3 p-0.5 rounded-lg" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
              {(["active", "archived"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => switchStatusTab(tab)}
                  className="flex-1 py-1.5 rounded-md text-xs font-medium transition-colors capitalize"
                  style={statusFilter === tab
                    ? { backgroundColor: "#3b5bfc", color: "#fff" }
                    : { backgroundColor: "transparent", color: "var(--app-text-muted)" }}
                >
                  {tab === "active" ? "Active" : "Archived"}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative mb-2">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--app-text-faint)" }}>
                <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setLoading(true); }}
                placeholder="Search conversations…"
                className="w-full pl-8 pr-7 py-1.5 rounded-lg text-xs outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--app-text)" }}
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); setLoading(true); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs"
                  style={{ color: "var(--app-text-faint)" }}
                >✕</button>
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
                        <ChannelIcon channel={ch} className="w-3.5 h-3.5 inline" />
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
                  {m === "all" ? "All" : m === "ai" ? (
                    <span className="flex items-center gap-1"><AgentAvatar size={12} /> AI</span>
                  ) : "👤 Human"}
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
                  <div
                    key={conv.id}
                    className="border-b relative group"
                    style={{ borderColor: "var(--app-border-subtle)" }}
                  >
                    <button
                      onClick={() => selectConversation(conv)}
                      className="w-full text-left px-4 py-3.5 transition-colors flex gap-3 items-start active:opacity-70"
                      style={{ backgroundColor: isSelected ? "rgba(59,91,252,0.10)" : "transparent" }}
                    >
                      {/* Channel avatar */}
                      <div
                        className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                      >
                        <ChannelIcon channel={conv.channel} className="w-5 h-5" />
                      </div>

                      <div className="flex-1 min-w-0 pr-6">
                        {/* Name + time */}
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="text-sm font-semibold truncate flex-1" style={{ color: "var(--app-text)" }}>
                            {conv.customer_display ?? "Visitor"}
                          </span>
                          <span className="text-[10px] flex-shrink-0" style={{ color: "var(--app-text-faint)" }}>
                            {timeAgo(conv.last_message_at)}
                          </span>
                          {conv.unread_count > 0 && statusFilter === "active" && (
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
                        {statusFilter === "active" && (
                          <div className="mt-1.5">
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                              style={conv.mode === "human"
                                ? { backgroundColor: "rgba(234,179,8,0.15)", color: "#eab308" }
                                : { backgroundColor: "rgba(59,91,252,0.12)", color: "#818cf8" }}
                            >
                              {conv.mode === "human" ? "👤 Human" : (
                                <span className="flex items-center gap-1"><AgentAvatar size={10} /> AI</span>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    </button>

                    {/* Action buttons — appear on hover */}
                    <div className="absolute right-2 top-3 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          if (statusFilter === "archived") {
                            void unarchiveConversation(conv.id);
                          } else {
                            void archiveConversation(conv.id);
                          }
                        }}
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors hover:opacity-80"
                        style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "var(--app-text-muted)" }}
                        title={statusFilter === "archived" ? "Restore to Active" : "Archive"}
                      >
                        {statusFilter === "archived" ? "Restore" : "Archive"}
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setConfirmDeleteId(conv.id);
                        }}
                        disabled={deletingId === conv.id}
                        className="w-6 h-6 flex items-center justify-center rounded transition-colors hover:bg-red-500/20 disabled:opacity-40"
                        style={{ color: "#f87171" }}
                        title="Delete conversation"
                      >
                        {deletingId === conv.id
                          ? <span className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" />
                          : <TrashIcon />}
                      </button>
                    </div>
                  </div>
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
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                >
                  <ChannelIcon channel={selectedConv.channel} className="w-5 h-5" />
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
                      <AgentAvatar size={14} />
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

              {/* ── Tags strip ──────────────────────────────────────────── */}
              <div
                className="flex-shrink-0 px-4 py-2 border-b flex flex-wrap items-center gap-1.5 min-h-[40px]"
                style={{ backgroundColor: "rgba(255,255,255,0.015)", borderColor: "var(--app-border)" }}
              >
                {convTags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium select-none"
                    style={{
                      backgroundColor: "rgba(59,91,252,0.15)",
                      border: "1px solid rgba(59,91,252,0.25)",
                      color: "#818cf8",
                    }}
                  >
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      disabled={savingTags}
                      className="ml-0.5 flex items-center justify-center w-3.5 h-3.5 rounded-full transition-colors hover:bg-white/10 disabled:opacity-40"
                      aria-label={`Remove tag ${tag}`}
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </span>
                ))}

                {/* Add-tag input */}
                <input
                  ref={tagInputRef}
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      commitTagInput();
                    }
                    if (e.key === "Backspace" && !tagInput && convTags.length > 0) {
                      removeTag(convTags[convTags.length - 1]);
                    }
                  }}
                  onBlur={() => { if (tagInput.trim()) commitTagInput(); }}
                  placeholder={convTags.length === 0 ? "Add tag…" : "+tag"}
                  disabled={savingTags || convTags.length >= 20}
                  className="flex-1 min-w-[60px] max-w-[120px] bg-transparent text-[11px] outline-none disabled:opacity-40 placeholder:opacity-40"
                  style={{ color: "var(--app-text-muted)" }}
                  aria-label="Add tag"
                />
                {savingTags && (
                  <span className="w-3 h-3 border border-[#818cf8] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
                {messagesError ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
                    <span className="text-3xl">⚠️</span>
                    <p className="text-sm font-medium" style={{ color: "var(--app-text)" }}>Couldn't load messages</p>
                    <p className="text-xs leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{messagesError}</p>
                    <button
                      onClick={() => { if (selectedId) void fetchMessages(selectedId, true); }}
                      className="mt-1 px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
                      style={{ backgroundColor: "rgba(59,91,252,0.15)", color: "#818cf8" }}
                    >
                      Retry
                    </button>
                  </div>
                ) : loadingMessages ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="w-5 h-5 rounded-full border-2 border-[#3b5bfc] border-t-transparent animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-xs" style={{ color: "var(--app-text-faint)" }}>No messages yet</p>
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
                          {isCustomer ? "Customer" : isHuman ? "You" : (
                            <span className="flex items-center gap-1"><AgentAvatar size={10} /> AI</span>
                          )}
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
                {replyError && (
                  <div
                    className="mb-2 px-3 py-2 rounded-lg text-xs flex items-start gap-2"
                    style={{ backgroundColor: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.20)", color: "#f87171" }}
                  >
                    <span className="flex-shrink-0">⚠️</span>
                    <span>{replyError}</span>
                  </div>
                )}
                {selectedConv.mode === "ai" ? (
                  <div
                    className="rounded-xl px-4 py-3 flex items-center gap-3"
                    style={{ backgroundColor: "rgba(59,91,252,0.06)", border: "1px solid rgba(59,91,252,0.15)" }}
                  >
                    <AgentAvatar size={18} className="flex-shrink-0" />
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

      {/* ── Clear All confirmation modal ────────────────────────────────────── */}
      {/* ── Single delete confirmation modal ───────────────────────────────── */}
      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDeleteId(null); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border p-6 flex flex-col gap-4"
            style={{ backgroundColor: "#111827", borderColor: "rgba(255,255,255,0.08)" }}
          >
            <div>
              <h2 className="text-base font-bold text-white mb-1">Delete conversation?</h2>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
                This will permanently delete this conversation. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                disabled={deletingId === confirmDeleteId}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-80 disabled:opacity-40"
                style={{ backgroundColor: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmDeleteId) {
                    void deleteConversation(confirmDeleteId).then(() => setConfirmDeleteId(null));
                  }
                }}
                disabled={deletingId === confirmDeleteId}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: "#dc2626" }}
              >
                {deletingId === confirmDeleteId && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {deletingId === confirmDeleteId ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showClearAll && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowClearAll(false); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border p-6 flex flex-col gap-4"
            style={{ backgroundColor: "#111827", borderColor: "rgba(255,255,255,0.08)" }}
          >
            <div>
              <h2 className="text-base font-bold text-white mb-1">Delete all conversations?</h2>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
                This will delete all {conversations.length} conversation{conversations.length !== 1 ? "s" : ""} in the current view. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearAll(false)}
                disabled={clearingAll}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-80 disabled:opacity-40"
                style={{ backgroundColor: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => void clearAllConversations()}
                disabled={clearingAll}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: "#dc2626" }}
              >
                {clearingAll && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {clearingAll ? "Deleting…" : "Delete all"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
