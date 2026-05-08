import { useEffect, useState } from "react";
import { Users, Bot, Zap, MessageSquare } from "lucide-react";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/lib/supabase";

interface Stats {
  totalUsers: number;
  totalAgents: number;
  totalAutomations: number;
  messagesThisMonth: number;
}

const EMPTY_STATS: Stats = {
  totalUsers: 0,
  totalAgents: 0,
  totalAutomations: 0,
  messagesThisMonth: 0,
};

const statCards = [
  {
    key: "totalUsers" as keyof Stats,
    label: "Total Users",
    icon: Users,
    iconColor: "#3b5bfc",
    iconBg: "rgba(59,91,252,0.12)",
  },
  {
    key: "totalAgents" as keyof Stats,
    label: "Total Agents",
    icon: Bot,
    iconColor: "#10b981",
    iconBg: "rgba(16,185,129,0.12)",
  },
  {
    key: "totalAutomations" as keyof Stats,
    label: "Total Automations",
    icon: Zap,
    iconColor: "#f59e0b",
    iconBg: "rgba(245,158,11,0.12)",
  },
  {
    key: "messagesThisMonth" as keyof Stats,
    label: "Messages This Month",
    icon: MessageSquare,
    iconColor: "#a855f7",
    iconBg: "rgba(168,85,247,0.12)",
  },
];

export default function Admin() {
  console.log("Admin page rendered");

  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchStats() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/admin/stats", {
          headers: {
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
        });
        if (!res.ok) throw new Error("Failed to fetch stats");
        const data = (await res.json()) as Stats;
        setStats(data);
      } catch {
        setError(true);
        setStats(EMPTY_STATS);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  return (
    <AdminLayout activeItemId="overview">
      <div className="flex-1 p-6 md:p-8">
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.40)" }}>
          Live stats across the platform.
        </p>

        {/* Stat cards */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {statCards.map(({ key, label, icon: Icon, iconColor, iconBg }) => (
            <div
              key={key}
              className="flex items-center gap-4 rounded-xl p-5"
              style={{
                backgroundColor: "#131a2e",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {/* Icon */}
              <div
                className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: iconBg }}
              >
                <Icon size={20} color={iconColor} strokeWidth={2} />
              </div>

              {/* Text */}
              <div className="min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {label}
                </p>
                {loading ? (
                  <div
                    className="mt-1 w-10 h-6 rounded animate-pulse"
                    style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
                  />
                ) : (
                  <p className="text-2xl font-bold text-white leading-tight mt-0.5">
                    {stats[key].toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Error notice */}
        {error && !loading && (
          <p className="mt-4 text-xs" style={{ color: "#f87171" }}>
            Could not load stats — showing zeros. Check the API connection.
          </p>
        )}
      </div>
    </AdminLayout>
  );
}
