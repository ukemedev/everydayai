import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/lib/supabase";

interface RevenueData {
  freeUsers: number;
  proUsers: number;
  businessUsers: number;
  monthlyRevenue: number;
}

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

interface PlanCardProps {
  label: string;
  price: string | null;
  count: number;
  accentColor: string;
  bgColor: string;
  borderColor: string;
}

function PlanCard({ label, price, count, accentColor, bgColor, borderColor }: PlanCardProps) {
  return (
    <div
      className="flex flex-col gap-3 rounded-xl p-5"
      style={{ backgroundColor: bgColor, border: `1px solid ${borderColor}` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color: accentColor }}>
          {label}
        </span>
        {price && (
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: borderColor, color: accentColor }}
          >
            {price}/mo
          </span>
        )}
      </div>
      <p className="text-3xl font-bold text-white">{count.toLocaleString()}</p>
      <p className="text-xs" style={{ color: "rgba(255,255,255,0.40)" }}>
        {count === 1 ? "user" : "users"}
      </p>
    </div>
  );
}

export default function AdminRevenue() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchRevenue = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/revenue", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      const json = (await res.json()) as RevenueData;
      setData(json);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRevenue(); }, [fetchRevenue]);

  return (
    <AdminLayout activeItemId="revenue">
      <div className="flex-1 p-6 md:p-8">
        <h1 className="text-2xl font-bold text-white">Revenue</h1>
        <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.40)" }}>
          Platform earnings overview
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 rounded-full border-2 border-[#3b5bfc] border-t-transparent animate-spin" />
          </div>
        ) : error ? (
          <p className="text-sm py-10 text-center" style={{ color: "#f87171" }}>
            Could not load revenue data — check the API connection.
          </p>
        ) : data ? (
          <div className="mt-8 flex flex-col gap-6">
            {/* Plan cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <PlanCard
                label="Free Plan"
                price={null}
                count={data.freeUsers}
                accentColor="rgba(255,255,255,0.55)"
                bgColor="rgba(255,255,255,0.04)"
                borderColor="rgba(255,255,255,0.08)"
              />
              <PlanCard
                label="Pro Plan"
                price="$29"
                count={data.proUsers}
                accentColor="#3b5bfc"
                bgColor="rgba(59,91,252,0.06)"
                borderColor="rgba(59,91,252,0.20)"
              />
              <PlanCard
                label="Business Plan"
                price="$99"
                count={data.businessUsers}
                accentColor="#f59e0b"
                bgColor="rgba(245,158,11,0.06)"
                borderColor="rgba(245,158,11,0.20)"
              />
            </div>

            {/* MRR summary */}
            <div
              className="rounded-xl p-6 flex flex-col gap-2"
              style={{
                border: "1px solid rgba(16,185,129,0.20)",
                backgroundColor: "rgba(16,185,129,0.05)",
              }}
            >
              <p className="text-sm font-semibold uppercase tracking-wide"
                style={{ color: "rgba(255,255,255,0.40)" }}>
                Monthly Recurring Revenue
              </p>
              <p className="text-4xl font-bold" style={{ color: "#10b981" }}>
                {formatCurrency(data.monthlyRevenue)}
              </p>
              <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                Based on current active subscriptions
              </p>
            </div>

            {/* Coming soon notice */}
            <div
              className="rounded-xl px-5 py-4 flex items-start gap-3"
              style={{
                backgroundColor: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <svg
                className="mt-0.5 shrink-0"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
              >
                <circle cx="8" cy="8" r="7" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
                <path d="M8 5v3.5" stroke="rgba(255,255,255,0.40)" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="8" cy="11" r="0.75" fill="rgba(255,255,255,0.40)" />
              </svg>
              <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                Payment integration coming soon. Revenue will update automatically once Stripe and
                Paystack are connected.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
}
