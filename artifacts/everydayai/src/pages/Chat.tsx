import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { marked } from "marked";
import { AgentAvatar } from "@/components/AgentAvatar";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentInfo {
  id:          string;
  name:        string;
  description: string | null;
  status:      string;
  model:       string;
  input_capabilities?: { images: boolean; voice: boolean; files: boolean };
}

interface Message {
  id:       string;
  role:     "user" | "agent";
  text:     string;
  isLimit?: boolean;
}

interface ConversationMessage {
  role:    "user" | "assistant";
  content: string;
}

const LIMIT_MESSAGE =
  "Thank you for chatting! Our agent has reached its limit for now. Please contact us directly or try again later.";

// ─── Chat page ────────────────────────────────────────────────────────────────

export default function Chat() {
  const { agentId } = useParams<{ agentId: string }>();

  const [agent, setAgent]             = useState<AgentInfo | null>(null);
  const [loading, setLoading]         = useState(true);
  const [notAvailable, setNotAvailable] = useState(false);

  const [messages, setMessages]       = useState<Message[]>([]);
  const [input, setInput]             = useState("");
  const [isTyping, setIsTyping]       = useState(false);
  const [limitReached, setLimitReached] = useState(false);

  // Session ID for inbox tracking — stable across page reloads
  const [sessionId] = useState(() => {
    const stored = sessionStorage.getItem(`everydayai-session-${agentId}`);
    if (stored) return stored;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(`everydayai-session-${agentId}`, fresh);
    return fresh;
  });

  const messagesEndRef   = useRef<HTMLDivElement>(null);
  const inputRef         = useRef<HTMLInputElement>(null);
  const pollSinceRef     = useRef<string>("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const fileInputRef     = useRef<HTMLInputElement>(null);

  const [pendingAttachment, setPendingAttachment] = useState<{
    type: "image" | "file" | "voice";
    content?: string;
    base64?: string;
    mimeType?: string;
    filename?: string;
    label: string;
  } | null>(null);
  const [isRecording, setIsRecording]       = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Fetch agent info
  useEffect(() => {
    if (!agentId) { setNotAvailable(true); setLoading(false); return; }

    fetch(`/api/public/agents/${agentId}`)
      .then((r) => r.json())
      .then((data: { agent?: AgentInfo; error?: string }) => {
        if (!data.agent || data.agent.status !== "live") {
          setNotAvailable(true);
        } else {
          setAgent(data.agent);
        }
        setLoading(false);
      })
      .catch(() => { setNotAvailable(true); setLoading(false); });
  }, [agentId]);

  // ── Poll for human replies from the inbox ──────────────────────────────────
  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;

    async function poll() {
      const since = pollSinceRef.current || "";
      const params = new URLSearchParams({ agentId, sessionId, since });
      try {
        const res = await fetch(`/api/public/conversations/messages?${params}`);
        const data = await res.json() as {
          messages: Array<{ role: "human" | "ai"; content: string; created_at: string }>;
          mode: "ai" | "human";
        };
        if (cancelled || !data.messages) return;
        if (data.messages.length > 0) {
          const newMsgs: Message[] = data.messages.map((m) => ({
            id:   crypto.randomUUID(),
            role: m.role === "human" ? "agent" : "agent",
            text: m.content,
            isLimit: false,
          }));
          setMessages((prev) => {
            // Avoid duplicates by content
            const existingKeys = new Set(prev.map((p) => p.text));
            const deduped = newMsgs.filter((m) => !existingKeys.has(m.text));
            return deduped.length > 0 ? [...prev, ...deduped] : prev;
          });
          const last = data.messages[data.messages.length - 1];
          if (last) pollSinceRef.current = last.created_at;
        }
        // If mode switched to human on server, this chat is paused
        if (data.mode === "human" && !limitReached) {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "agent",
              text: "A human has taken over this conversation. You will receive a reply shortly.",
              isHuman: false,
              isLimit: true,
            },
          ]);
          setLimitReached(true);
        }
      } catch { /* non-fatal */ }
    }

    const t = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(t); };
  }, [agentId, sessionId, limitReached]);

  function addLimitMessage() {
    setLimitReached(true);
    setMessages((prev) => [
      ...prev,
      {
        id:      crypto.randomUUID(),
        role:    "agent",
        text:    LIMIT_MESSAGE,
        isLimit: true,
      },
    ]);
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadingMedia(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("agentId", agentId ?? "");
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) { alert("Upload failed. Please try again."); return; }
      const data = await res.json() as { type: string; base64?: string; mimeType?: string; content?: string; filename?: string };
      if (data.type === "image") {
        setPendingAttachment({ type: "image", base64: data.base64, mimeType: data.mimeType, label: `📷 ${file.name}` });
      } else if (data.type === "voice") {
        setPendingAttachment({ type: "voice", content: data.content, label: "🎙️ Voice note transcribed" });
      } else {
        setPendingAttachment({ type: "file", content: data.content, filename: file.name, label: `📎 ${file.name}` });
      }
    } catch {
      alert("Upload failed. Please check your connection.");
    } finally {
      setUploadingMedia(false);
    }
  }

  async function toggleRecording() {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        setUploadingMedia(true);
        try {
          const formData = new FormData();
          formData.append("file", blob, "voice.webm");
          formData.append("agentId", agentId ?? "");
          const res = await fetch("/api/upload", { method: "POST", body: formData });
          if (!res.ok) { alert("Upload failed."); return; }
          const data = await res.json() as { content?: string };
          if (data.content) setPendingAttachment({ type: "voice", content: data.content, label: "🎙️ Voice note transcribed" });
        } finally {
          setUploadingMedia(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      alert("Microphone access denied.");
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if ((!text && !pendingAttachment) || isTyping || limitReached) return;

    const attachment = pendingAttachment;
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", text: text || (attachment?.label ?? "…") };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setPendingAttachment(null);
    setIsTyping(true);

    const conversationHistory: ConversationMessage[] = messages.map((m) => ({
      role:    m.role === "user" ? "user" : "assistant",
      content: m.text,
    }));

    const attachments = attachment ? [attachment] : [];

    try {
      const res = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: text, agentId, conversationHistory, attachments }),
      });

      const data = await res.json() as { reply?: string; error?: string; message?: string };

      if (!res.ok) {
        // Friendly limit-reached screen for all capacity / rate-limit errors
        if (data.error === "CHAT_LIMIT_REACHED" || res.status === 429) {
          addLimitMessage();
        } else {
          setMessages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), role: "agent", text: data.error ?? "Something went wrong. Please try again." },
          ]);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "agent", text: data.reply ?? "No response." },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "agent", text: "Connection error. Please try again." },
      ]);
    } finally {
      setIsTyping(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); }
  }

  const font: React.CSSProperties = { fontFamily: "'Inter', sans-serif" };

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0a0f1e", ...font }}>
        <div className="w-6 h-6 rounded-full border-2 border-[#3b5bfc] border-t-transparent animate-spin" />
      </div>
    );
  }

  // ── Not available ──
  if (notAvailable || !agent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ backgroundColor: "#0a0f1e", ...font }}>
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
        >
          <AgentAvatar size={40} />
        </div>
        <p className="text-white font-semibold text-lg">This agent is not available</p>
        <p className="text-white/40 text-sm">The agent may be offline or the link may be incorrect.</p>
      </div>
    );
  }

  // ── Chat UI ──
  return (
    <div
      className="min-h-screen flex flex-col items-center"
      style={{ backgroundColor: "#0a0f1e", ...font }}
    >
      <div className="w-full max-w-2xl flex flex-col h-screen">

        {/* Header */}
        <div
          className="flex-shrink-0 px-6 py-5 border-b border-white/5"
          style={{ backgroundColor: "#0d1117" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "rgba(59,91,252,0.2)" }}
            >
              <AgentAvatar size={22} />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">{agent.name}</h1>
              {agent.description && (
                <p className="text-xs text-white/40 mt-0.5 leading-snug">{agent.description}</p>
              )}
            </div>
            <span
              className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
              style={
                limitReached
                  ? { backgroundColor: "rgba(239,68,68,0.15)", color: "#f87171" }
                  : { backgroundColor: "rgba(34,197,94,0.15)", color: "#4ade80" }
              }
            >
              {limitReached ? "Offline" : "Online"}
            </span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-4 min-h-0">
          {messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center py-16">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: "rgba(59,91,252,0.1)", border: "1px solid rgba(59,91,252,0.2)" }}
              >
                <AgentAvatar size={36} />
              </div>
              <p className="text-white/60 text-sm">
                Hi! I'm <span className="text-white font-medium">{agent.name}</span>. How can I help you?
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-end gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            >
              {msg.role === "agent" && (
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mb-0.5"
                  style={{ backgroundColor: msg.isLimit ? "rgba(239,68,68,0.15)" : "rgba(59,91,252,0.15)" }}
                >
                  {msg.isLimit ? "⚠️" : <AgentAvatar size={18} />}
                </div>
              )}

              <div
                className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === "user" ? "whitespace-pre-wrap" : ""}`}
                style={
                  msg.role === "user"
                    ? { backgroundColor: "#3b5bfc", color: "#fff", borderBottomRightRadius: "4px" }
                    : msg.isLimit
                    ? {
                        backgroundColor: "rgba(239,68,68,0.08)",
                        color: "rgba(255,255,255,0.75)",
                        borderBottomLeftRadius: "4px",
                        border: "1px solid rgba(239,68,68,0.20)",
                      }
                    : { backgroundColor: "#1a2235", color: "rgba(255,255,255,0.85)", borderBottomLeftRadius: "4px", border: "1px solid rgba(255,255,255,0.06)" }
                }
              >
                {msg.role === "agent"
                  ? <span className="md-content" dangerouslySetInnerHTML={{ __html: marked.parse(msg.text) as string }} />
                  : msg.text}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex items-end gap-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "rgba(59,91,252,0.15)" }}
              >
                <AgentAvatar size={18} />
              </div>
              <div
                className="px-4 py-3 rounded-2xl flex items-center gap-1.5"
                style={{ backgroundColor: "#1a2235", border: "1px solid rgba(255,255,255,0.06)", borderBottomLeftRadius: "4px" }}
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div
          className="flex-shrink-0 px-4 py-4 border-t border-white/5"
          style={{ backgroundColor: "#0d1117" }}
        >
          {limitReached ? (
            /* Limit reached banner — replaces the input */
            <div
              className="rounded-xl px-4 py-3 text-center"
              style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}
            >
              <p className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>
                This chat session has ended. Please contact the business directly to continue.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {/* Attachment preview */}
              {pendingAttachment && (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                  style={{ backgroundColor: "rgba(59,91,252,0.12)", border: "1px solid rgba(59,91,252,0.2)" }}
                >
                  <span className="text-white/80 flex-1 truncate">{pendingAttachment.label}</span>
                  <button
                    onClick={() => setPendingAttachment(null)}
                    className="text-white/35 hover:text-white/70 transition-colors flex-shrink-0"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              )}

              <div
                className="flex items-center gap-2 rounded-xl px-3 py-3"
                style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,.pdf,.doc,.docx,.txt"
                  onChange={(e) => void handleFileSelect(e)}
                />

                {/* Attach button — only when agent supports images or files */}
                {(agent.input_capabilities?.images || agent.input_capabilities?.files) && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isTyping || uploadingMedia || isRecording}
                    title="Attach file or image"
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors hover:bg-white/8 disabled:opacity-30"
                  >
                    {uploadingMedia ? (
                      <div className="w-3 h-3 rounded-full border border-white/40 border-t-transparent animate-spin" />
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                        <path d="M21.44 11.05L12.25 20.24a5 5 0 01-7.07-7.07l9.19-9.19a3.5 3.5 0 014.95 4.95L10.12 18.17a2 2 0 01-2.83-2.83l8.49-8.48" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                )}

                {/* Voice button — only when agent supports voice */}
                {agent.input_capabilities?.voice && (
                  <button
                    onClick={() => void toggleRecording()}
                    disabled={isTyping || uploadingMedia}
                    title={isRecording ? "Stop recording" : "Record voice note"}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-30 ${isRecording ? "bg-red-500/20" : "hover:bg-white/8"}`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <rect x="9" y="2" width="6" height="11" rx="3" stroke={isRecording ? "#f87171" : "rgba(255,255,255,0.4)"} strokeWidth="2"/>
                      <path d="M5 10a7 7 0 0014 0" stroke={isRecording ? "#f87171" : "rgba(255,255,255,0.4)"} strokeWidth="2" strokeLinecap="round"/>
                      <line x1="12" y1="17" x2="12" y2="21" stroke={isRecording ? "#f87171" : "rgba(255,255,255,0.4)"} strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}

                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isRecording ? "Recording… tap mic to stop" : "Type a message…"}
                  disabled={isTyping}
                  className="flex-1 bg-transparent text-sm text-white placeholder-white/25 outline-none disabled:opacity-50"
                />
                <button
                  onClick={() => void sendMessage()}
                  disabled={(!input.trim() && !pendingAttachment) || isTyping}
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-30"
                  style={{ backgroundColor: "#3b5bfc" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
          )}

          <p className="text-center text-[11px] text-white/20 mt-3">
            Powered by{" "}
            <span className="text-white/35 font-medium">EverydayAI</span>
          </p>
        </div>

      </div>
    </div>
  );
}
