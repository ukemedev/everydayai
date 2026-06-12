import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { AgentAvatar } from "@/components/AgentAvatar";

interface Message {
  id:   string;
  role: "user" | "agent";
  text: string;
}

interface ConversationMessage {
  role:    "user" | "assistant";
  content: string;
}

interface Props {
  agentId:   string;
  agentName: string;
  onClose:   () => void;
  onTested:  () => void;
}

export default function OnboardingChatModal({ agentId, agentName, onClose, onTested }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input,    setInput]    = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [markedTested, setMarkedTested] = useState(false);
  const endRef   = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 200);
    setMessages([{
      id:   "intro",
      role: "agent",
      text: `Hi! I'm ${agentName}. Ask me anything to see how I respond to your customers.`,
    }]);
  }, [agentName]);

  async function markTested() {
    if (markedTested) return;
    setMarkedTested(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    void fetch("/api/onboarding/mark-tested", {
      method:  "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).catch(() => {});
    onTested();
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || isTyping) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    void markTested();

    const history: ConversationMessage[] = messages.map((m) => ({
      role:    m.role === "user" ? "user" : "assistant",
      content: m.text,
    }));

    try {
      const res  = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: text, agentId, conversationHistory: history, attachments: [] }),
      });
      const data = await res.json() as { reply?: string; error?: string };
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "agent", text: data.reply ?? data.error ?? "No response." },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "agent", text: "Connection error. Please try again." },
      ]);
    } finally {
      setIsTyping(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0"
      style={{ backgroundColor: "rgba(0,0,0,0.70)", backdropFilter: "blur(4px)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        className="w-full max-w-lg flex flex-col rounded-2xl border overflow-hidden"
        style={{ backgroundColor: "#111827", borderColor: "rgba(255,255,255,0.08)", height: "min(560px, 80vh)" }}
        initial={{ y: 40, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 340, damping: 30 }}
      >
        {/* Header */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "rgba(59,91,252,0.2)" }}
            ><AgentAvatar size={20} /></div>
            <div>
              <p className="text-sm font-semibold text-white">{agentName}</p>
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>Test mode</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-xl transition-colors hover:bg-white/5"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >×</button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {messages.map((m) => (
            <motion.div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div
                className="max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
                style={m.role === "user"
                  ? { backgroundColor: "#3b5bfc", color: "#fff" }
                  : { backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.85)" }
                }
              >
                {m.text}
              </div>
            </motion.div>
          ))}

          {isTyping && (
            <motion.div
              className="flex justify-start"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div
                className="px-4 py-3 rounded-2xl flex items-center gap-1"
                style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
              >
                {[0, 0.15, 0.3].map((delay, i) => (
                  <motion.span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: "rgba(255,255,255,0.4)" }}
                    animate={{ y: [0, -4, 0] }}
                    transition={{ repeat: Infinity, duration: 0.7, delay, ease: "easeInOut" }}
                  />
                ))}
              </div>
            </motion.div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div
          className="flex-shrink-0 px-4 py-3 border-t flex items-center gap-2"
          style={{ borderColor: "rgba(255,255,255,0.07)" }}
        >
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a message…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={isTyping}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm text-white outline-none disabled:opacity-50"
            style={{ backgroundColor: "#0a0f1e", border: "1px solid rgba(255,255,255,0.08)" }}
          />
          <button
            onClick={() => void sendMessage()}
            disabled={!input.trim() || isTyping}
            className="w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center transition-all hover:opacity-90 active:scale-95 disabled:opacity-30"
            style={{ backgroundColor: "#3b5bfc" }}
          >
            <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
