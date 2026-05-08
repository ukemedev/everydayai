import { useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Automation {
  id: string;
  name: string;
  description: string;
  trigger: string;
  actions: string[];
  enabled: boolean;
}

// ─── Create Automation Modal ──────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void;
  onCreate: (description: string) => void;
}

function CreateAutomationModal({ onClose, onCreate }: CreateModalProps) {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  function handleBuild() {
    if (!description.trim()) return;
    setLoading(true);
    setTimeout(() => {
      onCreate(description.trim());
      setLoading(false);
    }, 900);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-7 flex flex-col gap-5"
        style={{ backgroundColor: "#111827", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Create Automation</h2>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/70 transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div>
          <p className="text-sm text-white/50 mb-3">
            Describe what you want to automate in plain language. AI will turn it into a workflow.
          </p>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder={`e.g. Every time someone fills my Google Form, send them a welcome email and save their info to Google Sheets`}
            className="w-full rounded-xl px-4 py-3 text-sm text-white/85 resize-none outline-none transition-all duration-150 placeholder-white/25"
            style={{
              backgroundColor: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(59,91,252,0.6)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleBuild}
            disabled={!description.trim() || loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-40"
            style={{ backgroundColor: "#3b5bfc" }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Building…
              </span>
            ) : (
              "Build with AI"
            )}
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-white/50 border border-white/10 hover:border-white/20 hover:text-white/70 transition-all duration-150"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Automation Card ──────────────────────────────────────────────────────────

interface CardProps {
  automation: Automation;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

function AutomationCard({ automation, onToggle, onDelete }: CardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      className="w-full rounded-2xl px-6 py-5 flex items-start justify-between gap-4"
      style={{
        backgroundColor: "#111827",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="flex items-start gap-4 min-w-0">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg mt-0.5"
          style={{ backgroundColor: "rgba(59,91,252,0.15)" }}
        >
          ⚡
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{automation.name}</p>
          <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{automation.description}</p>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span
              className="text-[11px] font-medium px-2.5 py-1 rounded-full"
              style={{ backgroundColor: "rgba(139,92,246,0.15)", color: "#a78bfa" }}
            >
              {automation.trigger}
            </span>
            {automation.actions.map((action) => (
              <span
                key={action}
                className="text-[11px] font-medium px-2.5 py-1 rounded-full"
                style={{ backgroundColor: "rgba(59,91,252,0.15)", color: "#7b93ff" }}
              >
                {action}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0 mt-1">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/50">Delete?</span>
            <button
              onClick={() => onDelete(automation.id)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all duration-150"
              style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#f87171" }}
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg text-white/40 border border-white/10 hover:text-white/60 transition-all duration-150"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-xs font-medium text-white/30 hover:text-red-400 transition-colors duration-150"
          >
            Delete
          </button>
        )}

        {/* Toggle */}
        <button
          onClick={() => onToggle(automation.id)}
          className="relative w-11 h-6 rounded-full transition-all duration-200 flex-shrink-0"
          style={{
            backgroundColor: automation.enabled ? "#16a34a" : "rgba(255,255,255,0.12)",
          }}
        >
          <span
            className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200"
            style={{ left: automation.enabled ? "calc(100% - 1.375rem)" : "0.125rem" }}
          />
        </button>
      </div>
    </div>
  );
}

// ─── Automations Page ─────────────────────────────────────────────────────────

export default function Automations() {
  const [, navigate] = useLocation();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Load user email for sidebar
  useState(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserEmail(session?.user?.email ?? null);
    });
  });

  async function handleLogOut() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  function handleCreate(description: string) {
    const words = description.split(" ");
    const name = words.slice(0, 5).join(" ") + (words.length > 5 ? "…" : "");

    const hasForms = /form|submission|submit/i.test(description);
    const hasSheets = /sheet|spreadsheet/i.test(description);
    const hasEmail = /email|gmail|send/i.test(description);
    const hasTelegram = /telegram|notify|notification/i.test(description);
    const hasWebhook = /webhook|api|request/i.test(description);

    const trigger = hasForms ? "Form Submission" : hasWebhook ? "Webhook" : "Manual Trigger";
    const actions: string[] = [];
    if (hasSheets) actions.push("Google Sheets");
    if (hasEmail) actions.push("Gmail");
    if (hasTelegram) actions.push("Telegram");
    if (actions.length === 0) actions.push("Notification");

    const newAutomation: Automation = {
      id: crypto.randomUUID(),
      name,
      description,
      trigger,
      actions,
      enabled: true,
    };

    setAutomations((prev) => [newAutomation, ...prev]);
    setShowCreateModal(false);
  }

  function handleToggle(id: string) {
    setAutomations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a))
    );
  }

  function handleDelete(id: string) {
    setAutomations((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <div
      className="flex min-h-screen w-full"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {showCreateModal && (
        <CreateAutomationModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
        />
      )}

      {/* Sidebar */}
      <aside
        className="w-60 flex-shrink-0 flex flex-col fixed top-0 left-0 h-screen border-r border-white/5"
        style={{ backgroundColor: "#0d1117" }}
      >
        <div className="px-5 py-6">
          <span className="text-white font-bold text-lg tracking-tight">EverydayAI</span>
        </div>

        <nav className="flex-1 px-3 flex flex-col gap-1">
          {[
            { icon: "🏠", label: "Home", path: "/dashboard" },
            { icon: "📚", label: "Learn", path: "/dashboard" },
            { icon: "🎛️", label: "Studio", path: "/dashboard" },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}

          <button
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left"
            style={{ backgroundColor: "rgba(59,91,252,0.15)", color: "#3b5bfc" }}
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
        {/* Header row */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Automations</h1>
            <p className="text-sm text-white/45 mt-1">
              Build workflows that run automatically in the background
            </p>
          </div>
          {automations.length > 0 && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
              style={{ backgroundColor: "#3b5bfc" }}
            >
              + Create Automation
            </button>
          )}
        </div>

        {/* Empty state */}
        {automations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 gap-5">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl"
              style={{ backgroundColor: "rgba(59,91,252,0.1)", border: "1px solid rgba(59,91,252,0.2)" }}
            >
              ⚡
            </div>
            <div className="text-center">
              <p className="text-white font-semibold text-lg">No automations yet</p>
              <p className="text-white/40 text-sm mt-1.5 leading-relaxed max-w-xs">
                Describe what you want to automate and AI will build it for you
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
              style={{ backgroundColor: "#3b5bfc" }}
            >
              Create Your First Automation
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {automations.map((automation) => (
              <AutomationCard
                key={automation.id}
                automation={automation}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
