import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/lib/supabase";
import { Lock, Sparkles, ChevronRight, Zap } from "lucide-react";

const CONNECTOR_LABELS: Record<string, { label: string; icon: string }> = {
  google_sheets:   { label: "Google Sheets",  icon: "📊" },
  gmail:           { label: "Gmail",           icon: "📧" },
  telegram:        { label: "Telegram",        icon: "💬" },
  paystack:        { label: "Paystack",        icon: "💳" },
  google_calendar: { label: "Calendar",        icon: "📅" },
  termii:          { label: "Termii SMS",      icon: "🔔" },
  web_search:      { label: "Web Search",      icon: "🔍" },
  hubspot:         { label: "HubSpot",         icon: "👤" },
};

const PLAN_LABELS: Record<string, string> = {
  free: "Free", starter: "Starter", pro: "Pro", business: "Business",
};

const PLAN_COLORS: Record<string, { bg: string; color: string }> = {
  free:     { bg: "rgba(255,255,255,0.08)",  color: "rgba(255,255,255,0.50)" },
  starter:  { bg: "rgba(59,91,252,0.18)",    color: "#818cf8" },
  pro:      { bg: "rgba(16,185,129,0.18)",   color: "#10b981" },
  business: { bg: "rgba(245,158,11,0.18)",   color: "#f59e0b" },
};

interface Template {
  id: string;
  name: string;
  category: string;
  description: string | null;
  tools_json: string[];
  plan_required: string;
  featured: boolean;
  icon: string;
  locked: boolean;
}

