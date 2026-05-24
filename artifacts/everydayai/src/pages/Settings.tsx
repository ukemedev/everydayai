import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AppLayout from "@/components/AppLayout";
import UpgradeModal from "@/components/UpgradeModal";

// ── API key providers ─────────────────────────────────────────────────────────

const providers = [
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o, GPT-4o Mini",
    placeholder: "sk-...",
    accentColor: "#10a37f",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0L4.4 14.6407a4.5 4.5 0 0 1-2.0592-6.7451zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.4502 2.5685a4.4894 4.4894 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.6813zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.4503-2.5632a4.4948 4.4948 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" fill="currentColor"/>
      </svg>
    ),
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude 3.5 Sonnet, Claude 3 Haiku",
    placeholder: "sk-ant-...",
    accentColor: "#cc785c",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-7.258 0h3.767L16.906 20h-3.674l-1.343-3.461H5.017L3.674 20H0L6.57 3.52zm4.132 9.959L8.453 7.687 6.205 13.48h4.496z" fill="currentColor"/>
      </svg>
    ),
  },
  {
    id: "google",
    name: "Google Gemini",
    description: "Gemini 1.5 Pro, Gemini 1.5 Flash",
    placeholder: "AIza...",
    accentColor: "#4285f4",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 24A14.304 14.304 0 0 0 24 12 14.304 14.304 0 0 0 12 0 14.304 14.304 0 0 0 0 12a14.304 14.304 0 0 0 12 12zm0-2.308a12 12 0 0 1 0-19.384V21.69zm0-19.384a12 12 0 0 1 0 19.384V2.308z" fill="currentColor"/>
      </svg>
    ),
  },
  {
    id: "groq",
    name: "Groq",
    description: "Llama 3, Mixtral (Free tier available)",
    placeholder: "gsk_...",
    accentColor: "#f55036",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
        <circle cx="12" cy="12" r="4" fill="currentColor"/>
      </svg>
    ),
  },
];

// ── Plan metadata ─────────────────────────────────────────────────────────────

const PLAN_META: Record<string, { label: string; color: string; bg: string; price: string }> = {
  free:     { label: "Free",     color: "#9ca3af", bg: "rgba(156,163,175,0.12)", price: "₦0"       },
  starter:  { label: "Starter",  color: "#4ade80", bg: "rgba(74,222,128,0.12)", price: "₦8,000"   },
  pro:      { label: "Pro",      color: "#3b5bfc", bg: "rgba(59,91,252,0.15)",  price: "₦24,000"  },
  business: { label: "Business", color: "#f59e0b", bg: "rgba(245,158,11,0.12)", price: "₦56,000"  },
};

function getPlanMeta(plan: string) {
  return PLAN_META[plan] ?? PLAN_META.free;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface KeyState {
  inputValue: string;
  maskedKey: string | null;
  saving: boolean;
  removing: boolean;
}

interface Payment {
  id: string;
  plan: string;
  amount: number;
  status: string;
  created_at: string;
}

interface BillingData {
  currentPlan:  string;
  messageCount: number;
  messageLimit: number | null;
  agentCount:   number;
  agentLimit:   number | null;
  payments:     Payment[];
}

type Section = "profile" | "apikeys" | "billing" | null;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getAuthHeader(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? `Bearer ${session.access_token}` : null;
}

function formatNaira(kobo: number): string {
  return "₦" + (kobo / 100).toLocaleString("en-NG");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" });
}

// ── UsageBar ──────────────────────────────────────────────────────────────────

function UsageBar({ label, used, limit, color }: { label: string; used: number; limit: number | null; color: string }) {
  const pct      = limit === null ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const limitStr = limit === null ? "Unlimited" : limit.toLocaleString();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/70">{label}</span>
        <span className="text-xs text-white/40">{used.toLocaleString()} / {limitStr}</span>
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: "5px", backgroundColor: "rgba(255,255,255,0.07)" }}>
        {limit === null ? (
          <div className="h-full rounded-full" style={{ width: "100%", backgroundColor: color, opacity: 0.4 }} />
        ) : (
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
        )}
      </div>
      <p className="text-xs text-white/25">
        {limit === null ? "Unlimited on your plan" : `${pct}% used`}
      </p>
    </div>
  );
}

// ── Row components ────────────────────────────────────────────────────────────

function RowDivider() {
  return <div style={{ height: "1px", backgroundColor: "rgba(255,255,255,0.05)", marginLeft: "60px" }} />;
}

