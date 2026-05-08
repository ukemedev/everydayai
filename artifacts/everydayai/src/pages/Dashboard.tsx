import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import AppLayout from "@/components/AppLayout";

const modelOptions = [
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "gpt-4o", label: "GPT-4o" },
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
}

function CreateAgentModal({ onClose, onCreated }: CreateAgentModalProps) {
  const [agentName, setAgentName] = useState("");
  const [agentDescription, setAgentDescription] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");

  async function handleCreate() {
    setNameError("");
    setError("");
    if (!agentName.trim()) { setNameError("Agent name is required."); return; }
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("You must be logged in."); setLoading(false); return; }
    const { error: insertError } = await supabase.from("agents").insert({
      name: agentName.trim(),
      description: agentDescription.trim() || null,
      model,
      user_id: user.id,
    });
    if (insertError) { setError(insertError.message); setLoading(false); return; }
    setLoading(false);
    onCreated();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl border px-7 py-7 flex flex-col gap-5"
        style={{ backgroundColor: "#111827", borderColor: "rgba(255,255,255,0.08)", fontFamily: "'Inter', sans-serif" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Create a New Agent</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-xl leading-none transition-all"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >×</button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>Agent Name</label>
          <input
            type="text"
            placeholder="e.g. Smith's Solar Assistant"
            value={agentName}
            onChange={(e) => { setAgentName(e.target.value); setNameError(""); }}
            className="w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none transition-colors"
            style={{
              backgroundColor: "#0a0f1e",
              border: `1px solid ${nameError ? "#f87171" : "rgba(255,255,255,0.08)"}`,
            }}
          />
          {nameError && <p className="text-xs text-red-400">{nameError}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>Description</label>
          <textarea
            placeholder="Describe your agent in a few words"
            value={agentDescription}
            onChange={(e) => setAgentDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-[#3b5bfc] transition-colors resize-none"
            style={{ backgroundColor: "#0a0f1e", border: "1px solid rgba(255,255,255,0.08)" }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none transition-colors appearance-none cursor-pointer"
            style={{ backgroundColor: "#0a0f1e", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {modelOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-red-400 text-center -mt-1">{error}</p>}

        <div className="flex flex-col gap-3 pt-1">
          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: "#3b5bfc" }}
          >
            {loading ? "Creating…" : "Create Agent"}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-sm text-center transition-colors duration-150 disabled:opacity-50"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: Agent }) {
  const [, navigate] = useLocation();
  const modelLabel = modelOptions.find((m) => m.value === agent.model)?.label ?? agent.model;
  const isLive = agent.status === "live";

  return (
    <div
      onClick={() => navigate(`/studio/${agent.id}`)}
      className="h-40 rounded-2xl border p-4 flex flex-col justify-between hover:opacity-90 transition-all duration-200 cursor-pointer"
      style={{ backgroundColor: "#111827", borderColor: "rgba(255,255,255,0.08)" }}
    >
      <div className="flex flex-col gap-1 overflow-hidden">
        <p className="text-sm font-semibold text-white truncate">{agent.name}</p>
        {agent.description && (
          <p className="text-xs line-clamp-2 leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>
            {agent.description}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
          style={{ backgroundColor: "rgba(59,91,252,0.18)", color: "#7b93ff" }}
        >
          {modelLabel}
        </span>
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded-full capitalize"
          style={
            isLive
              ? { backgroundColor: "rgba(34,197,94,0.15)", color: "#4ade80" }
              : { backgroundColor: "rgba(251,146,60,0.15)", color: "#fb923c" }
          }
        >
          {agent.status}
        </span>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [successMessage, setSuccessMessage] = useState("");

  const fetchAgents = useCallback(async () => {
    setLoadingAgents(true);
    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setAgents(data as Agent[]);
    setLoadingAgents(false);
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  function handleAgentCreated() {
    setShowCreateModal(false);
    fetchAgents();
    setSuccessMessage("Agent created successfully!");
    setTimeout(() => setSuccessMessage(""), 3500);
  }

  return (
    <AppLayout activeItemId="home">
      {showCreateModal && (
        <CreateAgentModal onClose={() => setShowCreateModal(false)} onCreated={handleAgentCreated} />
      )}

      {successMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium text-white shadow-lg" style={{ backgroundColor: "#16a34a" }}>
          ✓ {successMessage}
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
            <p className="text-white/70 text-sm leading-relaxed">
              Build and deploy AI agents for any business in minutes
            </p>
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
                <AgentCard key={agent.id} agent={agent} />
              ))}
              <button
                onClick={() => setShowCreateModal(true)}
                className="h-40 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer hover:opacity-80 transition-all duration-200 group"
                style={{ borderColor: "rgba(255,255,255,0.08)" }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "#3b5bfc" }}
                >
                  +
                </div>
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Create New Agent
                </span>
              </button>
            </div>
          )}
        </div>
      </main>
    </AppLayout>
  );
}
