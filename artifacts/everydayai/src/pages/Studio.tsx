import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { supabase } from "@/lib/supabase";

const modelOptions = [
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
];

const tabs = ["Prompt", "Knowledge", "Tools"] as const;
type Tab = (typeof tabs)[number];

interface Agent {
  id: string;
  name: string;
  description: string | null;
  model: string;
  status: string;
}

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

  async function handleSave() {
    if (!agent) return;
    setSaving(true);
    await supabase
      .from("agents")
      .update({ model })
      .eq("id", agent.id);
    setSaving(false);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2500);
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
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#0a0f1e", ...font }}>

      {/* Top bar */}
      <header
        className="flex items-center justify-between px-8 py-4 border-b border-white/5 sticky top-0 z-10"
        style={{ backgroundColor: "#0d1117" }}
      >
        {/* Left: back + title */}
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

        {/* Right: action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
            style={{ backgroundColor: "#3b5bfc" }}
          >
            Deploy
          </button>
          <button className="px-4 py-2 rounded-lg text-sm font-medium text-white/60 border border-white/10 hover:border-white/20 hover:text-white/80 transition-all duration-150">
            Share
          </button>
          <button className="px-4 py-2 rounded-lg text-sm font-medium text-white/60 border border-white/10 hover:border-white/20 hover:text-white/80 transition-all duration-150">
            Version History
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-8 pt-5 border-b border-white/5">
        {tabs.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-4 py-2 text-sm font-medium rounded-t-lg transition-all duration-150 relative"
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

      {/* Tab content */}
      <div className="flex-1 px-8 py-7 max-w-3xl">
        {activeTab === "Prompt" && (
          <div className="flex flex-col gap-6">
            {/* Model dropdown */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-white/70">Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-64 rounded-lg px-4 py-2.5 text-sm text-white border border-white/10 outline-none focus:border-[#3b5bfc] transition-colors appearance-none cursor-pointer"
                style={{ backgroundColor: "#111827" }}
              >
                {modelOptions.map((opt) => (
                  <option key={opt.value} value={opt.value} style={{ backgroundColor: "#111827" }}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Instructions */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-white/70">Instructions</label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Write your agent instructions here..."
                rows={14}
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 border border-white/10 outline-none focus:border-[#3b5bfc] transition-colors resize-none leading-relaxed"
                style={{ backgroundColor: "#111827" }}
              />
            </div>

            {/* Save */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: "#3b5bfc" }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              {savedMsg && (
                <span className="text-sm text-green-400">✓ Saved</span>
              )}
            </div>
          </div>
        )}

        {activeTab === "Knowledge" && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <p className="text-white/25 text-sm">Knowledge base coming soon.</p>
          </div>
        )}

        {activeTab === "Tools" && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <p className="text-white/25 text-sm">Tool integrations coming soon.</p>
          </div>
        )}
      </div>

      {/* Saved toast */}
      {savedMsg && (
        <div
          className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium text-white shadow-lg"
          style={{ backgroundColor: "#16a34a" }}
        >
          ✓ Changes saved
        </div>
      )}
    </div>
  );
}
