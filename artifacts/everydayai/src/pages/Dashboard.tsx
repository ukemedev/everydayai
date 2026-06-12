import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import AppLayout from "@/components/AppLayout";
import { AgentAvatar } from "@/components/AgentAvatar";
import UpgradeModal from "@/components/UpgradeModal";
import OnboardingCard from "@/components/OnboardingCard";

const modelOptions = [
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "gpt-4o",      label: "GPT-4o" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
];

const STEP3_SKIP_KEY = "everydayai-onboarding-step3-skipped";

// ─── Business type templates ──────────────────────────────────────────────────

const BUSINESS_TYPES = [
  { id: "restaurant",   label: "Restaurant",      emoji: "🍽️" },
  { id: "store",        label: "Online Store",     emoji: "🛍️" },
  { id: "clinic",       label: "Clinic / Hospital",emoji: "🏥" },
  { id: "service",      label: "Service Business", emoji: "🔧" },
  { id: "other",        label: "Other",            emoji: "✨" },
] as const;

type BusinessTypeId = typeof BUSINESS_TYPES[number]["id"];

function getTemplate(type: BusinessTypeId): { name: string; description: string } {
  switch (type) {
    case "restaurant":
      return {
        name:        "Food Assistant",
        description: "I help customers with our menu, prices, opening hours, and food orders. Ask me about our dishes, daily specials, or delivery options.",
      };
    case "store":
      return {
        name:        "Store Assistant",
        description: "I help customers find products, check prices and availability, track orders, and get answers to shopping questions.",
      };
    case "clinic":
      return {
        name:        "Health Assistant",
        description: "I help patients book appointments, check our services and opening hours, and answer general health questions. For medical advice, please consult your doctor.",
      };
    case "service":
      return {
        name:        "Service Assistant",
        description: "I help customers get quotes, book appointments, learn about our services, and find answers to common questions about how we work.",
      };
    default:
      return {
        name:        "Customer Assistant",
        description: "I help customers with questions about our business, products, and services. How can I help you today?",
      };
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Agent {
  id:          string;
  name:        string;
  description: string | null;
  model:       string;
  status:      string;
  created_at:  string;
}

interface Profile {
  onboarding_complete: boolean;
  has_tested_chat:     boolean;
  full_name?:          string;
  completed_steps?:    string[];
}

// ─── Create Agent Modal ────────────────────────────────────────────────────────

interface CreateAgentModalProps {
  onClose:        () => void;
  onCreated:      () => void;
  onLimitReached: () => void;
  isOnboarding:   boolean;
}

function CreateAgentModal({ onClose, onCreated, onLimitReached, isOnboarding }: CreateAgentModalProps) {
  const [step,              setStep]              = useState<"pick" | "details">(isOnboarding ? "pick" : "details");
  const [selectedType,      setSelectedType]      = useState<BusinessTypeId | null>(null);
  const [agentName,         setAgentName]         = useState("");
  const [agentDescription,  setAgentDescription]  = useState("");
  const [model,             setModel]             = useState("gpt-4o-mini");
  const [loading,           setLoading]           = useState(false);
  const [error,             setError]             = useState("");
  const [nameError,         setNameError]         = useState("");

  function handlePickType(type: BusinessTypeId) {
    setSelectedType(type);
    const tpl = getTemplate(type);
    setAgentName(tpl.name);
    setAgentDescription(tpl.description);
    setStep("details");
  }

  async function handleCreate() {
    setNameError(""); setError("");
    if (!agentName.trim()) { setNameError("Agent name is required."); return; }
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("You must be logged in."); setLoading(false); return; }

      const res = await fetch("/api/agents", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body:    JSON.stringify({
          name:        agentName.trim(),
          description: agentDescription.trim() || undefined,
          model,
        }),
      });

      const data = await res.json() as { error?: string };
      if (!res.ok) {
        if (data.error === "AGENT_LIMIT_REACHED") { onClose(); onLimitReached(); return; }
        setError(data.error ?? "Failed to create agent"); return;
      }
      onCreated();
    } catch { setError("Something went wrong. Please try again."); }
    finally { setLoading(false); }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        className="w-full max-w-md rounded-2xl border overflow-hidden"
        style={{ backgroundColor: "#111827", borderColor: "rgba(255,255,255,0.08)" }}
        initial={{ scale: 0.96, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 340, damping: 28 }}
      >
        <AnimatePresence mode="wait">

          {/* Step 1 — Business type picker */}
          {step === "pick" && (
            <motion.div
              key="pick"
              className="px-7 py-7 flex flex-col gap-5"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">What's your business?</h2>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                    We'll pre-fill your agent template
                  </p>
                </div>
                <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-xl" style={{ color: "rgba(255,255,255,0.35)" }}>×</button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {BUSINESS_TYPES.map((bt) => (
                  <button
                    key={bt.id}
                    onClick={() => handlePickType(bt.id)}
                    className="flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-all hover:border-[#3b5bfc]/60 hover:bg-[#3b5bfc]/5 active:scale-95"
                    style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "#0a0f1e" }}
                  >
                    <span className="text-2xl">{bt.emoji}</span>
                    <span className="text-sm font-medium text-white leading-tight">{bt.label}</span>
                  </button>
                ))}
              </div>

              <button
                onClick={() => setStep("details")}
                className="text-sm text-center transition-colors"
                style={{ color: "rgba(255,255,255,0.30)" }}
              >
                Skip and enter manually →
              </button>
            </motion.div>
          )}

          {/* Step 2 — Agent details */}
          {step === "details" && (
            <motion.div
              key="details"
              className="px-7 py-7 flex flex-col gap-5"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isOnboarding && (
                    <button
                      onClick={() => setStep("pick")}
                      className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-white/5"
                      style={{ color: "rgba(255,255,255,0.40)" }}
                    >
                      ←
                    </button>
                  )}
                  <h2 className="text-lg font-bold text-white">
                    {selectedType
                      ? `${BUSINESS_TYPES.find((b) => b.id === selectedType)?.emoji} Name your agent`
                      : "Create a New Agent"}
                  </h2>
                </div>
                <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-xl" style={{ color: "rgba(255,255,255,0.35)" }}>×</button>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>Agent Name</label>
                <input
                  type="text" placeholder="e.g. Mama's Kitchen Assistant"
                  value={agentName} onChange={(e) => { setAgentName(e.target.value); setNameError(""); }}
                  className="w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none"
                  style={{ backgroundColor: "#0a0f1e", border: `1px solid ${nameError ? "#f87171" : "rgba(255,255,255,0.08)"}` }}
                />
                {nameError && <p className="text-xs text-red-400">{nameError}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>Instructions</label>
                <textarea
                  placeholder="Describe what your agent does"
                  value={agentDescription} onChange={(e) => setAgentDescription(e.target.value)}
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
                  {modelOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>

              {error && <p className="text-sm text-red-400 text-center -mt-1">{error}</p>}

              <div className="flex flex-col gap-3 pt-1">
                <button
                  onClick={() => void handleCreate()} disabled={loading}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
                  style={{ backgroundColor: "#3b5bfc" }}
                >{loading ? "Creating…" : "Create Agent"}</button>
                <button onClick={onClose} disabled={loading} className="text-sm text-center disabled:opacity-50" style={{ color: "rgba(255,255,255,0.35)" }}>Cancel</button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ─── Delete Confirm Modal ──────────────────────────────────────────────────────

interface DeleteConfirmModalProps {
  agent:    Agent;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteConfirmModal({ agent, deleting, onCancel, onConfirm }: DeleteConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.70)", backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !deleting) onCancel(); }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border px-7 py-7 flex flex-col gap-5"
        style={{ backgroundColor: "#111827", borderColor: "rgba(255,255,255,0.08)" }}
      >
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl" style={{ backgroundColor: "rgba(239,68,68,0.15)" }}>
            🗑️
          </div>
          <div>
            <h2 className="text-base font-bold text-white mb-1.5">Delete Agent?</h2>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
              This will permanently delete <span className="text-white font-medium">"{agent.name}"</span> and all its
              data including knowledge base and tools. This cannot be undone.
            </p>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={onCancel} disabled={deleting}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)" }}
          >Cancel</button>
          <button
            onClick={onConfirm} disabled={deleting}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ backgroundColor: "#dc2626" }}
          >
            {deleting ? (
              <><span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />Deleting…</>
            ) : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Agent Card ───────────────────────────────────────────────────────────────

interface AgentCardProps {
  agent:          Agent;
  onRequestDelete:(agent: Agent) => void;
  onRename:       (id: string, newName: string) => Promise<void>;
}

function AgentCard({ agent, onRequestDelete, onRename }: AgentCardProps) {
  const [, navigate]            = useLocation();
  const [menuOpen, setMenuOpen]         = useState(false);
  const [isRenaming, setIsRenaming]     = useState(false);
  const [renameValue, setRenameValue]   = useState(agent.name);
  const [renameSaving, setRenameSaving] = useState(false);
  const menuRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const modelLabel = modelOptions.find((m) => m.value === agent.model)?.label ?? agent.model;
  const isLive     = agent.status === "live";

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  useEffect(() => {
    if (isRenaming) setTimeout(() => inputRef.current?.focus(), 0);
  }, [isRenaming]);

  function startRename() { setMenuOpen(false); setRenameValue(agent.name); setIsRenaming(true); }

  async function commitRename() {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === agent.name) { setIsRenaming(false); return; }
    setRenameSaving(true);
    await onRename(agent.id, trimmed);
    setRenameSaving(false);
    setIsRenaming(false);
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); void commitRename(); }
    if (e.key === "Escape") setIsRenaming(false);
  }

  return (
    <div
      className="h-40 rounded-2xl border p-4 flex flex-col justify-between transition-all duration-200 cursor-pointer relative group"
      style={{ backgroundColor: "#111827", borderColor: "rgba(255,255,255,0.08)" }}
      onClick={() => { if (!menuOpen && !isRenaming) navigate(`/studio/${agent.id}`); }}
    >
      <div ref={menuRef} className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="w-7 h-7 rounded-md flex items-center justify-center text-sm font-bold opacity-40 hover:opacity-100 active:opacity-100 group-hover:opacity-100 transition-opacity duration-150 hover:bg-white/10"
          style={{ color: "rgba(255,255,255,0.8)" }}
          title="Options"
        >···</button>

        {menuOpen && (
          <div
            className="absolute right-0 top-8 w-36 rounded-xl border overflow-hidden shadow-xl z-20"
            style={{ backgroundColor: "#1a2235", borderColor: "rgba(255,255,255,0.10)" }}
          >
            <button
              onClick={() => { setMenuOpen(false); navigate(`/studio/${agent.id}`); }}
              className="w-full text-left px-4 py-2.5 text-xs text-white/70 hover:bg-white/5 transition-colors"
            >Edit</button>
            <button
              onClick={startRename}
              className="w-full text-left px-4 py-2.5 text-xs text-white/70 hover:bg-white/5 transition-colors"
            >Rename</button>
            <div style={{ height: "1px", backgroundColor: "rgba(255,255,255,0.06)" }} />
            <button
              onClick={() => { setMenuOpen(false); onRequestDelete(agent); }}
              className="w-full text-left px-4 py-2.5 text-xs font-medium hover:bg-red-500/10 transition-colors"
              style={{ color: "#f87171" }}
            >Delete</button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 overflow-hidden pr-6">
        {isRenaming ? (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={() => void commitRename()}
              disabled={renameSaving}
              className="flex-1 bg-transparent text-sm font-semibold text-white outline-none border-b border-[#3b5bfc] min-w-0"
              style={{ caretColor: "#3b5bfc" }}
            />
            {renameSaving
              ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin flex-shrink-0" />
              : (
                <button
                  onMouseDown={(e) => { e.preventDefault(); void commitRename(); }}
                  className="text-[#3b5bfc] hover:opacity-70 flex-shrink-0 text-base leading-none"
                  title="Save"
                >✓</button>
              )
            }
          </div>
        ) : (
          <p className="text-sm font-semibold text-white truncate">{agent.name}</p>
        )}
        {agent.description && !isRenaming && (
          <p className="text-xs line-clamp-2 leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>
            {agent.description}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mt-2">
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(59,91,252,0.18)", color: "#7b93ff" }}>
          {modelLabel}
        </span>
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded-full capitalize"
          style={isLive
            ? { backgroundColor: "rgba(34,197,94,0.15)", color: "#4ade80" }
            : { backgroundColor: "rgba(251,146,60,0.15)", color: "#fb923c" }}
        >{agent.status}</span>
      </div>
    </div>
  );
}

// ─── Analytics Section ─────────────────────────────────────────────────────────

interface AnalyticsData {
  summary: {
    totalAgents: number;
    liveAgents: number;
    totalConversations: number;
    conversationsToday: number;
    totalMessages: number;
    messagesToday: number;
  };
  planUsage: {
    plan: string;
    messageCount: number;
    messageLimit: number | null;
    agentCount: number;
    agentLimit: number | null;
  };
  dailyVolume: number[];
  activity: {
    id: string;
    role: string;
    preview: string;
    created_at: string;
    conversation_name: string;
  }[];
}

function AnalyticsSection({ agents }: { agents: Agent[] }) {
  const [, navigate] = useLocation();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalytics() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      try {
        const res = await fetch("/api/analytics", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const json = await res.json() as AnalyticsData;
          setData(json);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    void fetchAnalytics();
  }, []);

  if (agents.length === 0) return null;

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl h-24 animate-pulse"
            style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
          />
        ))}
      </div>
    );
  }

  const s = data?.summary;
  const p = data?.planUsage;
  const maxVol = Math.max(1, ...(data?.dailyVolume ?? [0]));

  const stats = [
    {
      label: "Agents",
      value: s?.totalAgents ?? 0,
      sub: s?.liveAgents ? `${s.liveAgents} live` : undefined,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      ),
      color: "#3b5bfc",
    },
    {
      label: "Conversations",
      value: s?.totalConversations ?? 0,
      sub: s?.conversationsToday ? `+${s.conversationsToday} today` : undefined,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
      ),
      color: "#10b981",
    },
    {
      label: "Messages",
      value: s?.totalMessages ?? 0,
      sub: s?.messagesToday ? `+${s.messagesToday} today` : undefined,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.587c0-.548-.063-1.08-.184-1.588a8.147 8.147 0 002.46-5.69c0-4.556-4.03-8.25-9-8.25S0 7.444 0 12c0 2.177.99 4.126 2.54 5.552a5.977 5.977 0 01-.474 1.58 4.502 4.502 0 001.56 1.1c.548.256 1.143.421 1.755.474A9.76 9.76 0 0121 12z" />
        </svg>
      ),
      color: "#8b5cf6",
    },
    {
      label: "Plan",
      value: (p?.plan ?? "free").charAt(0).toUpperCase() + (p?.plan ?? "free").slice(1),
      sub: p === undefined
        ? undefined
        : p.messageLimit === null
        ? "Unlimited msgs"
        : `${p.messageCount ?? 0} / ${p.messageLimit} msgs`,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: "#f59e0b",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border p-4 flex flex-col gap-2"
            style={{ backgroundColor: "#111827", borderColor: "rgba(255,255,255,0.06)" }}
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${stat.color}15`, color: stat.color }}>
                {stat.icon}
              </div>
              <span className="text-xs font-medium text-white/50">{stat.label}</span>
            </div>
            <div>
              <div className="text-xl font-bold text-white">{stat.value}</div>
              {stat.sub && (
                <div className="text-[11px] text-white/35 mt-0.5">{stat.sub}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom row: sparkline + recent activity */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Message volume sparkline */}
        <div
          className="rounded-xl border p-4 flex flex-col gap-3 md:col-span-2"
          style={{ backgroundColor: "#111827", borderColor: "rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-white/50">Message Volume</span>
              <span className="text-[10px] text-white/30">(7 days)</span>
            </div>
            <div className="text-xs font-bold text-white">
              {data?.dailyVolume.reduce((a, b) => a + b, 0) ?? 0}
            </div>
          </div>
          <div className="flex items-end gap-1 h-20">
            {(data?.dailyVolume ?? [0, 0, 0, 0, 0, 0, 0]).map((v, i) => {
              const h = maxVol > 0 ? Math.max((v / maxVol) * 100, 8) : 8;
              const dayLabel = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][
                (new Date().getDay() + 6 - (6 - i)) % 7
              ];
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-sm transition-all hover:opacity-80"
                    style={{ height: `${h}%`, backgroundColor: v > 0 ? "#3b5bfc" : "rgba(255,255,255,0.06)" }}
                    title={`${dayLabel}: ${v} messages`}
                  />
                  <span className="text-[9px] text-white/25">{dayLabel}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent activity */}
        <div
          className="rounded-xl border p-4 flex flex-col gap-3"
          style={{ backgroundColor: "#111827", borderColor: "rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-white/50">Recent Activity</span>
            <button
              onClick={() => navigate("/inbox")}
              className="text-[10px] text-[#3b5bfc] hover:opacity-80 transition-opacity"
            >
              View Inbox &rarr;
            </button>
          </div>
          <div className="flex-1 flex flex-col gap-2 min-h-[120px]">
            {(data?.activity ?? []).length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-xs text-white/20">
                No activity yet
              </div>
            ) : (
              (data?.activity ?? []).map((a) => (
                <div key={a.id} className="flex items-start gap-2 py-1.5 border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{
                      backgroundColor: a.role === "ai" ? "#3b5bfc15" : "#10b98115",
                      color: a.role === "ai" ? "#3b5bfc" : "#10b981",
                    }}
                  >
                    <span className="text-[9px] font-bold">{a.role === "ai" ? "AI" : "C"}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-white/70 truncate">{a.preview}</p>
                    <p className="text-[9px] text-white/25 mt-0.5">{a.conversation_name}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [, navigate] = useLocation();

  const [showCreateModal,   setShowCreateModal]   = useState(false);
  const [showUpgradeModal,  setShowUpgradeModal]  = useState(false);
  const [agents,            setAgents]            = useState<Agent[]>([]);
  const [loadingAgents,     setLoadingAgents]     = useState(true);
  const [toast,             setToast]             = useState("");
  const [deleteModal,       setDeleteModal]       = useState<Agent | null>(null);
  const [deleting,          setDeleting]          = useState(false);

  // Onboarding state
  const [profile,           setProfile]           = useState<Profile | null>(null);
  const [docCount,          setDocCount]          = useState(0);
  const [onboardingDone,    setOnboardingDone]    = useState(false);
  const [hasTestedChat,     setHasTestedChat]     = useState(false);
  const [step3Skipped,      setStep3Skipped]      = useState(() =>
    localStorage.getItem(STEP3_SKIP_KEY) === "true"
  );

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  const fetchAgents = useCallback(async () => {
    setLoadingAgents(true);
    const { data, error } = await supabase.from("agents").select("*").order("created_at", { ascending: false });
    if (!error && data) setAgents(data as Agent[]);
    setLoadingAgents(false);
  }, []);

  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("onboarding_complete, has_tested_chat, full_name, completed_steps")
      .eq("id", user.id)
      .single();
    if (data) {
      setProfile(data as Profile);
      setOnboardingDone((data as Profile).onboarding_complete ?? false);
      const completedSteps: string[] = Array.isArray((data as Profile).completed_steps)
        ? (data as Profile).completed_steps!
        : [];
      setHasTestedChat(completedSteps.includes("test_agent") || (data as Profile).has_tested_chat === true);
    }
  }, []);

  const fetchDocCount = useCallback(async () => {
    const { count } = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true });
    setDocCount(count ?? 0);
  }, []);

  useEffect(() => {
    void fetchAgents();
    void fetchProfile();
    void fetchDocCount();
  }, [fetchAgents, fetchProfile, fetchDocCount]);

  function handleAgentCreated() {
    setShowCreateModal(false);
    void fetchAgents();
    showToast("Agent created successfully!");
  }

  async function handleDelete() {
    if (!deleteModal) return;
    setDeleting(true);
    const { error } = await supabase.from("agents").delete().eq("id", deleteModal.id);
    setDeleting(false);
    if (error) { showToast("Failed to delete agent. Please try again."); return; }
    setAgents((prev) => prev.filter((a) => a.id !== deleteModal.id));
    setDeleteModal(null);
    showToast("Agent deleted successfully");
  }

  async function handleRename(id: string, newName: string) {
    const { error } = await supabase.from("agents").update({ name: newName }).eq("id", id);
    if (error) { showToast("Failed to rename agent."); return; }
    setAgents((prev) => prev.map((a) => a.id === id ? { ...a, name: newName } : a));
    showToast("Agent renamed successfully");
  }

  function handleSkipStep3() {
    localStorage.setItem(STEP3_SKIP_KEY, "true");
    setStep3Skipped(true);
  }

  // Derive greeting
  const firstName  = profile?.full_name?.split(" ")[0] ?? "";
  const hasAgents  = agents.length > 0;
  const hasLiveCh  = agents.some((a) => a.status === "live");
  const firstAgent = agents[0] ?? null;

  // Show onboarding card if not dismissed and agents are loaded (avoid flash)
  const showOnboarding = !onboardingDone && !loadingAgents;

  return (
    <AppLayout activeItemId="home">
      {showCreateModal && (
        <CreateAgentModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleAgentCreated}
          onLimitReached={() => { setShowCreateModal(false); setShowUpgradeModal(true); }}
          isOnboarding={showOnboarding}
        />
      )}

      {deleteModal && (
        <DeleteConfirmModal
          agent={deleteModal}
          deleting={deleting}
          onCancel={() => { if (!deleting) setDeleteModal(null); }}
          onConfirm={() => void handleDelete()}
        />
      )}

      <UpgradeModal isOpen={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} reason="agent_limit" />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium text-white shadow-lg"
            style={{ backgroundColor: toast.toLowerCase().includes("fail") ? "#dc2626" : "#16a34a" }}
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            ✓ {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 px-4 md:px-8 py-6 md:py-8" style={{ backgroundColor: "#0a0f1e" }}>

        {/* Onboarding card */}
        <AnimatePresence>
          {showOnboarding && (
            <OnboardingCard
              hasAgents={hasAgents}
              hasDocuments={docCount > 0}
              hasTestedChat={hasTestedChat}
              hasLiveChannel={hasLiveCh}
              firstAgentId={firstAgent?.id ?? null}
              firstAgentName={firstAgent?.name ?? "Your Agent"}
              onComplete={() => setOnboardingDone(true)}
              onTestedChat={() => setHasTestedChat(true)}
              onRetakeChat={async () => {
                setHasTestedChat(false);
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                  void fetch("/api/onboarding/remove-step", {
                    method:  "PATCH",
                    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
                    body:    JSON.stringify({ stepId: "test_agent" }),
                  }).catch(() => {});
                }
              }}
              onCreateAgent={() => setShowCreateModal(true)}
              step3Skipped={step3Skipped}
              onSkipStep3={handleSkipStep3}
            />
          )}
        </AnimatePresence>

        {/* Analytics Overview */}
        <AnalyticsSection agents={agents} />

        {/* My Agents */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">My Agents</h2>
            {hasAgents && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                style={{ backgroundColor: "#3b5bfc" }}
              >
                <span className="text-base leading-none">+</span> New Agent
              </button>
            )}
          </div>

          {loadingAgents ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: "rgba(255,255,255,0.20)" }}>
              <div className="w-4 h-4 rounded-full border-2 border-[#3b5bfc] border-t-transparent animate-spin" />
              Loading agents…
            </div>
          ) : agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <AgentAvatar size={56} />
              <div>
                <p className="text-base font-semibold text-white">No agents yet</p>
                <p className="text-sm text-white/40 mt-1">Create your first agent to get started</p>
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                style={{ backgroundColor: "#3b5bfc" }}
              >
                Create Agent
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onRequestDelete={setDeleteModal}
                  onRename={handleRename}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </AppLayout>
  );
}
