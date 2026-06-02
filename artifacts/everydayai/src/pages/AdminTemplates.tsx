import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/lib/supabase";
import { Plus, Pencil, Trash2, ArrowLeft, Star } from "lucide-react";

const CATEGORIES = ["General", "Sales", "Support", "Service", "Hospitality", "Marketing"];
const PLANS = ["free", "starter", "pro", "business"];
const PLAN_LABELS: Record<string, string> = {
  free: "Free", starter: "Starter", pro: "Pro", business: "Business",
};
const CONNECTOR_OPTIONS = [
  { id: "google_sheets", label: "Google Sheets", icon: "📊" },
  { id: "gmail",         label: "Gmail",          icon: "📧" },
  { id: "telegram",      label: "Telegram",       icon: "💬" },
  { id: "paystack",      label: "Paystack",       icon: "💳" },
  { id: "google_calendar", label: "Google Calendar", icon: "📅" },
  { id: "termii",        label: "Termii SMS",     icon: "🔔" },
  { id: "web_search",    label: "Web Search",     icon: "🔍" },
  { id: "hubspot",       label: "HubSpot",        icon: "👤" },
];

interface Template {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  instructions: string;
  tools_json: string[];
  plan_required: string;
  featured: boolean;
  published: boolean;
  icon: string;
  created_at: string;
  updated_at: string;
}

interface TemplateForm {
  name: string;
  slug: string;
  category: string;
  description: string;
  instructions: string;
  tools_json: string[];
  plan_required: string;
  featured: boolean;
  published: boolean;
  icon: string;
}

const emptyForm = (): TemplateForm => ({
  name: "", slug: "", category: "General", description: "",
  instructions: "", tools_json: [], plan_required: "free",
  featured: false, published: false, icon: "🤖",
});

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    free:     { bg: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.50)" },
    starter:  { bg: "rgba(59,91,252,0.15)",   color: "#818cf8" },
    pro:      { bg: "rgba(16,185,129,0.15)",  color: "#10b981" },
    business: { bg: "rgba(245,158,11,0.15)",  color: "#f59e0b" },
  };
  const c = colors[plan] ?? colors.free;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize" style={c}>
      {PLAN_LABELS[plan] ?? plan}
    </span>
  );
}

function StatusBadge({ published }: { published: boolean }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={
        published
          ? { backgroundColor: "rgba(16,185,129,0.12)", color: "#10b981" }
          : { backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.40)" }
      }
    >
      {published ? "Published" : "Draft"}
    </span>
  );
}

// ─── Editor ──────────────────────────────────────────────────────────────────

