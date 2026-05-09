import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, Send, Trash2 } from "lucide-react";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

// ── Markdown renderer (lightweight, no external dep) ─────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
      `<pre style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.10);border-radius:8px;padding:12px 14px;overflow-x:auto;margin:10px 0;font-size:13px;line-height:1.6;"><code class="language-${lang}">${code.trim()}</code></pre>`
    )
    .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-size:0.9em;">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^#{3}\s(.+)$/gm, '<h3 style="font-size:15px;font-weight:700;color:#fff;margin:14px 0 6px;">$1</h3>')
    .replace(/^#{2}\s(.+)$/gm, '<h2 style="font-size:17px;font-weight:700;color:#fff;margin:16px 0 8px;">$1</h2>')
    .replace(/^#{1}\s(.+)$/gm, '<h1 style="font-size:19px;font-weight:700;color:#fff;margin:18px 0 8px;">$1</h1>')
    .replace(/^[-*]\s(.+)$/gm, '<li style="margin:3px 0;padding-left:4px;">$1</li>')
    .replace(/(<li[\s\S]*?<\/li>)/g, '<ul style="padding-left:20px;margin:8px 0;">$1</ul>')
    .replace(/\n\n/g, '</p><p style="margin:0 0 10px;">')
    .replace(/\n/g, "<br />");
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
      style={{ marginBottom: "16px" }}
    >
      {/* Avatar */}
      <div
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
        style={{
          backgroundColor: isUser ? "#3b5bfc" : "rgba(168,85,247,0.20)",
          color: isUser ? "#fff" : "#a855f7",
          border: isUser ? "none" : "1px solid rgba(168,85,247,0.30)",
        }}
      >
        {isUser ? "A" : <Bot size={14} />}
      </div>

      {/* Bubble */}
      <div
        className="max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
        style={{
          backgroundColor: isUser ? "#3b5bfc" : "rgba(255,255,255,0.05)",
          color: isUser ? "#fff" : "rgba(255,255,255,0.85)",
          border: isUser ? "none" : "1px solid rgba(255,255,255,0.08)",
          borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
        }}
      >
        {isUser ? (
          <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
        ) : (
          <div
            dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
            style={{ lineHeight: "1.65" }}
          />
        )}
      </div>
    </div>
  );
}

// ── Thinking indicator ────────────────────────────────────────────────────────

function ThinkingBubble() {
  return (
    <div className="flex gap-3 flex-row" style={{ marginBottom: "16px" }}>
      <div
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
        style={{
          backgroundColor: "rgba(168,85,247,0.20)",
          color: "#a855f7",
          border: "1px solid rgba(168,85,247,0.30)",
        }}
      >
        <Bot size={14} />
      </div>
      <div
        className="flex items-center gap-1.5 px-4 py-3 rounded-2xl"
        style={{
          backgroundColor: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "18px 18px 18px 4px",
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: "rgba(168,85,247,0.70)",
              animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminDevBot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { role: "user", content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError("");

    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const token = await getToken();
      const res = await fetch("/api/devbot/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: trimmed,
          history: messages,
        }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as { reply: string };
      setMessages([...newMessages, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "DevBot failed to respond");
      setMessages(newMessages);
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }

  function clearChat() {
    setMessages([]);
    setError("");
  }

  return (
    <AdminLayout activeItemId="devbot">
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40%            { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>

      <div
        className="flex flex-col h-screen"
        style={{ backgroundColor: "#0a0f1e" }}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
          style={{ backgroundColor: "#0d1117", borderColor: "rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: "rgba(168,85,247,0.18)", border: "1px solid rgba(168,85,247,0.30)" }}
            >
              <Bot size={18} style={{ color: "#a855f7" }} />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">DevBot</h1>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.40)" }}>
                Your private AI developer
              </p>
            </div>
          </div>

          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
              style={{
                backgroundColor: "rgba(239,68,68,0.10)",
                color: "#ef4444",
                border: "1px solid rgba(239,68,68,0.20)",
              }}
            >
              <Trash2 size={13} />
              Clear
            </button>
          )}
        </div>

        {/* ── Messages area ── */}
        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
          <div className="max-w-3xl mx-auto">
            {messages.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.25)" }}
                >
                  <Bot size={28} style={{ color: "#a855f7" }} />
                </div>
                <div>
                  <p className="text-white font-semibold text-lg">DevBot is ready</p>
                  <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.40)" }}>
                    Ask anything about the EverydayAI codebase, architecture, or get help writing features.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  {[
                    "How does the chat route work?",
                    "Show me how to add a new admin page",
                    "Explain the API key encryption",
                    "How do tool calls work in agents?",
                  ].map((hint) => (
                    <button
                      key={hint}
                      onClick={() => setInput(hint)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium transition-opacity hover:opacity-80"
                      style={{
                        backgroundColor: "rgba(59,91,252,0.10)",
                        color: "rgba(255,255,255,0.60)",
                        border: "1px solid rgba(59,91,252,0.25)",
                      }}
                    >
                      {hint}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}

            {loading && <ThinkingBubble />}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div
            className="mx-4 mb-2 md:mx-8 px-4 py-2.5 rounded-xl text-sm flex-shrink-0"
            style={{
              backgroundColor: "rgba(239,68,68,0.10)",
              color: "#ef4444",
              border: "1px solid rgba(239,68,68,0.20)",
            }}
          >
            {error}
          </div>
        )}

        {/* ── Input bar ── */}
        <div
          className="px-4 pb-4 pt-3 md:px-8 flex-shrink-0 border-t"
          style={{ borderColor: "rgba(255,255,255,0.06)", backgroundColor: "#0d1117" }}
        >
          <div className="max-w-3xl mx-auto flex gap-3 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Ask DevBot anything about the codebase…"
              rows={1}
              className="flex-1 resize-none rounded-xl px-4 py-3 text-sm outline-none transition-colors"
              style={{
                backgroundColor: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "#fff",
                minHeight: "44px",
                maxHeight: "160px",
                lineHeight: "1.5",
              }}
              onFocus={(e) => {
                e.currentTarget.style.border = "1px solid rgba(59,91,252,0.50)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.border = "1px solid rgba(255,255,255,0.10)";
              }}
            />
            <button
              onClick={() => void sendMessage()}
              disabled={!input.trim() || loading}
              className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#3b5bfc" }}
              aria-label="Send"
            >
              <Send size={16} style={{ color: "#fff" }} />
            </button>
          </div>
          <p className="text-center text-xs mt-2" style={{ color: "rgba(255,255,255,0.20)" }}>
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
