import { useState, useEffect, useCallback, useRef } from "react";
import { ShieldCheck } from "lucide-react";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  plan: string;
  agent_count: number;
  is_admin: boolean;
  suspended: boolean;
}

const PLANS = [
  { value: "free",     label: "Free",     color: "rgba(255,255,255,0.55)", bg: "rgba(255,255,255,0.07)" },
  { value: "starter",  label: "Starter",  color: "#10b981",               bg: "rgba(16,185,129,0.12)"  },
  { value: "pro",      label: "Pro",      color: "#3b5bfc",               bg: "rgba(59,91,252,0.12)"   },
  { value: "business", label: "Business", color: "#f59e0b",               bg: "rgba(245,158,11,0.12)"  },
] as const;

type PlanValue = typeof PLANS[number]["value"];

function planStyle(plan: string) {
  return PLANS.find((p) => p.value === plan) ?? PLANS[0];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastState { message: string; isError: boolean; visible: boolean }

function Toast({ message, isError, visible }: ToastState) {
  return (
    <div
      className="fixed bottom-6 left-1/2 z-50 px-5 py-3 rounded-xl text-sm font-medium text-white shadow-xl transition-all duration-300"
      style={{
        transform: `translateX(-50%) translateY(${visible ? "0" : "12px"})`,
        opacity: visible ? 1 : 0,
        pointerEvents: "none",
        backgroundColor: isError ? "rgba(239,68,68,0.15)" : "#1a2238",
        border: isError ? "1px solid rgba(239,68,68,0.30)" : "1px solid rgba(255,255,255,0.10)",
        color: isError ? "#f87171" : "#fff",
      }}
    >
      {message}
    </div>
  );
}

// ─── Plan Dropdown ────────────────────────────────────────────────────────────

interface PlanDropdownProps {
  userId: string;
  currentPlan: string;
  saving: boolean;
  onChange: (userId: string, plan: PlanValue) => void;
}

function PlanDropdown({ userId, currentPlan, saving, onChange }: PlanDropdownProps) {
  const ps = planStyle(currentPlan);

  return (
    <div className="relative flex items-center gap-2">
      <div
        className="relative rounded-lg overflow-hidden"
        style={{ backgroundColor: ps.bg, border: `1px solid ${ps.color}22` }}
      >
        <select
          value={currentPlan}
          disabled={saving}
          onChange={(e) => onChange(userId, e.target.value as PlanValue)}
          className="appearance-none text-xs font-semibold pl-2.5 pr-6 py-1 bg-transparent cursor-pointer outline-none transition-opacity"
          style={{ color: ps.color, opacity: saving ? 0.5 : 1 }}
        >
          {PLANS.map((p) => (
            <option key={p.value} value={p.value} style={{ backgroundColor: "#0d1117", color: p.color }}>
              {p.label}
            </option>
          ))}
        </select>
        {/* Chevron */}
        <span
          className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2"
          style={{ color: ps.color }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </div>

      {/* Per-row saving spinner */}
      {saving && (
        <div
          className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin flex-shrink-0"
          style={{ borderColor: `${ps.color} ${ps.color} ${ps.color} transparent` }}
        />
      )}
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ suspended }: { suspended: boolean }) {
  return suspended ? (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "#ef4444" }}
    >
      Suspended
    </span>
  ) : (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: "rgba(16,185,129,0.12)", color: "#10b981" }}
    >
      Active
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminUsers() {
  const [users, setUsers]         = useState<AdminUser[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(false);
  const [suspending, setSuspending] = useState<string | null>(null);
  const [planSaving, setPlanSaving] = useState<string | null>(null);

  const [toast, setToast]   = useState<ToastState>({ message: "", isError: false, visible: false });
  const toastTimer           = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(message: string, isError = false) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, isError, visible: true });
    toastTimer.current = setTimeout(
      () => setToast((t) => ({ ...t, visible: false })),
      2800
    );
  }

  // ── fetch ─────────────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { users: AdminUser[] };
      setUsers(data.users);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ── suspend ───────────────────────────────────────────────────────────────

  async function toggleSuspend(userId: string) {
    setSuspending(userId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/users/${userId}/suspend`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      const { suspended } = (await res.json()) as { suspended: boolean };
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, suspended } : u)));
    } catch {
      // silently ignore — state not changed
    } finally {
      setSuspending(null);
    }
  }

  // ── update plan ───────────────────────────────────────────────────────────

  async function updatePlan(userId: string, plan: PlanValue) {
    setPlanSaving(userId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/users/${userId}/plan`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { plan: string };
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, plan: data.plan } : u)));
      const label = PLANS.find((p) => p.value === plan)?.label ?? plan;
      showToast(`Plan updated to ${label}`);
    } catch {
      showToast("Failed to update plan", true);
    } finally {
      setPlanSaving(null);
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <AdminLayout activeItemId="users">
      <div className="flex-1 p-6 md:p-8">
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.40)" }}>
          All registered users on EverydayAI
        </p>

        <div className="mt-8">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 rounded-full border-2 border-[#3b5bfc] border-t-transparent animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm py-10 text-center" style={{ color: "#f87171" }}>
              Could not load users — check the API connection.
            </p>
          ) : users.length === 0 ? (
            <p className="text-sm py-10 text-center" style={{ color: "rgba(255,255,255,0.35)" }}>
              No users found.
            </p>
          ) : (
            <div
              className="overflow-x-auto rounded-xl"
              style={{ border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <table className="w-full text-sm min-w-[680px]">
                <thead>
                  <tr style={{ backgroundColor: "#131a2e", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    {["Email", "Plan", "Agents", "Joined", "Status", "Actions"].map((col) => (
                      <th
                        key={col}
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                        style={{ color: "rgba(255,255,255,0.35)" }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, i) => (
                    <tr
                      key={user.id}
                      style={{
                        backgroundColor: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      {/* Email */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-white truncate max-w-[200px]" title={user.email}>
                            {user.email}
                          </span>
                          {user.is_admin && (
                            <ShieldCheck size={13} color="#3b5bfc" aria-label="Admin" />
                          )}
                        </div>
                      </td>

                      {/* Plan — dropdown */}
                      <td className="px-4 py-3">
                        <PlanDropdown
                          userId={user.id}
                          currentPlan={user.plan ?? "free"}
                          saving={planSaving === user.id}
                          onChange={updatePlan}
                        />
                      </td>

                      {/* Agents */}
                      <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.65)" }}>
                        {user.agent_count}
                      </td>

                      {/* Joined */}
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: "rgba(255,255,255,0.50)" }}>
                        {formatDate(user.created_at)}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge suspended={user.suspended} />
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleSuspend(user.id)}
                          disabled={suspending === user.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 disabled:opacity-50"
                          style={
                            user.suspended
                              ? { backgroundColor: "rgba(16,185,129,0.12)", color: "#10b981", border: "1px solid rgba(16,185,129,0.25)" }
                              : { backgroundColor: "rgba(239,68,68,0.10)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.20)" }
                          }
                        >
                          {suspending === user.id ? "…" : user.suspended ? "Unsuspend" : "Suspend"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Toast {...toast} />
    </AdminLayout>
  );
}