interface EditorProps {
  initial?: Template;
  onSave: (form: TemplateForm) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

function Editor({ initial, onSave, onCancel, saving }: EditorProps) {
  const [form, setForm] = useState<TemplateForm>(
    initial
      ? {
          name:          initial.name,
          slug:          initial.slug,
          category:      initial.category,
          description:   initial.description ?? "",
          instructions:  initial.instructions,
          tools_json:    initial.tools_json ?? [],
          plan_required: initial.plan_required,
          featured:      initial.featured,
          published:     initial.published,
          icon:          initial.icon,
        }
      : emptyForm()
  );

  function set<K extends keyof TemplateForm>(key: K, val: TemplateForm[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleNameChange(n: string) {
    setForm((f) => ({ ...f, name: n, slug: f.slug || slugify(n) }));
  }

  function toggleTool(toolId: string) {
    setForm((f) => ({
      ...f,
      tools_json: f.tools_json.includes(toolId)
        ? f.tools_json.filter((t) => t !== toolId)
        : [...f.tools_json, toolId],
    }));
  }

  const inputCls = "w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none transition-colors";
  const inputStyle = { backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" };
  const labelCls  = "block text-xs font-semibold mb-1.5";
  const labelStyle = { color: "rgba(255,255,255,0.50)" };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 text-sm transition-colors"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          <ArrowLeft size={15} /> Back
        </button>
        <span className="text-white font-semibold text-lg">
          {initial ? "Edit Template" : "New Template"}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Name */}
        <div>
          <label className={labelCls} style={labelStyle}>Template Name *</label>
          <input className={inputCls} style={inputStyle} placeholder="Lead Capture Agent"
            value={form.name} onChange={(e) => handleNameChange(e.target.value)} />
        </div>

        {/* Icon */}
        <div>
          <label className={labelCls} style={labelStyle}>Icon (emoji)</label>
          <input className={inputCls} style={inputStyle} placeholder="🤖"
            value={form.icon} onChange={(e) => set("icon", e.target.value)} />
        </div>

        {/* Slug */}
        <div>
          <label className={labelCls} style={labelStyle}>Slug</label>
          <input className={inputCls} style={inputStyle} placeholder="lead-capture-agent"
            value={form.slug} onChange={(e) => set("slug", e.target.value)} />
        </div>

        {/* Category */}
        <div>
          <label className={labelCls} style={labelStyle}>Category</label>
          <select className={inputCls} style={inputStyle}
            value={form.category} onChange={(e) => set("category", e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Plan */}
        <div>
          <label className={labelCls} style={labelStyle}>Minimum Plan Required</label>
          <select className={inputCls} style={inputStyle}
            value={form.plan_required} onChange={(e) => set("plan_required", e.target.value)}>
            {PLANS.map((p) => <option key={p} value={p}>{PLAN_LABELS[p]}</option>)}
          </select>
        </div>

        {/* Description */}
        <div>
          <label className={labelCls} style={labelStyle}>Short Description</label>
          <input className={inputCls} style={inputStyle} placeholder="What this agent does in one sentence"
            value={form.description} onChange={(e) => set("description", e.target.value)} />
        </div>

        {/* Toggles */}
        <div className="flex gap-6 items-center pt-1">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => set("published", !form.published)}
              className="w-10 h-5 rounded-full transition-colors relative cursor-pointer"
              style={{ backgroundColor: form.published ? "#3b5bfc" : "rgba(255,255,255,0.12)" }}
            >
              <div
                className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                style={{ transform: form.published ? "translateX(20px)" : "translateX(2px)" }}
              />
            </div>
            <span className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>Published</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => set("featured", !form.featured)}
              className="w-10 h-5 rounded-full transition-colors relative cursor-pointer"
              style={{ backgroundColor: form.featured ? "#f59e0b" : "rgba(255,255,255,0.12)" }}
            >
              <div
                className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                style={{ transform: form.featured ? "translateX(20px)" : "translateX(2px)" }}
              />
            </div>
            <span className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>Featured</span>
          </label>
        </div>

        {/* Tools */}
        <div className="md:col-span-2">
          <label className={labelCls} style={labelStyle}>Pre-configured Tools</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {CONNECTOR_OPTIONS.map((opt) => {
              const active = form.tools_json.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggleTool(opt.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
                  style={
                    active
                      ? { backgroundColor: "rgba(59,91,252,0.18)", borderColor: "#3b5bfc", color: "#818cf8" }
                      : { backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.45)" }
                  }
                >
                  <span>{opt.icon}</span> {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Instructions */}
        <div className="md:col-span-2">
          <label className={labelCls} style={labelStyle}>Agent Instructions *</label>
          <textarea
            className={`${inputCls} resize-none font-mono text-xs`}
            style={{ ...inputStyle, minHeight: "280px" }}
            placeholder="You are a professional lead capture agent. Your job is to..."
            value={form.instructions}
            onChange={(e) => set("instructions", e.target.value)}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={() => void onSave(form)}
          disabled={saving || !form.name.trim() || !form.instructions.trim()}
          className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
          style={{ backgroundColor: "#3b5bfc" }}
        >
          {saving ? "Saving…" : (initial ? "Save Changes" : "Create Template")}
        </button>
        <button
          onClick={onCancel}
          className="px-5 py-2.5 rounded-lg text-sm border transition-all"
          style={{ borderColor: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.45)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [view, setView]           = useState<"list" | "create" | "edit">("list");
  const [editing, setEditing]     = useState<Template | null>(null);
  const [saving, setSaving]       = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [deleting, setDeleting]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/templates", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load templates");
      const data = await res.json() as { templates: Template[] };
      setTemplates(data.templates ?? []);
    } catch {
      setError("Failed to load templates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleSave(form: TemplateForm) {
    setSaving(true);
    try {
      const token = await getToken();
      const isEdit = view === "edit" && editing;
      const url    = isEdit ? `/api/admin/templates/${editing!.id}` : "/api/admin/templates";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Save failed");
      }
      await load();
      setView("list");
      setEditing(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/templates/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Delete failed");
      await load();
      setDeleteTarget(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function togglePublished(t: Template) {
    try {
      const token = await getToken();
      await fetch(`/api/admin/templates/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ published: !t.published }),
      });
      await load();
    } catch { /* silent */ }
  }

  const row = "flex items-center justify-between px-5 py-4 border-b transition-colors hover:bg-white/[0.02]";
  const rowBorder = { borderColor: "rgba(255,255,255,0.06)" };

  return (
    <AdminLayout activeItemId="templates">
      <div className="flex flex-col gap-6 p-6 md:p-8 max-w-6xl mx-auto">

        {/* Delete confirm */}
        {deleteTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ backgroundColor: "rgba(0,0,0,0.70)", backdropFilter: "blur(3px)" }}
          >
            <div className="w-full max-w-sm rounded-2xl border px-7 py-7 flex flex-col gap-5"
              style={{ backgroundColor: "#111827", borderColor: "rgba(255,255,255,0.08)" }}>
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
                  style={{ backgroundColor: "rgba(239,68,68,0.12)" }}>
                  🗑️
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-1.5">Delete Template?</h3>
                  <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                    This will permanently delete <span className="text-white font-medium">"{deleteTarget.name}"</span>.
                    Users who already created agents from this template will keep their agents.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)" }}>
                  Cancel
                </button>
                <button onClick={() => void handleDelete(deleteTarget.id)} disabled={deleting}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: "#dc2626" }}>
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {view !== "list" ? (
          <Editor
            initial={editing ?? undefined}
            onSave={handleSave}
            onCancel={() => { setView("list"); setEditing(null); }}
            saving={saving}
          />
        ) : (
          <>
            {/* Page header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-xl font-bold text-white">Templates</h1>
                <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.40)" }}>
                  Manage agent templates shown in the user dashboard
                </p>
              </div>
              <button
                onClick={() => { setEditing(null); setView("create"); }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                style={{ backgroundColor: "#3b5bfc" }}
              >
                <Plus size={16} /> New Template
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Total",     value: templates.length },
                { label: "Published", value: templates.filter((t) => t.published).length },
                { label: "Featured",  value: templates.filter((t) => t.featured).length },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border px-4 py-4"
                  style={{ backgroundColor: "#0d1117", borderColor: "rgba(255,255,255,0.07)" }}>
                  <p className="text-2xl font-bold text-white">{s.value}</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.40)" }}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* Table */}
            <div className="rounded-xl border overflow-hidden"
              style={{ backgroundColor: "#0d1117", borderColor: "rgba(255,255,255,0.07)" }}>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                </div>
              ) : error ? (
                <p className="text-center py-12 text-sm" style={{ color: "#f87171" }}>{error}</p>
              ) : templates.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16">
                  <span className="text-4xl">📋</span>
                  <p className="text-sm" style={{ color: "rgba(255,255,255,0.40)" }}>
                    No templates yet. Create your first one.
                  </p>
                </div>
              ) : (
                <>
                  {/* Table header */}
                  <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_auto] px-5 py-3 border-b"
                    style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    {["Template", "Category", "Plan", "Status", "Actions"].map((h) => (
                      <span key={h} className="text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "rgba(255,255,255,0.30)" }}>{h}</span>
                    ))}
                  </div>

                  {templates.map((t) => (
                    <div key={t.id} className={row} style={rowBorder}>
                      {/* Name + icon */}
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xl flex-shrink-0">{t.icon}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-white truncate">{t.name}</p>
                            {t.featured && (
                              <Star size={11} className="flex-shrink-0" style={{ color: "#f59e0b" }} fill="#f59e0b" />
                            )}
                          </div>
                          <p className="text-xs truncate" style={{ color: "rgba(255,255,255,0.35)" }}>
                            {t.description ?? t.slug}
                          </p>
                        </div>
                      </div>

                      {/* Category */}
                      <span className="hidden md:block text-xs" style={{ color: "rgba(255,255,255,0.50)" }}>
                        {t.category}
                      </span>

                      {/* Plan */}
                      <div className="hidden md:block">
                        <PlanBadge plan={t.plan_required} />
                      </div>

                      {/* Status */}
                      <div className="hidden md:flex items-center gap-2">
                        <button onClick={() => void togglePublished(t)} title="Toggle published">
                          <StatusBadge published={t.published} />
                        </button>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => { setEditing(t); setView("edit"); }}
                          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                          style={{ color: "rgba(255,255,255,0.40)" }}
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(t)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                          style={{ color: "rgba(239,68,68,0.60)" }}
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
