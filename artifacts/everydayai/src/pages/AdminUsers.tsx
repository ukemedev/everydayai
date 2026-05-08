import { useState, useEffect, useCallback } from "react";
import { ShieldCheck } from "lucide-react";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/lib/supabase";

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  plan: string;
  agent_count: number;
  is_admin: boolean;
  suspended: boolean;
}

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function PlanBadge({ plan }: { plan: string }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    pro:      { bg: "rgba(59,91,252,0.15)",  color: "#3b5bfc", label: "Pro" },
    business: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b", label: "Business" },
    free:     { bg: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.50)", label: "Free" },
  };
  const s = styles[plan] ?? styles.free;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

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

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [suspending, setSuspending] = useState<string | null>(null);

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
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, suspended } : u))
      );
    } catch {
      // silently ignore — state not changed
    } finally {
      setSuspending(null);
    }
  }

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
              <table className="w-full text-sm min-w-[640px]">
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

                      {/* Plan */}
                      <td className="px-4 py-3">
                        <PlanBadge plan={user.plan ?? "free"} />
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
    </AdminLayout>
  );
}
