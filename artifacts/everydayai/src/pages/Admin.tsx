import { useEffect, useState, useCallback, useRef } from "react";
import { Users, Bot, Zap, MessageSquare } from "lucide-react";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  { key: "totalUsers"        as keyof Stats, label: "Total Users",           icon: Users,         iconColor: "#3b5bfc", iconBg: "rgba(59,91,252,0.12)"  },
  { key: "totalAgents"       as keyof Stats, label: "Total Agents",          icon: Bot,           iconColor: "#10b981", iconBg: "rgba(16,185,129,0.12)" },
  { key: "totalAutomations"  as keyof Stats, label: "Total Automations",     icon: Zap,           iconColor: "#f59e0b", iconBg: "rgba(245,158,11,0.12)" },
  { key: "messagesThisMonth" as keyof Stats, label: "Messages This Month",   icon: MessageSquare, iconColor: "#a855f7", iconBg: "rgba(168,85,247,0.12)" },
];

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastProps { message: string; visible: boolean }

function Toast({ message, visible }: ToastProps) {
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-medium text-white shadow-xl transition-all duration-300"
      style={{
        backgroundColor: "#1a2238",
        border: "1px solid rgba(255,255,255,0.10)",
        opacity: visible ? 1 : 0,
        transform: `translateX(-50%) translateY(${visible ? "0" : "12px"})`,
        pointerEvents: "none",
      }}
    >
      {message}
    </div>
  );
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({ open, onConfirm, onCancel }: ConfirmModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.60)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4"
        style={{
          backgroundColor: "#131a2e",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-bold text-white">Enable Pricing?</h2>
          <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.50)" }}>
            Users will now be required to pay to access Pro features. Make sure Stripe and
            Paystack are connected first.
          </p>
        </div>
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.65)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#3b5bfc" }}
          >
            Enable Pricing
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Admin() {
  const [stats, setStats]                   = useState<Stats>(EMPTY_STATS);
  const [statsLoading, setStatsLoading]     = useState(true);
  const [statsError, setStatsError]         = useState(false);

  const [pricingEnabled, setPricingEnabled] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [showModal, setShowModal]           = useState(false);

  const [toast, setToast]     = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── helpers ──────────────────────────────────────────────────────────────

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2800);
  }

  // ── fetch stats ───────────────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as Stats;
      setStats(data);
    } catch {
      setStatsError(true);
      setStats(EMPTY_STATS);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // ── fetch settings ────────────────────────────────────────────────────────

  const fetchSettings = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { pricingEnabled: boolean };
      setPricingEnabled(data.pricingEnabled);
    } catch {
      // silently fail — stays false
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchSettings();
  }, [fetchStats, fetchSettings]);

  // ── save setting ──────────────────────────────────────────────────────────

  async function savePricing(enabled: boolean) {
    setSettingsSaving(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pricingEnabled: enabled }),
      });
      if (!res.ok) throw new Error("Failed");
      setPricingEnabled(enabled);
      showToast(enabled ? "Pricing enabled" : "Pricing disabled");
    } catch {
      showToast("Failed to save setting — try again");
    } finally {
      setSettingsSaving(false);
    }
  }

  // ── toggle handler ────────────────────────────────────────────────────────

  function handleToggle() {
    if (pricingEnabled) {
      savePricing(false);
    } else {
      setShowModal(true);
    }
  }

  function handleModalConfirm() {
    setShowModal(false);
    savePricing(true);
  }

  // ── render ────────────────────────────────────────────────────────────────

  const toggleDisabled = settingsLoading || settingsSaving;

  return (
    <AdminLayout activeItemId="overview">
      <div className="flex-1 p-6 md:p-8">
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.40)" }}>
          Live stats across the platform.
        </p>

        {/* ── Stat cards ─────────────────────────────────────────────────── */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {statCards.map(({ key, label, icon: Icon, iconColor, iconBg }) => (
            <div
              key={key}
              className="flex items-center gap-4 rounded-xl p-5"
              style={{ backgroundColor: "#131a2e", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div
                className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: iconBg }}
              >
                <Icon size={20} color={iconColor} strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {label}
                </p>
                {statsLoading ? (
                  <div
                    className="mt-1 w-10 h-6 rounded animate-pulse"
                    style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
                  />
                ) : (
                  <p className="text-2xl font-bold text-white leading-tight mt-0.5">
                    {(stats[key] ?? 0).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {statsError && !statsLoading && (
          <p className="mt-4 text-xs" style={{ color: "#f87171" }}>
            Could not load stats — showing zeros. Check the API connection.
          </p>
        )}

        {/* ── Platform Settings ───────────────────────────────────────────── */}
        <div className="mt-10">
          <h2 className="text-base font-semibold text-white mb-4">Platform Settings</h2>

          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid rgba(255,255,255,0.06)", backgroundColor: "#131a2e" }}
          >
            {/* Row */}
            <div className="flex items-center justify-between gap-4 px-5 py-5">
              {/* Labels */}
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-sm font-semibold text-white">
                    Pricing &amp; Subscriptions
                  </span>
                  {settingsLoading ? (
                    <div
                      className="w-14 h-5 rounded-full animate-pulse"
                      style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
                    />
                  ) : (
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
                      style={
                        pricingEnabled
                          ? { backgroundColor: "rgba(16,185,129,0.12)", color: "#10b981" }
                          : { backgroundColor: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.45)" }
                      }
                    >
                      {pricingEnabled ? "Paid" : "Free Access"}
                    </span>
                  )}
                </div>
                <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.40)" }}>
                  When enabled, users will be required to upgrade to access Pro and Business features.
                </p>
              </div>

              {/* Toggle */}
              <button
                type="button"
                onClick={handleToggle}
                disabled={toggleDisabled}
                aria-label="Toggle pricing"
                className="flex-shrink-0 relative inline-flex w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none"
                style={{
                  backgroundColor: pricingEnabled ? "#3b5bfc" : "rgba(255,255,255,0.15)",
                  opacity: toggleDisabled ? 0.5 : 1,
                  cursor: toggleDisabled ? "not-allowed" : "pointer",
                }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
                  style={{ transform: pricingEnabled ? "translateX(24px)" : "translateX(0)" }}
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Confirm modal ───────────────────────────────────────────────────── */}
      <ConfirmModal
        open={showModal}
        onConfirm={handleModalConfirm}
        onCancel={() => setShowModal(false)}
      />

      {/* ── Toast ───────────────────────────────────────────────────────────── */}
      <Toast message={toast} visible={toastVisible} />
    </AdminLayout>
  );
}