function SectionRow({
  emoji, label, open, onClick, right,
}: {
  emoji: string;
  label: string;
  open?: boolean;
  onClick?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <button
      className="w-full flex items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-white/[0.02] active:bg-white/[0.04]"
      onClick={onClick}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
        style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
      >
        {emoji}
      </div>
      <span className="flex-1 text-sm font-medium text-white">{label}</span>
      {right ?? (
        onClick && (
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            className="flex-shrink-0 transition-transform duration-200"
            style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", color: "rgba(255,255,255,0.25)" }}
          >
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )
      )}
    </button>
  );
}

// ── Main Settings export ──────────────────────────────────────────────────────

export default function Settings() {
  const [openSection, setOpenSection] = useState<Section>(null);
  const [theme, setTheme]             = useState<"dark" | "light">("dark");
  const [toast, setToast]             = useState("");

  // Profile
  const [userEmail, setUserEmail]       = useState("");
  const [memberSince, setMemberSince]   = useState("");

  // API keys
  const [keyStates, setKeyStates] = useState<Record<string, KeyState>>(
    Object.fromEntries(providers.map((p) => [p.id, { inputValue: "", maskedKey: null, saving: false, removing: false }]))
  );

  // Billing
  const [billingData, setBillingData]     = useState<BillingData | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError]   = useState("");
  const [upgradeOpen, setUpgradeOpen]     = useState(false);

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    // User profile
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email ?? "");
      if (user?.created_at) {
        setMemberSince(new Date(user.created_at).toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" }));
      }
    });

    // Saved API keys
    void (async () => {
      const auth = await getAuthHeader();
      if (!auth) return;
      const res = await fetch("/api/keys/list", { headers: { Authorization: auth } });
      if (!res.ok) return;
      const data = await res.json() as { keys: { provider: string; masked: string }[] };
      setKeyStates((prev) => {
        const next = { ...prev };
        for (const { provider, masked } of data.keys) {
          if (next[provider]) next[provider] = { ...next[provider], maskedKey: masked };
        }
        return next;
      });
    })();

    // Theme preference
    const saved = localStorage.getItem("theme") as "dark" | "light" | null;
    if (saved) setTheme(saved);
  }, []);

  // Fetch billing when section opens
  useEffect(() => {
    if (openSection !== "billing" || billingData || billingLoading) return;
    void (async () => {
      setBillingLoading(true);
      const auth = await getAuthHeader();
      if (!auth) { setBillingError("Not authenticated"); setBillingLoading(false); return; }
      try {
        const res = await fetch("/api/billing", { headers: { Authorization: auth } });
        if (!res.ok) {
          const body = await res.json() as { error?: string };
          setBillingError(body.error ?? "Failed to load billing data");
          return;
        }
        setBillingData(await res.json() as BillingData);
      } catch { setBillingError("Something went wrong."); }
      finally { setBillingLoading(false); }
    })();
  }, [openSection, billingData, billingLoading]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 3000); }
  function toggleSection(s: Exclude<Section, null>) { setOpenSection((p) => p === s ? null : s); }

  function handleTheme(next: "dark" | "light") {
    setTheme(next);
    localStorage.setItem("theme", next);
  }

  function setInputVal(id: string, val: string) {
    setKeyStates((p) => ({ ...p, [id]: { ...p[id], inputValue: val } }));
  }

  async function handleSaveKey(id: string) {
    const val = keyStates[id].inputValue.trim();
    if (!val) return;
    setKeyStates((p) => ({ ...p, [id]: { ...p[id], saving: true } }));
    const auth = await getAuthHeader();
    if (!auth) { setKeyStates((p) => ({ ...p, [id]: { ...p[id], saving: false } })); return; }
    const res = await fetch("/api/keys/save", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({ provider: id, apiKey: val }),
    });
    if (res.ok) {
      const masked = "••••••••••••" + (val.length > 4 ? val.slice(-4) : val);
      setKeyStates((p) => ({ ...p, [id]: { inputValue: "", maskedKey: masked, saving: false, removing: false } }));
      showToast("API key saved successfully");
    } else {
      setKeyStates((p) => ({ ...p, [id]: { ...p[id], saving: false } }));
      showToast("Failed to save key");
    }
  }

  async function handleRemoveKey(id: string) {
    setKeyStates((p) => ({ ...p, [id]: { ...p[id], removing: true } }));
    const auth = await getAuthHeader();
    if (!auth) { setKeyStates((p) => ({ ...p, [id]: { ...p[id], removing: false } })); return; }
    const res = await fetch("/api/keys/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({ provider: id }),
    });
    if (res.ok) {
      setKeyStates((p) => ({ ...p, [id]: { inputValue: "", maskedKey: null, saving: false, removing: false } }));
      showToast("API key removed");
    } else {
      setKeyStates((p) => ({ ...p, [id]: { ...p[id], removing: false } }));
      showToast("Failed to remove key");
    }
  }

  const plan     = billingData?.currentPlan ?? "free";
  const planMeta = getPlanMeta(plan);
  const inputBg  = { backgroundColor: "#0a0f1e", color: "#ffffff", border: "1px solid rgba(255,255,255,0.08)" };

  return (
    <AppLayout activeItemId="settings">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium text-white shadow-lg" style={{ backgroundColor: "#16a34a" }}>
          ✓ {toast}
        </div>
      )}

      <UpgradeModal
        isOpen={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        reason="message_limit"
        currentPlan={plan}
      />

      <main className="flex-1 px-4 md:px-8 py-6 md:py-8" style={{ backgroundColor: "#0a0f1e" }}>
        <div className="max-w-xl">
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-sm mt-1 text-white/40">Manage your account and preferences</p>

          {/* ── Settings list card ───────────────────────────────────────────── */}
          <div
            className="mt-6 rounded-2xl overflow-hidden"
            style={{ backgroundColor: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}
          >

            {/* ── Profile ───────────────────────────────────────────────────── */}
            <SectionRow
              emoji="👤"
              label="Profile"
              open={openSection === "profile"}
              onClick={() => toggleSection("profile")}
            />

            {openSection === "profile" && (
              <div
                className="px-4 pb-5 pt-1 flex flex-col gap-3"
                style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
              >
                <div className="flex flex-col gap-3 rounded-xl px-4 py-4" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-white/30">Email</span>
                    <span className="text-sm text-white/80">{userEmail || "—"}</span>
                  </div>
                  {memberSince && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-white/30">Member Since</span>
                      <span className="text-sm text-white/80">{memberSince}</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-white/25 text-center">Profile editing coming soon</p>
              </div>
            )}

            <RowDivider />

            {/* ── API Keys ──────────────────────────────────────────────────── */}
            <SectionRow
              emoji="🔑"
              label="API Keys"
              open={openSection === "apikeys"}
              onClick={() => toggleSection("apikeys")}
            />

            {openSection === "apikeys" && (
              <div
                className="px-4 pb-5 pt-4 flex flex-col gap-3"
                style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
              >
                <p className="text-xs text-white/35 -mt-1">
                  Add your API keys to power your agents. Keys are encrypted and stored securely.
                </p>
                {providers.map((provider) => {
                  const state     = keyStates[provider.id];
                  const connected = !!state.maskedKey;
                  return (
                    <div
                      key={provider.id}
                      className="rounded-xl border p-4 flex flex-col gap-3"
                      style={{ backgroundColor: "#0d1117", borderColor: "rgba(255,255,255,0.07)" }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: provider.accentColor + "22", color: provider.accentColor }}
                          >
                            {provider.icon}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white leading-tight">{provider.name}</p>
                            <p className="text-[11px] text-white/35 mt-0.5">{provider.description}</p>
                          </div>
                        </div>
                        {connected && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: "rgba(34,197,94,0.15)", color: "#4ade80" }}>
                            ✓ Connected
                          </span>
                        )}
                      </div>

                      {connected && (
                        <div
                          className="flex items-center justify-between rounded-lg px-3 py-2 border"
                          style={{ backgroundColor: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}
                        >
                          <span className="text-sm font-mono tracking-wider text-white/45">{state.maskedKey}</span>
                          <button
                            onClick={() => void handleRemoveKey(provider.id)}
                            disabled={state.removing}
                            className="text-xs text-red-400/70 hover:text-red-400 transition-colors ml-3 flex-shrink-0 disabled:opacity-50"
                          >
                            {state.removing ? "Removing…" : "Remove"}
                          </button>
                        </div>
                      )}

                      <div className="flex flex-col gap-2">
                        <input
                          type="password"
                          placeholder={connected ? "Replace with new key…" : provider.placeholder}
                          value={state.inputValue}
                          onChange={(e) => setInputVal(provider.id, e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") void handleSaveKey(provider.id); }}
                          className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                          style={inputBg}
                        />
                        <button
                          onClick={() => void handleSaveKey(provider.id)}
                          disabled={!state.inputValue.trim() || state.saving}
                          className="w-full py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
                          style={{ backgroundColor: "#3b5bfc" }}
                        >
                          {state.saving ? "Saving…" : connected ? "Replace" : "Save"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <RowDivider />

            {/* ── Billing ───────────────────────────────────────────────────── */}
            <SectionRow
              emoji="💳"
              label="Billing"
              open={openSection === "billing"}
              onClick={() => toggleSection("billing")}
            />

            {openSection === "billing" && (
              <div
                className="px-4 pb-5 pt-4 flex flex-col gap-4"
                style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
              >
                {billingLoading && (
                  <div className="flex flex-col gap-3">
                    {[120, 160, 100].map((h, i) => (
                      <div key={i} className="rounded-xl animate-pulse" style={{ backgroundColor: "rgba(255,255,255,0.04)", height: h }} />
                    ))}
                  </div>
                )}

                {!billingLoading && billingError && (
                  <p className="text-sm text-red-400 text-center py-4">{billingError}</p>
                )}

                {!billingLoading && billingData && (
                  <>
                    {/* Current Plan */}
                    <div
                      className="rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                      style={{ backgroundColor: "#0d1117", borderColor: "rgba(255,255,255,0.07)" }}
                    >
                      <div className="flex flex-col gap-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/30">Current Plan</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <h3 className="text-lg font-bold text-white capitalize">{planMeta.label}</h3>
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: planMeta.bg, color: planMeta.color }}
                          >
                            {planMeta.label}
                          </span>
                        </div>
                        <p className="text-xs text-white/40">
                          {plan === "free" ? "Free forever — upgrade any time" : `${planMeta.price} / month`}
                        </p>
                      </div>
                      {plan !== "business" && (
                        <button
                          onClick={() => setUpgradeOpen(true)}
                          className="self-start sm:self-center flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                          style={{ backgroundColor: "#3b5bfc" }}
                        >
                          Upgrade Plan
                        </button>
                      )}
                    </div>

                    {/* Usage */}
                    <div
                      className="rounded-xl border p-4 flex flex-col gap-4"
                      style={{ backgroundColor: "#0d1117", borderColor: "rgba(255,255,255,0.07)" }}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/30">Usage This Month</p>
                      <UsageBar label="Messages Used" used={billingData.messageCount} limit={billingData.messageLimit} color={planMeta.color} />
                      <UsageBar label="Agents Created" used={billingData.agentCount} limit={billingData.agentLimit} color={planMeta.color} />
                    </div>

                    {/* Payment history */}
                    <div
                      className="rounded-xl border overflow-hidden"
                      style={{ backgroundColor: "#0d1117", borderColor: "rgba(255,255,255,0.07)" }}
                    >
                      <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/30">Payment History</p>
                      </div>

                      {billingData.payments.length === 0 ? (
                        <div className="px-4 py-8 text-center flex flex-col items-center gap-2">
                          <div className="text-2xl">💳</div>
                          <p className="text-sm font-medium text-white/60">No payments yet</p>
                          <p className="text-xs text-white/30">Upgrade your plan to see payment history here</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                                {["Date", "Plan", "Amount", "Status"].map((h) => (
                                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/30">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {billingData.payments.map((p, i) => {
                                const pm = getPlanMeta(p.plan);
                                return (
                                  <tr key={p.id} style={{ borderBottom: i < billingData.payments.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                                    <td className="px-4 py-3 text-white/60 whitespace-nowrap text-xs">{formatDate(p.created_at)}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full capitalize" style={{ backgroundColor: pm.bg, color: pm.color }}>
                                        {pm.label}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-white font-medium whitespace-nowrap text-sm">{formatNaira(p.amount)}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      {p.status === "success" ? (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(74,222,128,0.12)", color: "#4ade80" }}>Success</span>
                                      ) : (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full capitalize" style={{ backgroundColor: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.45)" }}>{p.status}</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            <RowDivider />

            {/* ── Theme ─────────────────────────────────────────────────────── */}
            <SectionRow
              emoji="🎨"
              label="Theme"
              right={
                <div className="flex items-center gap-1 p-1 rounded-lg flex-shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                  {(["dark", "light"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={(e) => { e.stopPropagation(); handleTheme(t); }}
                      className="px-3 py-1 rounded-md text-xs font-semibold transition-all duration-150 capitalize"
                      style={
                        theme === t
                          ? { backgroundColor: "#3b5bfc", color: "#ffffff" }
                          : { backgroundColor: "transparent", color: "rgba(255,255,255,0.35)" }
                      }
                    >
                      {t}
                    </button>
                  ))}
                </div>
              }
            />

          </div>
        </div>
      </main>
    </AppLayout>
  );
}
