import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import AppLayout from "@/components/AppLayout";
import UpgradeModal from "@/components/UpgradeModal";

const modelOptions = [
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "gpt-4o",      label: "GPT-4o" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
];

interface Agent {
  id: string;
  name: string;
  description: string | null;
  model: string;
  status: string;
  created_at: string;
}

// ─── Create Agent Modal ────────────────────────────────────────────────────────

interface CreateAgentModalProps {
  onClose: () => void;
  onCreated: () => void;
  onLimitReached: () => void;
}

function CreateAgentModal({ onClose, onCreated, onLimitReached }: CreateAgentModalProps) {
  const [agentName, setAgentName]               = useState("");
  const [agentDescription, setAgentDescription] = useState("");
  const [model, setModel]                       = useState("gpt-4o-mini");
  const [loading, setLoading]                   = useState(false);
  const [error, setError]                       = useState("");
  const [nameError, setNameError]               = useState("");

  async function handleCreate() {
    setNameError(""); setError("");
    if (!agentName.trim()) { setNameError("Agent name is required."); return; }
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("You must be logged in."); setLoading(false); return; }

      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ name: agentName.trim(), description: agentDescription.trim() || undefined, model }),
      });

      const data = await res.json() as { error?: string; limit?: number; plan?: string };
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
      <div
        className="w-full max-w-md rounded-2xl border px-7 py-7 flex flex-col gap-5"
        style={{ backgroundColor: "#111827", borderColor: "rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Create a New Agent</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-xl" style={{ color: "rgba(255,255,255,0.35)" }}>×</button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>Agent Name</label>
          <input
            type="text" placeholder="e.g. Smith's Solar Assistant"
            value={agentName} onChange={(e) => { setAgentName(e.target.value); setNameError(""); }}
            className="w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none"
            style={{ backgroundColor: "#0a0f1e", border: `1px solid ${nameError ? "#f87171" : "rgba(255,255,255,0.08)"}` }}
          />
          {nameError && <p className="text-xs text-red-400">{nameError}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>Description</label>
          <textarea
            placeholder="Describe your agent in a few words"
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
            onClick={handleCreate} disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: "#3b5bfc" }}
          >{loading ? "Creating…" : "Create Agent"}</button>
          <button onClick={onClose} disabled={loading} className="text-sm text-center disabled:opacity-50" style={{ color: "rgba(255,255,255,0.35)" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ──────────────────────────────────────────────────────

interface DeleteConfirmModalProps {
  agent: Agent;
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
        {/* Icon */}
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
  agent: Agent;
  onRequestDelete: (agent: Agent) => void;
  onRename: (id: string, newName: string) => Promise<void>;
}

function AgentCard({ agent, onRequestDelete, onRename }: AgentCardProps) {
  const [, navigate]    = useLocation();
  const [menuOpen, setMenuOpen]       = useState(false);
  const [isRenaming, setIsRenaming]   = useState(false);
  const [renameValue, setRenameValue] = useState(agent.name);
  const [renameSaving, setRenameSaving] = useState(false);
  const menuRef   = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  const modelLabel = modelOptions.find((m) => m.value === agent.model)?.label ?? agent.model;
  const isLive     = agent.status === "live";

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  // Focus input when rename starts
  useEffect(() => {
    if (isRenaming) setTimeout(() => inputRef.current?.focus(), 0);
  }, [isRenaming]);

  function startRename() {
    setMenuOpen(false);
    setRenameValue(agent.name);
    setIsRenaming(true);
  }

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
    if (e.key === "Escape") { setIsRenaming(false); }
  }

  return (
    <div
      className="h-40 rounded-2xl border p-4 flex flex-col justify-between transition-all duration-200 cursor-pointer relative group"
      style={{ backgroundColor: "#111827", borderColor: "rgba(255,255,255,0.08)" }}
      onClick={() => { if (!menuOpen && !isRenaming) navigate(`/studio/${agent.id}`); }}
    >
      {/* ··· menu button — visible on hover */}
      <div
        ref={menuRef}
        className="absolute top-3 right-3 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="w-7 h-7 rounded-md flex items-center justify-center text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-white/10"
          style={{ color: "rgba(255,255,255,0.5)" }}
          title="Options"
        >
          ···
        </button>

        {menuOpen && (
          <div
            className="absolute right-0 top-8 w-36 rounded-xl border overflow-hidden shadow-xl z-20"
            style={{ backgroundColor: "#1a2235", borderColor: "rgba(255,255,255,0.10)" }}
          >
            <button
              onClick={() => { setMenuOpen(false); navigate(`/studio/${agent.id}`); }}
              className="w-full text-left px-4 py-2.5 text-xs text-white/70 hover:bg-white/5 transition-colors"
            >Open</button>
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

      {/* Card content */}
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
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
          style={{ backgroundColor: "rgba(59,91,252,0.18)", color: "#7b93ff" }}
        >{modelLabel}</span>
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

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [, navigate]                          = useLocation();
  const [showCreateModal, setShowCreateModal]   = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [agents, setAgents]                     = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents]       = useState(true);
  const [toast, setToast]                       = useState("");
  const [deleteModal, setDeleteModal]           = useState<Agent | null>(null);
  const [deleting, setDeleting]                 = useState(false);

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

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  function handleAgentCreated() {
    setShowCreateModal(false);
    fetchAgents();
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

  return (
    <AppLayout activeItemId="home">
      {showCreateModal && (
        <CreateAgentModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleAgentCreated}
          onLimitReached={() => setShowUpgradeModal(true)}
        />
      )}

      {deleteModal && (
        <DeleteConfirmModal
          agent={deleteModal}
          deleting={deleting}
          onCancel={() => { if (!deleting) setDeleteModal(null); }}
          onConfirm={handleDelete}
        />
      )}

      <UpgradeModal isOpen={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} reason="agent_limit" />

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium text-white shadow-lg transition-all"
          style={{ backgroundColor: toast.includes("deleted") || toast.includes("renamed") || toast.includes("created") ? "#16a34a" : "#dc2626" }}
        >
          ✓ {toast}
        </div>
      )}

      <main className="flex-1 px-4 md:px-8 py-6 md:py-8" style={{ backgroundColor: "#0a0f1e" }}>
        <h1 className="text-2xl font-bold mb-6 text-white">Welcome back 👋</h1>

        {/* Blue banner */}
        <div
          className="w-full rounded-2xl px-6 md:px-8 py-6 md:py-7 mb-8 flex items-center justify-between gap-4"
          style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #3b5bfc 100%)" }}
        >
          <div>
            <h2 className="text-lg md:text-xl font-bold text-white mb-1">Begin Your EverydayAI Journey</h2>
            <p className="text-white/70 text-sm leading-relaxed">Build and deploy AI agents for any business in minutes</p>
          </div>
          <button className="flex-shrink-0 px-4 md:px-5 py-2.5 rounded-lg text-sm font-semibold text-[#3b5bfc] bg-white hover:bg-white/90 transition-all duration-150">
            Learn More
          </button>
        </div>

        {/* My Agents */}
        <div>
          <h2 className="text-base font-semibold mb-4 text-white">My Agents</h2>

          {loadingAgents ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: "rgba(255,255,255,0.20)" }}>
              <div className="w-4 h-4 rounded-full border-2 border-[#3b5bfc] border-t-transparent animate-spin" />
              Loading agents…
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
              <button
                onClick={() => setShowCreateModal(true)}
                className="h-40 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer hover:opacity-80 transition-all duration-200"
                style={{ borderColor: "rgba(255,255,255,0.08)" }}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl" style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "#3b5bfc" }}>+</div>
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>Create New Agent</span>
              </button>
            </div>
          )}
        </div>
      </main>
    </AppLayout>
  );
}
