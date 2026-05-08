import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

const navItems = [
  { icon: "🏠", label: "Home", id: "home" },
  { icon: "📚", label: "Learn", id: "learn" },
  { icon: "🎛️", label: "Studio", id: "studio" },
];

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

// ─── Modal ────────────────────────────────────────────────────────────────────

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

    if (!agentName.trim()) {
      setNameError("Agent name is required.");
      return;
    }

    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("You must be logged in to create an agent.");
      setLoading(false);
      return;
    }

    const { error: insertError } = await supabase.from("agents").insert({
      name: agentName.trim(),
      description: agentDescription.trim() || null,
      model,
      user_id: user.id,
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

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
        className="w-full max-w-md rounded-2xl border border-white/10 px-7 py-7 flex flex-col gap-5 relative"
        style={{ backgroundColor: "#111827", fontFamily: "'Inter', sans-serif" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Create a New Agent</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 transition-all duration-150 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Agent Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-white/70">Agent Name</label>
          <input
            type="text"
            placeholder="e.g. Smith's Solar Assistant"
            value={agentName}
            onChange={(e) => { setAgentName(e.target.value); setNameError(""); }}
            className="w-full rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/25 border outline-none transition-colors"
            style={{
              backgroundColor: "#0a0f1e",
              borderColor: nameError ? "#f87171" : "rgba(255,255,255,0.1)",
            }}
          />
          {nameError && (
            <p className="text-xs text-red-400">{nameError}</p>
          )}
        </div>

        {/* Agent Description */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-white/70">Agent Description</label>
          <textarea
            placeholder="Describe your agent in a few words"
            value={agentDescription}
            onChange={(e) => setAgentDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/25 border border-white/10 outline-none focus:border-[#3b5bfc] transition-colors resize-none"
            style={{ backgroundColor: "#0a0f1e" }}
          />
        </div>

        {/* Agent Model */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-white/70">Agent Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-lg px-4 py-2.5 text-sm text-white border border-white/10 outline-none focus:border-[#3b5bfc] transition-colors appearance-none cursor-pointer"
            style={{ backgroundColor: "#0a0f1e" }}
          >
            {modelOptions.map((opt) => (
              <option key={opt.value} value={opt.value} style={{ backgroundColor: "#111827" }}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Server error */}
        {error && (
          <p className="text-sm text-red-400 text-center -mt-1">{error}</p>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3 pt-1">
          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: "#3b5bfc" }}
          >
            {loading ? "Creating…" : "Create Agent"}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-sm text-white/35 hover:text-white/60 transition-colors duration-150 text-center disabled:opacity-50"
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
      className="w-48 h-40 rounded-2xl border border-white/10 p-4 flex flex-col justify-between hover:border-[#3b5bfc]/40 hover:bg-white/[0.02] transition-all duration-200 cursor-pointer"
      style={{ backgroundColor: "#111827" }}
    >
      <div className="flex flex-col gap-1 overflow-hidden">
        <p className="text-sm font-semibold text-white truncate">{agent.name}</p>
        {agent.description && (
          <p className="text-xs text-white/40 line-clamp-2 leading-relaxed">
            {agent.description}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mt-2">
        {/* Model badge */}
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
          style={{ backgroundColor: "rgba(59,91,252,0.18)", color: "#7b93ff" }}
        >
          {modelLabel}
        </span>
        {/* Status badge */}
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
  const [activeNav, setActiveNav] = useState("home");
  const [userEmail, setUserEmail] = useState<string | null>(null);
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserEmail(session?.user?.email ?? null);
    });
    fetchAgents();
  }, [fetchAgents]);

  function handleAgentCreated() {
    setShowCreateModal(false);
    fetchAgents();
    setSuccessMessage("Agent created successfully!");
    setTimeout(() => setSuccessMessage(""), 3500);
  }

  async function handleLogOut() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  return (
    <div
      className="flex min-h-screen w-full"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Modal */}
      {showCreateModal && (
        <CreateAgentModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleAgentCreated}
        />
      )}

      {/* Success toast */}
      {successMessage && (
        <div
          className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium text-white shadow-lg"
          style={{ backgroundColor: "#16a34a" }}
        >
          ✓ {successMessage}
        </div>
      )}

      {/* Sidebar */}
      <aside
        className="w-60 flex-shrink-0 flex flex-col fixed top-0 left-0 h-screen border-r border-white/5"
        style={{ backgroundColor: "#0d1117" }}
      >
        <div className="px-5 py-6">
          <span className="text-white font-bold text-lg tracking-tight">
            EverydayAI
          </span>
        </div>

        <nav className="flex-1 px-3 flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left"
                style={{
                  backgroundColor: isActive ? "rgba(59,91,252,0.15)" : "transparent",
                  color: isActive ? "#3b5bfc" : "rgba(255,255,255,0.55)",
                }}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </button>
            );
          })}
          <button
            onClick={() => navigate("/automations")}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            <span className="text-base">⚡</span>
            Automations
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            <span className="text-base">⚙️</span>
            Settings
          </button>
        </nav>

        <div className="px-4 py-5 border-t border-white/5 flex flex-col gap-3">
          {userEmail && (
            <p className="text-xs text-white/35 truncate" title={userEmail}>
              {userEmail}
            </p>
          )}
          <button
            onClick={handleLogOut}
            className="w-full py-2 rounded-lg text-sm font-medium text-white/60 border border-white/10 hover:border-white/20 hover:text-white/80 transition-all duration-150"
          >
            Log Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main
        className="flex-1 ml-60 min-h-screen px-8 py-8"
        style={{ backgroundColor: "#0a0f1e" }}
      >
        <h1 className="text-2xl font-bold text-white mb-6">Welcome back 👋</h1>

        {/* Blue banner */}
        <div
          className="w-full rounded-2xl px-8 py-7 mb-8 flex items-center justify-between"
          style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #3b5bfc 100%)" }}
        >
          <div>
            <h2 className="text-xl font-bold text-white mb-1">
              Begin Your EverydayAI Journey
            </h2>
            <p className="text-white/70 text-sm leading-relaxed">
              Build and deploy AI agents for any business in minutes
            </p>
          </div>
          <button className="flex-shrink-0 ml-6 px-5 py-2.5 rounded-lg text-sm font-semibold text-[#3b5bfc] bg-white hover:bg-white/90 transition-all duration-150">
            Learn More
          </button>
        </div>

        {/* My Agents */}
        <div>
          <h2 className="text-base font-semibold text-white mb-4">My Agents</h2>

          {loadingAgents ? (
            <div className="flex items-center gap-2 text-sm text-white/30">
              <div className="w-4 h-4 rounded-full border-2 border-[#3b5bfc] border-t-transparent animate-spin" />
              Loading agents…
            </div>
          ) : (
            <div className="flex flex-wrap gap-4">
              {/* Existing agent cards */}
              {agents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}

              {/* Create New Agent card — always last */}
              <button
                onClick={() => setShowCreateModal(true)}
                className="w-48 h-40 rounded-2xl border border-dashed border-white/15 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-[#3b5bfc]/50 hover:bg-white/[0.02] transition-all duration-200 group"
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xl text-white/30 group-hover:text-[#3b5bfc]/70 transition-colors duration-200"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
                >
                  +
                </div>
                <span className="text-xs text-white/35 group-hover:text-white/50 transition-colors duration-200">
                  Create New Agent
                </span>
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
