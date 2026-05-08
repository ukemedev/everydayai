import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { marked } from "marked";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentInfo {
  id: string;
  name: string;
  description: string | null;
  status: string;
  model: string;
}

interface Message {
  id: string;
  role: "user" | "agent";
  text: string;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

// ─── Chat page ────────────────────────────────────────────────────────────────

export default function Chat() {
  const { agentId } = useParams<{ agentId: string }>();

  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notAvailable, setNotAvailable] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  async function sendMessage() {
    const text = input.trim();
    if (!text || isTyping) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    const conversationHistory: ConversationMessage[] = messages.map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.text,
    }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, agentId, conversationHistory }),
      });

      const data = await res.json() as { reply?: string; error?: string };

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "agent", text: data.error ?? "Something went wrong. Please try again." },
        ]);
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
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
          style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
        >
          🤖
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
      {/* Centered chat container */}
      <div className="w-full max-w-2xl flex flex-col h-screen">

        {/* Header */}
        <div
          className="flex-shrink-0 px-6 py-5 border-b border-white/5"
          style={{ backgroundColor: "#0d1117" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
              style={{ backgroundColor: "rgba(59,91,252,0.2)" }}
            >
              🤖
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">{agent.name}</h1>
              {agent.description && (
                <p className="text-xs text-white/40 mt-0.5 leading-snug">{agent.description}</p>
              )}
            </div>
            <span
              className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: "rgba(34,197,94,0.15)", color: "#4ade80" }}
            >
              Online
            </span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-4 min-h-0">
          {messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center py-16">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
                style={{ backgroundColor: "rgba(59,91,252,0.1)", border: "1px solid rgba(59,91,252,0.2)" }}
              >
                🤖
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
              {/* Robot avatar for agent */}
              {msg.role === "agent" && (
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0 mb-0.5"
                  style={{ backgroundColor: "rgba(59,91,252,0.15)" }}
                >
                  🤖
                </div>
              )}

              <div
                className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === "user" ? "whitespace-pre-wrap" : ""}`}
                style={
                  msg.role === "user"
                    ? { backgroundColor: "#3b5bfc", color: "#fff", borderBottomRightRadius: "4px" }
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
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                style={{ backgroundColor: "rgba(59,91,252,0.15)" }}
              >
                🤖
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
          <div
            className="flex items-center gap-2 rounded-xl px-4 py-3"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message…"
              disabled={isTyping}
              className="flex-1 bg-transparent text-sm text-white placeholder-white/25 outline-none disabled:opacity-50"
            />
            <button
              onClick={() => void sendMessage()}
              disabled={!input.trim() || isTyping}
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-30"
              style={{ backgroundColor: "#3b5bfc" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          {/* Footer */}
          <p className="text-center text-[11px] text-white/20 mt-3">
            Powered by{" "}
            <span className="text-white/35 font-medium">EverydayAI</span>
          </p>
        </div>

      </div>
    </div>
  );
}