export default function Templates() {
  const [, navigate] = useLocation();
  const [templates, setTemplates]       = useState<Template[]>([]);
  const [userPlan, setUserPlan]         = useState("free");
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");
  const [activeCategory, setCategory]   = useState("All");
  const [usingId, setUsingId]           = useState<string | null>(null);
  const [useError, setUseError]         = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};
      const res = await fetch("/api/templates", { headers });
      if (!res.ok) throw new Error("Failed to load templates");
      const data = await res.json() as { templates: Template[]; userPlan: string };
      setTemplates(data.templates ?? []);
      setUserPlan(data.userPlan ?? "free");
    } catch {
      setError("Failed to load templates. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleUse(template: Template) {
    if (template.locked) {
      navigate("/billing");
      return;
    }
    setUsingId(template.id);
    setUseError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/login"); return; }
      const res = await fetch(`/api/templates/${template.id}/use`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json() as { agentId?: string; error?: string };
      if (!res.ok) {
        if (data.error === "AGENT_LIMIT_REACHED") {
          setUseError("You've reached your agent limit. Upgrade your plan to create more agents.");
        } else {
          setUseError(data.error ?? "Failed to create agent");
        }
        return;
      }
      navigate(`/studio/${data.agentId}`);
    } catch {
      setUseError("Something went wrong. Please try again.");
    } finally {
      setUsingId(null);
    }
  }

  const categories = ["All", ...Array.from(new Set(templates.map((t) => t.category)))];
  const filtered = activeCategory === "All"
    ? templates
    : templates.filter((t) => t.category === activeCategory);

  const featured = filtered.filter((t) => t.featured);
  const regular  = filtered.filter((t) => !t.featured);

  return (
    <AppLayout activeItemId="templates">
      <div className="min-h-screen px-4 md:px-8 py-8 max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={20} style={{ color: "#818cf8" }} />
            <h1 className="text-2xl font-bold text-white">Agent Templates</h1>
          </div>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
            Start with a ready-made agent. Pick a template, connect your tools, and deploy in minutes.
          </p>
        </div>

        {/* Plan info banner */}
        {userPlan === "free" && (
          <div
            className="flex items-center justify-between gap-4 rounded-xl px-5 py-4 mb-6 border"
            style={{ backgroundColor: "rgba(59,91,252,0.08)", borderColor: "rgba(59,91,252,0.20)" }}
          >
            <div className="flex items-center gap-3">
              <Zap size={16} style={{ color: "#818cf8" }} />
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>
                You're on the <span className="text-white font-semibold">Free plan</span>. Upgrade to unlock more powerful templates.
              </p>
            </div>
            <button
              onClick={() => navigate("/billing")}
              className="flex-shrink-0 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: "#3b5bfc" }}
            >
              Upgrade
            </button>
          </div>
        )}

        {useError && (
          <div className="rounded-xl px-4 py-3 mb-5 border"
            style={{ backgroundColor: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.20)" }}>
            <p className="text-sm" style={{ color: "#f87171" }}>{useError}</p>
          </div>
        )}

        {/* Category filter */}
        <div className="flex gap-2 flex-wrap mb-6">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={
                activeCategory === cat
                  ? { backgroundColor: "rgba(59,91,252,0.20)", color: "#818cf8" }
                  : { backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.45)" }
              }
            >
              {cat}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-20">
            <p className="text-sm" style={{ color: "#f87171" }}>{error}</p>
            <button onClick={() => void load()} className="text-sm underline" style={{ color: "rgba(255,255,255,0.45)" }}>
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20">
            <span className="text-4xl">📋</span>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.40)" }}>No templates in this category yet.</p>
          </div>
        ) : (
          <>
            {/* Featured templates */}
            {featured.length > 0 && (
              <div className="mb-8">
                <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "rgba(255,255,255,0.30)" }}>
                  Featured
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {featured.map((t) => (
                    <TemplateCard key={t.id} template={t} onUse={handleUse} loading={usingId === t.id} />
                  ))}
                </div>
              </div>
            )}

            {/* All templates */}
            {regular.length > 0 && (
              <div>
                {featured.length > 0 && (
                  <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "rgba(255,255,255,0.30)" }}>
                    All Templates
                  </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {regular.map((t) => (
                    <TemplateCard key={t.id} template={t} onUse={handleUse} loading={usingId === t.id} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

// ─── Template Card ────────────────────────────────────────────────────────────

interface TemplateCardProps {
  template: Template;
  onUse: (t: Template) => void;
  loading: boolean;
}

function TemplateCard({ template: t, onUse, loading }: TemplateCardProps) {
  const planColor = PLAN_COLORS[t.plan_required] ?? PLAN_COLORS.free;

  return (
    <div
      className="relative flex flex-col rounded-2xl border overflow-hidden transition-all duration-200"
      style={{
        backgroundColor: "#0d1117",
        borderColor: t.featured ? "rgba(59,91,252,0.30)" : "rgba(255,255,255,0.07)",
        opacity: t.locked ? 0.75 : 1,
      }}
    >
      {/* Featured glow */}
      {t.featured && (
        <div
          className="absolute inset-0 pointer-events-none rounded-2xl"
          style={{ boxShadow: "inset 0 0 0 1px rgba(59,91,252,0.25)" }}
        />
      )}

      <div className="flex flex-col gap-3 p-5 flex-1">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
            style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
          >
            {t.icon}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-shrink-0">
            <span
              className="px-2 py-0.5 rounded-full text-xs font-semibold"
              style={planColor}
            >
              {PLAN_LABELS[t.plan_required] ?? t.plan_required}
            </span>
            {t.locked && <Lock size={12} style={{ color: "rgba(255,255,255,0.35)" }} />}
          </div>
        </div>

        {/* Name + description */}
        <div>
          <h3 className="text-sm font-bold text-white mb-1">{t.name}</h3>
          <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
            {t.description ?? `A pre-built ${t.category.toLowerCase()} agent template.`}
          </p>
        </div>

        {/* Tools */}
        {t.tools_json?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
            {t.tools_json.map((toolId) => {
              const info = CONNECTOR_LABELS[toolId];
              if (!info) return null;
              return (
                <span
                  key={toolId}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)" }}
                >
                  {info.icon} {info.label}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="px-5 pb-5">
        <button
          onClick={() => onUse(t)}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
          style={
            t.locked
              ? { backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)" }
              : { backgroundColor: "#3b5bfc", color: "#fff" }
          }
        >
          {loading ? (
            <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          ) : t.locked ? (
            <><Lock size={13} /> Upgrade to Unlock</>
          ) : (
            <>Use Template <ChevronRight size={14} /></>
          )}
        </button>
      </div>
    </div>
  );
}
