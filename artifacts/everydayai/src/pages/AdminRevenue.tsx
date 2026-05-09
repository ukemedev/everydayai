import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecentPayment {
  id:         string;
  email:      string;
  plan:       string;
  amount:     number;
  created_at: string;
}

interface RevenueData {
  freeUsers:         number;
  starterUsers:      number;
  proUsers:          number;
  businessUsers:     number;
  monthlyRevenue:    number;
  totalRevenue:      number;
  revenueThisMonth:  number;
  totalTransactions: number;
  recentPayments:    RecentPayment[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

function formatNaira(n: number): string {
  return "₦" + n.toLocaleString("en-NG");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", {
    year: "numeric", month: "short", day: "numeric",
  });
}

const PLAN_META: Record<string, { label: string; color: string; bg: string }> = {
  free:     { label: "Free",     color: "#9ca3af", bg: "rgba(156,163,175,0.12)" },
  starter:  { label: "Starter",  color: "#4ade80", bg: "rgba(74,222,128,0.12)"  },
  pro:      { label: "Pro",      color: "#3b5bfc", bg: "rgba(59,91,252,0.15)"   },
  business: { label: "Business", color: "#f59e0b", bg: "rgba(245,158,11,0.12)"  },
};

function planMeta(plan: string) {
  return PLAN_META[plan] ?? PLAN_META.free;
}

// ── Plan card ─────────────────────────────────────────────────────────────────

interface PlanCardProps {
  label:       string;
  price:       string | null;
  count:       number;
  accentColor: string;
  bgColor:     string;
  borderColor: string;
}

