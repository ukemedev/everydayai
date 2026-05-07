import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { supabase } from "@/lib/supabase";

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

interface Document {
  id: string;
  agent_id: string;
  file_name: string;
  file_size: number | null;
  file_type: string | null;
  storage_path: string | null;
  created_at: string;
}

interface Message {
  id: string;
  role: "user" | "agent";
  text: string;
  type?: "no-key";
  provider?: string;
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
}

function ChatPanel({ agentId, instructions, model, docCount }: ChatPanelProps) {
  const [, navigate] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
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

    // Fetch the user's API key for this provider from Supabase
    const { data: keyData } = await supabase
      .from("api_keys")
      .select("api_key")
      .eq("provider", provider)
      .maybeSingle();

    if (!keyData?.api_key) {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "agent", type: "no-key", provider, text: "" },
      ]);
      setIsTyping(false);
      return;
    }

    // Build conversation history in OpenAI format (all previous messages)
    const conversationHistory = messages.map((m) => ({
      role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
      content: m.text,
    }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          instructions: instructions.trim() || "You are a helpful assistant.",
          model,
          provider,
          apiKey: keyData.api_key,
          conversationHistory,
          agentId,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Request failed");

      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "agent", text: data.reply ?? "No response." },
      ]);
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
                      <p className="text-amber-400/90 text-xs mb-1.5 font-medium">No API key found</p>
                      <p className="text-white/60 text-xs leading-relaxed">
                        You need to add a{" "}
                        <span className="text-white/80 capitalize">{msg.provider}</span> API key to use this model.
                      </p>
                      <button
                        onClick={() => navigate("/settings")}
                        className="mt-2.5 text-xs text-[#3b5bfc] hover:underline"
                      >
                        → Go to Settings to add your key
                      </button>
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
                    className="max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words"
                    style={
                      msg.role === "user"
                        ? { backgroundColor: "#3b5bfc", color: "#fff", borderBottomRightRadius: "4px" }
                        : { backgroundColor: "#1a2235", color: "rgba(255,255,255,0.85)", borderBottomLeftRadius: "4px" }
                    }
                  >
                    {msg.text}
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
  );
}

