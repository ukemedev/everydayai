import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AppLayout from "@/components/AppLayout";
import UpgradeModal from "@/components/UpgradeModal";

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

// ── Helper ────────────────────────────────────────────────────────────────────

async function getAuthHeader(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? `Bearer ${session.access_token}` : null;
}

function formatNaira(kobo: number): string {
  return "₦" + (kobo / 100).toLocaleString("en-NG");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", {
    year: "numeric", month: "short", day: "numeric",
  });
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function UsageBar({
  label, used, limit, color,
}: {
  label: string;
  used: number;
  limit: number | null;
  color: string;
}) {
  const pct      = limit === null ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const limitStr = limit === null ? "Unlimited" : limit.toLocaleString();
  const usedStr  = used.toLocaleString();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white">{label}</span>
        <span className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
          {usedStr} / {limitStr}
        </span>
      </div>
      <div
        className="w-full rounded-full overflow-hidden"
        style={{ height: "6px", backgroundColor: "rgba(255,255,255,0.07)" }}
      >
        {limit === null ? (
          /* Unlimited — show a full, subtly animated bar */
          <div
            className="h-full rounded-full"
            style={{ width: "100%", backgroundColor: color, opacity: 0.4 }}
          />
        ) : (
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        )}
      </div>
      {limit !== null && (
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
          {pct}% used
        </p>
      )}
      {limit === null && (
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
          Unlimited on your plan
        </p>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Billing() {
  const [data, setData]           = useState<BillingData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      const auth = await getAuthHeader();
      if (!auth) { setError("Not authenticated"); setLoading(false); return; }

      try {
        const res = await fetch("/api/billing", { headers: { Authorization: auth } });
        if (!res.ok) {
          const body = await res.json() as { error?: string };
          setError(body.error ?? "Failed to load billing data");
          setLoading(false);
          return;
        }
        const json = await res.json() as BillingData;
        setData(json);
      } catch {
        setError("Something went wrong. Please refresh.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const plan = data?.currentPlan ?? "free";
  const meta = getPlanMeta(plan);

  return (
    <AppLayout activeItemId="billing">
      <main
        className="flex-1 px-4 md:px-8 py-6 md:py-10"
        style={{ backgroundColor: "#0a0f1e" }}
      >
        <div className="max-w-3xl w-full mx-auto flex flex-col gap-6">

          {/* ── Page header ─────────────────────────────────────────────── */}
          <div>
            <h1 className="text-2xl font-bold text-white">Billing</h1>
            <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
              Manage your plan, track usage, and view payment history.
            </p>
          </div>

          {/* ── Loading skeleton ─────────────────────────────────────────── */}
          {loading && (
            <div className="flex flex-col gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl border animate-pulse"
                  style={{
                    backgroundColor: "#131a2e",
                    borderColor: "rgba(255,255,255,0.06)",
                    height: i === 1 ? "140px" : i === 2 ? "180px" : "220px",
                  }}
                />
              ))}
            </div>
          )}

          {/* ── Error state ──────────────────────────────────────────────── */}
          {!loading && error && (
            <div
              className="rounded-2xl border px-6 py-8 text-center"
              style={{ backgroundColor: "#131a2e", borderColor: "rgba(239,68,68,0.2)" }}
            >
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* ── Loaded content ───────────────────────────────────────────── */}
          {!loading && data && (
            <>
              {/* ── Current Plan card ─────────────────────────────────────── */}
              <div
                className="rounded-2xl border p-6"
                style={{ backgroundColor: "#131a2e", borderColor: "rgba(255,255,255,0.06)" }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
                      Current Plan
                    </p>
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl font-bold text-white capitalize">{meta.label}</h2>
                      <span
                        className="text-xs font-bold px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: meta.bg, color: meta.color }}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
                      {plan === "free"
                        ? "Free forever — upgrade any time"
                        : `${meta.price} / month`}
                    </p>
                  </div>

                  {plan !== "business" && (
                    <button
                      onClick={() => setUpgradeOpen(true)}
                      className="self-start sm:self-center flex-shrink-0 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                      style={{ backgroundColor: "#3b5bfc" }}
                    >
                      Upgrade Plan
                    </button>
                  )}
                </div>
              </div>

              {/* ── Usage this month ───────────────────────────────────────── */}
              <div
                className="rounded-2xl border p-6 flex flex-col gap-6"
                style={{ backgroundColor: "#131a2e", borderColor: "rgba(255,255,255,0.06)" }}
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "rgba(255,255,255,0.3)" }}>
                    Usage This Month
                  </p>
                  <div className="flex flex-col gap-6">
                    <UsageBar
                      label="Messages Used"
                      used={data.messageCount}
                      limit={data.messageLimit}
                      color={meta.color}
                    />
                    <UsageBar
                      label="Agents Created"
                      used={data.agentCount}
                      limit={data.agentLimit}
                      color={meta.color}
                    />
                  </div>
                </div>
              </div>

              {/* ── Payment history ────────────────────────────────────────── */}
              <div
                className="rounded-2xl border overflow-hidden"
                style={{ backgroundColor: "#131a2e", borderColor: "rgba(255,255,255,0.06)" }}
              >
                <div className="px-6 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
                    Payment History
                  </p>
                </div>

                {data.payments.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4"
                      style={{ backgroundColor: "rgba(59,91,252,0.1)" }}
                    >
                      💳
                    </div>
                    <p className="text-sm font-medium text-white mb-1">No payments yet</p>
                    <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                      Upgrade your plan to see payment history here.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                          {["Date", "Plan", "Amount", "Status"].map((h) => (
                            <th
                              key={h}
                              className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                              style={{ color: "rgba(255,255,255,0.3)" }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.payments.map((p, i) => {
                          const pmeta = getPlanMeta(p.plan);
                          return (
                            <tr
                              key={p.id}
                              style={{
                                borderBottom: i < data.payments.length - 1
                                  ? "1px solid rgba(255,255,255,0.04)"
                                  : "none",
                              }}
                            >
                              <td className="px-6 py-4 text-white/70 whitespace-nowrap">
                                {formatDate(p.created_at)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span
                                  className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
                                  style={{ backgroundColor: pmeta.bg, color: pmeta.color }}
                                >
                                  {pmeta.label}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-white font-medium whitespace-nowrap">
                                {formatNaira(p.amount)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {p.status === "success" ? (
                                  <span
                                    className="text-xs font-semibold px-2.5 py-1 rounded-full"
                                    style={{ backgroundColor: "rgba(74,222,128,0.12)", color: "#4ade80" }}
                                  >
                                    Success
                                  </span>
                                ) : (
                                  <span
                                    className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
                                    style={{ backgroundColor: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)" }}
                                  >
                                    {p.status}
                                  </span>
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
      </main>

      <UpgradeModal
        isOpen={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        reason="message_limit"
        currentPlan={plan}
      />
    </AppLayout>
  );
}