function PlanCard({ label, price, count, accentColor, bgColor, borderColor }: PlanCardProps) {
  return (
    <div
      className="flex flex-col gap-3 rounded-xl p-4 overflow-hidden"
      style={{ backgroundColor: bgColor, border: `1px solid ${borderColor}` }}
    >
      {/* Label and badge stack vertically so the badge never overflows */}
      <div className="flex flex-col gap-1.5 min-w-0">
        <span className="text-sm font-semibold leading-tight" style={{ color: accentColor }}>
          {label}
        </span>
        {price && (
          <span
            className="self-start text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
            style={{ backgroundColor: borderColor, color: accentColor }}
          >
            {price}/mo
          </span>
        )}
      </div>
      <p className="text-3xl font-bold text-white leading-none">{count.toLocaleString()}</p>
      <p className="text-xs" style={{ color: "rgba(255,255,255,0.40)" }}>
        {count === 1 ? "user" : "users"}
      </p>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-xl p-5 flex-1 overflow-hidden min-w-0"
      style={{
        backgroundColor: "rgba(59,91,252,0.07)",
        border: "1px solid rgba(59,91,252,0.18)",
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.40)" }}>
        {label}
      </p>
      <p className="text-2xl sm:text-3xl font-bold break-words min-w-0" style={{ color: "#3b5bfc" }}>{value}</p>
      {sub && <p className="text-xs" style={{ color: "rgba(255,255,255,0.30)" }}>{sub}</p>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminRevenue() {
  const [data, setData]     = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(false);

  const fetchRevenue = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/revenue", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      setData((await res.json()) as RevenueData);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchRevenue(); }, [fetchRevenue]);

  return (
    <AdminLayout activeItemId="revenue">
      <div className="flex-1 p-6 md:p-8">
        <h1 className="text-2xl font-bold text-white">Revenue</h1>
        <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.40)" }}>
          Platform earnings overview
        </p>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 rounded-full border-2 border-[#3b5bfc] border-t-transparent animate-spin" />
          </div>
        )}

        {!loading && error && (
          <p className="text-sm py-10 text-center" style={{ color: "#f87171" }}>
            Could not load revenue data — check the API connection.
          </p>
        )}

        {!loading && data && (
          <div className="mt-8 flex flex-col gap-6">

            {/* ── Plan user counts ──────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <PlanCard
                label="Free"
                price={null}
                count={data.freeUsers}
                accentColor="rgba(255,255,255,0.55)"
                bgColor="rgba(255,255,255,0.04)"
                borderColor="rgba(255,255,255,0.08)"
              />
              <PlanCard
                label="Starter"
                price="₦8,000"
                count={data.starterUsers}
                accentColor="#4ade80"
                bgColor="rgba(74,222,128,0.06)"
                borderColor="rgba(74,222,128,0.20)"
              />
              <PlanCard
                label="Pro"
                price="₦24,000"
                count={data.proUsers}
                accentColor="#3b5bfc"
                bgColor="rgba(59,91,252,0.06)"
                borderColor="rgba(59,91,252,0.20)"
              />
              <PlanCard
                label="Business"
                price="₦56,000"
                count={data.businessUsers}
                accentColor="#f59e0b"
                bgColor="rgba(245,158,11,0.06)"
                borderColor="rgba(245,158,11,0.20)"
              />
            </div>

            {/* ── MRR summary ───────────────────────────────────────────── */}
            <div
              className="rounded-xl p-6 flex flex-col gap-2 overflow-hidden min-w-0"
              style={{
                border: "1px solid rgba(16,185,129,0.20)",
                backgroundColor: "rgba(16,185,129,0.05)",
              }}
            >
              <p className="text-sm font-semibold uppercase tracking-wide"
                style={{ color: "rgba(255,255,255,0.40)" }}>
                Monthly Recurring Revenue (estimated)
              </p>
              <p
                className="text-3xl sm:text-4xl font-bold break-words min-w-0"
                style={{ color: "#10b981" }}
              >
                {formatNaira(data.monthlyRevenue)}
              </p>
              <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                Based on current active subscriptions
              </p>
            </div>

            {/* ── Actual Revenue ────────────────────────────────────────── */}
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide"
                style={{ color: "rgba(255,255,255,0.40)" }}>
                Actual Revenue
              </h2>
              <div className="flex flex-col sm:flex-row gap-4">
                <StatCard
                  label="Total Revenue"
                  value={formatNaira(data.totalRevenue)}
                  sub="All time, successful payments"
                />
                <StatCard
                  label="This Month"
                  value={formatNaira(data.revenueThisMonth)}
                  sub="Successful payments this calendar month"
                />
              </div>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                {data.totalTransactions.toLocaleString()} total successful{" "}
                {data.totalTransactions === 1 ? "transaction" : "transactions"}
              </p>
            </div>

            {/* ── Recent Payments ───────────────────────────────────────── */}
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide"
                style={{ color: "rgba(255,255,255,0.40)" }}>
                Recent Payments
              </h2>

              <div
                className="rounded-xl overflow-hidden"
                style={{ border: "1px solid rgba(255,255,255,0.07)" }}
              >
                {data.recentPayments.length === 0 ? (
                  <div
                    className="px-6 py-12 text-center"
                    style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mx-auto mb-3"
                      style={{ backgroundColor: "rgba(59,91,252,0.10)" }}
                    >
                      💳
                    </div>
                    <p className="text-sm font-medium text-white mb-1">No payments yet</p>
                    <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                      Revenue will appear here once users start paying.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr
                          style={{
                            backgroundColor: "rgba(255,255,255,0.03)",
                            borderBottom: "1px solid rgba(255,255,255,0.07)",
                          }}
                        >
                          {["Email", "Plan", "Amount", "Date"].map((h) => (
                            <th
                              key={h}
                              className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                              style={{ color: "rgba(255,255,255,0.35)" }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.recentPayments.map((p, i) => {
                          const pm = planMeta(p.plan);
                          return (
                            <tr
                              key={p.id}
                              style={{
                                backgroundColor: i % 2 === 0
                                  ? "transparent"
                                  : "rgba(255,255,255,0.015)",
                                borderBottom: i < data.recentPayments.length - 1
                                  ? "1px solid rgba(255,255,255,0.05)"
                                  : "none",
                              }}
                            >
                              <td className="px-5 py-3.5 text-white/70 truncate max-w-[200px]">
                                {p.email}
                              </td>
                              <td className="px-5 py-3.5">
                                <span
                                  className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
                                  style={{ backgroundColor: pm.bg, color: pm.color }}
                                >
                                  {pm.label}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-white font-medium whitespace-nowrap">
                                {formatNaira(p.amount)}
                              </td>
                              <td className="px-5 py-3.5 whitespace-nowrap"
                                style={{ color: "rgba(255,255,255,0.45)" }}>
                                {formatDate(p.created_at)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </AdminLayout>
  );
}
