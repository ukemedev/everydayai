import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditLog {
  id:          string;
  user_id:     string | null;
  user_email:  string;
  action:      string;
  resource:    string | null;
  resource_id: string | null;
  metadata:    Record<string, unknown> | null;
  ip_address:  string | null;
  created_at:  string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-NG", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Action badge config ───────────────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; color: string; bg: string }> = {
  message_sent:       { label: "Message Sent",       color: "#3b5bfc", bg: "rgba(59,91,252,0.15)"   },
  document_uploaded:  { label: "Doc Uploaded",        color: "#10b981", bg: "rgba(16,185,129,0.12)"  },
  agent_created:      { label: "Agent Created",       color: "#a855f7", bg: "rgba(168,85,247,0.12)"  },
  user_suspended:     { label: "User Suspended",      color: "#ef4444", bg: "rgba(239,68,68,0.12)"   },
  user_unsuspended:   { label: "User Unsuspended",    color: "#f97316", bg: "rgba(249,115,22,0.12)"  },
  plan_changed:       { label: "Plan Changed",        color: "#f59e0b", bg: "rgba(245,158,11,0.12)"  },
  payment_received:   { label: "Payment Received",    color: "#10b981", bg: "rgba(16,185,129,0.12)"  },
};

function ActionBadge({ action }: { action: string }) {
  const meta = ACTION_META[action] ?? { label: action, color: "#9ca3af", bg: "rgba(156,163,175,0.12)" };
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
      style={{ color: meta.color, backgroundColor: meta.bg }}
    >
      {meta.label}
    </span>
  );
}

function DetailsCell({ log }: { log: AuditLog }) {
  const parts: string[] = [];
  if (log.resource_id) parts.push(`ID: ${log.resource_id.slice(0, 8)}…`);
  if (log.metadata) {
    const { oldPlan, newPlan, fileName, plan, amount } = log.metadata as Record<string, string | number>;
    if (oldPlan && newPlan)   parts.push(`${oldPlan} → ${newPlan}`);
    else if (fileName)        parts.push(String(fileName));
    else if (plan && amount)  parts.push(`${plan} · ₦${Number(amount).toLocaleString("en-NG")}`);
    else if (plan)            parts.push(String(plan));
  }
  return (
    <span style={{ color: "rgba(255,255,255,0.45)" }} className="text-xs">
      {parts.join(" · ") || "—"}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminAuditLog() {
  const [logs, setLogs]       = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/audit", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { logs: AuditLog[] };
      setLogs(data.logs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  return (
    <AdminLayout activeItemId="audit">
      <div className="p-6 md:p-8 max-w-7xl mx-auto w-full">

        {/* Header */}
        <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white">Audit Log</h1>
            <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.40)" }}>
              Last 50 platform actions across all users
            </p>
          </div>
          <button
            onClick={() => void fetchLogs()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: "rgba(59,91,252,0.15)", color: "#3b5bfc", border: "1px solid rgba(59,91,252,0.30)" }}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            className="mb-6 px-4 py-3 rounded-xl text-sm"
            style={{ backgroundColor: "rgba(239,68,68,0.10)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.20)" }}
          >
            {error}
          </div>
        )}

        {/* Table card */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: "#0d1117", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          {loading && logs.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div
                className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: "rgba(59,91,252,0.30)", borderTopColor: "#3b5bfc" }}
              />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-center py-16 text-sm" style={{ color: "rgba(255,255,255,0.30)" }}>
              No audit events recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    {["Time", "User", "Action", "Resource", "Details"].map((h) => (
                      <th
                        key={h}
                        className="px-5 py-3.5 text-left text-xs font-semibold tracking-wide"
                        style={{ color: "rgba(255,255,255,0.35)" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => (
                    <tr
                      key={log.id}
                      style={{
                        borderBottom: i < logs.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                      }}
                    >
                      {/* Time */}
                      <td className="px-5 py-3.5 whitespace-nowrap" style={{ color: "rgba(255,255,255,0.45)" }}>
                        {formatDateTime(log.created_at)}
                      </td>

                      {/* User email */}
                      <td className="px-5 py-3.5 max-w-[180px]">
                        <span
                          className="block truncate text-xs"
                          style={{ color: "rgba(255,255,255,0.65)" }}
                          title={log.user_email}
                        >
                          {log.user_email}
                        </span>
                      </td>

                      {/* Action badge */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <ActionBadge action={log.action} />
                      </td>

                      {/* Resource */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="text-xs capitalize" style={{ color: "rgba(255,255,255,0.55)" }}>
                          {log.resource ?? "—"}
                        </span>
                      </td>

                      {/* Details */}
                      <td className="px-5 py-3.5">
                        <DetailsCell log={log} />
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
