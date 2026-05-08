import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/useTheme";

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

// ─── Create Agent Modal ────────────────────────────────────────────────────────

interface CreateAgentModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function CreateAgentModal({ onClose, onCreated }: CreateAgentModalProps) {
  const { colors } = useTheme();
  const bgInput = colors.bgInput;
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
        style={{ backgroundColor: colors.bgCard, borderColor: colors.border, fontFamily: "'Inter', sans-serif" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold" style={{ color: colors.text }}>Create a New Agent</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-xl leading-none transition-all"
            style={{ color: colors.textFaint }}
          >×</button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: colors.textMuted }}>Agent Name</label>
          <input
            type="text"
            placeholder="e.g. Smith's Solar Assistant"
            value={agentName}
            onChange={(e) => { setAgentName(e.target.value); setNameError(""); }}
            className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors"
            style={{
              backgroundColor: bgInput,
              color: colors.text,
              border: `1px solid ${nameError ? "#f87171" : colors.border}`,
            }}
          />
          {nameError && <p className="text-xs text-red-400">{nameError}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: colors.textMuted }}>Description</label>
          <textarea
            placeholder="Describe your agent in a few words"
            value={agentDescription}
            onChange={(e) => setAgentDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg px-4 py-2.5 text-sm outline-none focus:border-[#3b5bfc] transition-colors resize-none"
            style={{ backgroundColor: bgInput, color: colors.text, border: `1px solid ${colors.border}` }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: colors.textMuted }}>Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors appearance-none cursor-pointer"
            style={{ backgroundColor: bgInput, color: colors.text, border: `1px solid ${colors.border}` }}
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
            style={{ color: colors.textFaint }}
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
  const { colors } = useTheme();
  const [, navigate] = useLocation();
  const modelLabel = modelOptions.find((m) => m.value === agent.model)?.label ?? agent.model;
  const isLive = agent.status === "live";

  return (
    <div
      onClick={() => navigate(`/studio/${agent.id}`)}
      className="h-40 rounded-2xl border p-4 flex flex-col justify-between hover:opacity-90 transition-all duration-200 cursor-pointer"
      style={{ backgroundColor: colors.bgCard, borderColor: colors.border }}
    >
      <div className="flex flex-col gap-1 overflow-hidden">
        <p className="text-sm font-semibold truncate" style={{ color: colors.text }}>{agent.name}</p>
        {agent.description && (
          <p className="text-xs line-clamp-2 leading-relaxed" style={{ color: colors.textFaint }}>
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
  const { colors, isDark, toggle } = useTheme();
  const [, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
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

  const font = { fontFamily: "'Inter', sans-serif" };

  return (
    <div className="flex min-h-screen w-full" style={{ ...font, backgroundColor: colors.bgPage }}>

      {showCreateModal && (
        <CreateAgentModal onClose={() => setShowCreateModal(false)} onCreated={handleAgentCreated} />
      )}

      {successMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium text-white shadow-lg" style={{ backgroundColor: "#16a34a" }}>
          ✓ {successMessage}
        </div>
      )}

      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-screen w-60 flex flex-col border-r z-40 transition-transform duration-300 ease-in-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
        style={{ backgroundColor: colors.bgSidebar, borderColor: colors.borderDim }}
      >
        <div className="px-5 py-6 flex items-center justify-between">
          <span className="font-bold text-lg tracking-tight" style={{ color: colors.text }}>
            EverydayAI
          </span>
          <button
            className="md:hidden w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            onClick={() => setSidebarOpen(false)}
            style={{ color: colors.textFaint }}
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 px-3 flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setActiveNav(item.id); setSidebarOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left"
                style={{
                  backgroundColor: isActive ? colors.navActive : "transparent",
                  color: isActive ? colors.navActiveText : colors.textMuted,
                }}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </button>
            );
          })}
          <button
            onClick={() => { navigate("/automations"); setSidebarOpen(false); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left"
            style={{ color: colors.textMuted }}
          >
            <span className="text-base">⚡</span>
            Automations
          </button>
          <button
            onClick={() => { navigate("/settings"); setSidebarOpen(false); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left"
            style={{ color: colors.textMuted }}
          >
            <span className="text-base">⚙️</span>
            Settings
          </button>
        </nav>

        <div className="px-4 py-5 border-t flex flex-col gap-3" style={{ borderColor: colors.borderDim }}>
          {userEmail && (
            <p className="text-xs truncate" style={{ color: colors.textFaint }} title={userEmail}>
              {userEmail}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-base transition-all hover:opacity-80 flex-shrink-0"
              style={{ backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? "☀️" : "🌙"}
            </button>
            <button
              onClick={handleLogOut}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-150"
              style={{
                color: colors.textMuted,
                border: `1px solid ${colors.borderSubtle}`,
              }}
            >
              Log Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 md:ml-60 min-h-screen px-4 md:px-8 py-6 md:py-8" style={{ backgroundColor: colors.bgPage }}>

        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 mb-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-xl transition-colors"
            style={{ color: colors.text }}
          >
            ☰
          </button>
          <span className="font-bold text-lg" style={{ color: colors.text }}>EverydayAI</span>
        </div>

        <h1 className="text-2xl font-bold mb-6" style={{ color: colors.text }}>Welcome back 👋</h1>

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
          <h2 className="text-base font-semibold mb-4" style={{ color: colors.text }}>My Agents</h2>

          {loadingAgents ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: colors.textVeryFaint }}>
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
                style={{ borderColor: colors.border }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
                  style={{
                    backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(59,91,252,0.08)",
                    color: "#3b5bfc",
                  }}
                >
                  +
                </div>
                <span className="text-xs" style={{ color: colors.textFaint }}>
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