// ─── Studio ───────────────────────────────────────────────────────────────────

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

  const [showDeployModal, setShowDeployModal] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState("");

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
        }
        setLoading(false);
      });
  }, [agentId]);

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
    if (!allowed.includes(ext)) return;
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setUploadError("Not authenticated.");
      setUploading(false);
      return;
    }

    const ext = stagedFile.name.split(".").pop();
    const safeName = `${Date.now()}_${stagedFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const storagePath = `${user.id}/${agent.id}/${safeName}`;

    const { error: storageError } = await supabase.storage
      .from("documents")
      .upload(storagePath, stagedFile, { upsert: false });

    if (storageError) {
      setUploadError("Upload failed: " + storageError.message);
      setUploading(false);
      return;
    }

    const { data: docRecord, error: dbError } = await supabase
      .from("documents")
      .insert({
        agent_id: agent.id,
        user_id: user.id,
        file_name: stagedFile.name,
        file_size: stagedFile.size,
        file_type: ext ?? null,
        storage_path: storagePath,
      })
      .select()
      .single();

    if (dbError) {
      await supabase.storage.from("documents").remove([storagePath]);
      setUploadError("Failed to save record: " + dbError.message);
      setUploading(false);
      return;
    }

    setDocuments((prev) => [docRecord as Document, ...prev]);
    setStagedFile(null);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    showToast("Document uploaded!");
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
    setPublishing(false);
    if (!error) {
      setAgent((prev) => prev ? { ...prev, status: "live" } : prev);
      setShowDeployModal(false);
      showToast("Agent is now Live! 🎉");
    }
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
        className="flex items-center justify-between px-8 py-4 border-b border-white/5 flex-shrink-0 z-10"
        style={{ backgroundColor: "#0d1117" }}
      >
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={() => navigate("/dashboard")}
            className="text-white/40 hover:text-white/80 text-sm transition-colors duration-150 flex items-center gap-1.5 flex-shrink-0"
          >
            ← Dashboard
          </button>
          <span className="text-white/20 text-sm">|</span>
          <div className="min-w-0">
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
          <button
            onClick={() => navigate("/settings")}
            className="px-3.5 py-2 rounded-lg text-sm font-medium text-white/50 border border-white/10 hover:border-white/20 hover:text-white/75 transition-all duration-150 flex items-center gap-1.5"
          >
            <span className="text-sm">⚙️</span>
            Settings
          </button>
          {isLive ? (
            <button
              onClick={handleUnpublish}
              disabled={publishing}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white/60 border border-white/10 hover:border-red-500/30 hover:text-red-400 transition-all duration-150 disabled:opacity-50"
            >
              {publishing ? "Saving…" : "Unpublish"}
            </button>
          ) : (
            <button
              onClick={() => setShowDeployModal(true)}
              disabled={publishing}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: "#3b5bfc" }}
            >
              Deploy
            </button>
          )}
          <button className="px-4 py-2 rounded-lg text-sm font-medium text-white/60 border border-white/10 hover:border-white/20 hover:text-white/80 transition-all duration-150">
            Share
          </button>
          <button className="px-4 py-2 rounded-lg text-sm font-medium text-white/60 border border-white/10 hover:border-white/20 hover:text-white/80 transition-all duration-150">
            Version History
          </button>
        </div>
      </header>

      {/* Body: two columns */}
      <div className="flex flex-1 min-h-0">

        {/* ── Left column: tabs + content ── */}
        <div className="flex flex-col min-h-0" style={{ width: "60%" }}>
          {/* Tabs */}
          <div className="flex items-center gap-1 px-8 pt-4 border-b border-white/5 flex-shrink-0">
            {tabs.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="px-4 py-2 text-sm font-medium transition-all duration-150 relative"
                  style={{ color: isActive ? "#fff" : "rgba(255,255,255,0.4)" }}
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
          <div className="flex-1 overflow-y-auto min-h-0 px-8 py-6">
            {activeTab === "Prompt" && (
              <div className="flex flex-col gap-6 max-w-xl">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-white/70">Model</label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-64 rounded-lg px-4 py-2.5 text-sm text-white border border-white/10 outline-none focus:border-[#3b5bfc] transition-colors appearance-none cursor-pointer"
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

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-white/70">Instructions</label>
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Write your agent instructions here..."
                    rows={16}
                    className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 border border-white/10 outline-none focus:border-[#3b5bfc] transition-colors resize-none leading-relaxed"
                    style={{ backgroundColor: "#111827" }}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: "#3b5bfc" }}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  {savedMsg && <span className="text-sm text-green-400">✓ Saved</span>}
                </div>
              </div>
            )}

            {activeTab === "Knowledge" && (
              <div className="flex flex-col gap-6 p-8">
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
                        <div className="flex items-center gap-2 flex-shrink-0">
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
              <div className="flex flex-col gap-8 p-8 overflow-y-auto">

                {/* ── Section 1: AI Tool Builder ── */}
                <div className="flex flex-col gap-4">
                  <div>
                    <h2 className="text-base font-semibold text-white">Build a Tool</h2>
                    <p className="text-sm text-white/40 mt-1">
                      Describe what you want your agent to do in plain English
                    </p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <textarea
                      rows={4}
                      placeholder={"e.g. When a customer gives their name and phone number, save it to my Google Sheet automatically"}
                      className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 border border-white/10 outline-none focus:border-[#3b5bfc]/60 transition-colors resize-none leading-relaxed"
                      style={{ backgroundColor: "#111827" }}
                    />
                    <div className="flex flex-col gap-2">
                      <button
                        className="self-start px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
                        style={{ backgroundColor: "#3b5bfc" }}
                      >
                        Build Tool with AI
                      </button>
                      <p className="text-xs text-white/30">
                        AI will analyze your request and set up the right integration
                      </p>
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-white/5" />

                {/* ── Section 2: Connected Tools ── */}
                <div className="flex flex-col gap-3">
                  <h2 className="text-base font-semibold text-white">Connected Tools</h2>

                  {/* Empty state */}
                  <div
                    className="rounded-xl border border-dashed border-white/10 flex flex-col items-center justify-center gap-2 py-10 px-6 text-center"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center mb-1"
                      style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="rgba(255,255,255,0.25)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="rgba(255,255,255,0.25)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        <circle cx="19" cy="5" r="3" stroke="rgba(255,255,255,0.25)" strokeWidth="1.8"/>
                        <path d="M16 2l-2 2 4 4 2-2" stroke="rgba(255,255,255,0.25)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-white/35">No tools connected yet</p>
                    <p className="text-xs text-white/22 leading-relaxed max-w-[220px]">
                      Describe a tool above and AI will build it for you
                    </p>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-white/5" />

                {/* ── Section 3: Available Connectors ── */}
                <div className="flex flex-col gap-4">
                  <h2 className="text-base font-semibold text-white">Available Connectors</h2>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { icon: "📊", name: "Google Sheets", desc: "Save data to spreadsheets",       soon: false },
                      { icon: "💬", name: "WhatsApp",      desc: "Send WhatsApp messages",          soon: true  },
                      { icon: "📱", name: "Telegram",      desc: "Send Telegram notifications",     soon: false },
                      { icon: "📧", name: "Gmail",         desc: "Send emails automatically",       soon: false },
                      { icon: "📸", name: "Instagram",     desc: "Post or reply on Instagram",      soon: true  },
                    ].map(({ icon, name, desc, soon }) => (
                      <div
                        key={name}
                        className="relative rounded-xl border border-white/8 px-4 py-3.5 flex items-center gap-3 transition-all duration-150"
                        style={{
                          backgroundColor: "#111827",
                          opacity: soon ? 0.6 : 1,
                        }}
                      >
                        <span className="text-xl flex-shrink-0">{icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-medium text-white">{name}</p>
                            {soon && (
                              <span
                                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                                style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}
                              >
                                Soon
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-white/35 mt-0.5 truncate">{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>

        {/* ── Right column: chat panel ── */}
        <div
          className="flex flex-col overflow-hidden"
          style={{ width: "40%", position: "sticky", top: 0, height: "100vh", flexShrink: 0 }}
        >
          <ChatPanel agentId={agent.id} instructions={instructions} model={model} docCount={documents.length} />
        </div>
      </div>

      {/* ── Deploy confirmation modal ── */}
      {showDeployModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(2px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowDeployModal(false); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 px-7 py-7 flex flex-col gap-5"
            style={{ backgroundColor: "#111827", fontFamily: "'Inter', sans-serif" }}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white">Publish Your Agent</h2>
                <p className="text-sm text-white/45 mt-2 leading-relaxed">
                  Any changes made will immediately go Live. Are you sure you want to continue?
                </p>
              </div>
              <button
                onClick={() => setShowDeployModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-all flex-shrink-0 text-lg leading-none"
              >
                ×
              </button>
            </div>

            {/* Status preview */}
            <div
              className="flex items-center gap-3 rounded-xl px-4 py-3 border border-white/5"
              style={{ backgroundColor: "rgba(34,197,94,0.06)" }}
            >
              <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
              <p className="text-sm text-white/70">
                <span className="text-white font-medium">{agent.name}</span> will be set to{" "}
                <span className="text-green-400 font-medium">Live</span>
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowDeployModal(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white/55 border border-white/10 hover:border-white/20 hover:text-white/75 transition-all duration-150"
              >
                Go Back
              </button>
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: "#3b5bfc" }}
              >
                {publishing ? "Publishing…" : "Yes, I'm Sure"}
              </button>
            </div>
          </div>
        </div>
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
