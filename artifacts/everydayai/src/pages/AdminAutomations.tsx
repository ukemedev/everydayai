import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/lib/supabase";

interface AdminAutomation {
  id: string;
  name: string;
  description: string;
  trigger_type: string;
  status: string;
  owner_email: string;
  created_at: string;
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

function StatusBadge({ status }: { status: string }) {
  const isActive = status === "active";
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={
        isActive
          ? { backgroundColor: "rgba(16,185,129,0.12)", color: "#10b981" }
          : { backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.50)" }
      }
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

function TriggerChip({ trigger }: { trigger: string }) {
  if (!trigger) return <span style={{ color: "rgba(255,255,255,0.35)" }}>—</span>;
  const label = trigger.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: "rgba(59,91,252,0.12)", color: "#3b5bfc" }}
    >
      {label}
    </span>
  );
}

export default function AdminAutomations() {
  const [automations, setAutomations] = useState<AdminAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchAutomations = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/automations", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { automations: AdminAutomation[] };
      setAutomations(data.automations);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAutomations(); }, [fetchAutomations]);

  return (
    <AdminLayout activeItemId="automations">
      <div className="flex-1 p-6 md:p-8">
        <h1 className="text-2xl font-bold text-white">Automations</h1>
        <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.40)" }}>
          All automations running on EverydayAI
        </p>

        <div className="mt-8">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 rounded-full border-2 border-[#3b5bfc] border-t-transparent animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm py-10 text-center" style={{ color: "#f87171" }}>
              Could not load automations — check the API connection.
            </p>
          ) : automations.length === 0 ? (
            <p className="text-sm py-10 text-center" style={{ color: "rgba(255,255,255,0.35)" }}>
              No automations found.
            </p>
          ) : (
            <div
              className="overflow-x-auto rounded-xl"
              style={{ border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr
                    style={{
                      backgroundColor: "#131a2e",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    {["Automation Name", "Owner Email", "Trigger", "Status", "Created"].map((col) => (
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
                  {automations.map((automation, i) => (
                    <tr
                      key={automation.id}
                      style={{
                        backgroundColor:
                          i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      {/* Name */}
                      <td className="px-4 py-3">
                        <span
                          className="font-medium text-white truncate block max-w-[180px]"
                          title={automation.name}
                        >
                          {automation.name}
                        </span>
                        {automation.description && (
                          <span
                            className="text-xs truncate block max-w-[180px]"
                            style={{ color: "rgba(255,255,255,0.35)" }}
                            title={automation.description}
                          >
                            {automation.description}
                          </span>
                        )}
                      </td>

                      {/* Owner Email */}
                      <td className="px-4 py-3">
                        <span
                          className="truncate block max-w-[200px]"
                          style={{ color: "rgba(255,255,255,0.60)" }}
                          title={automation.owner_email}
                        >
                          {automation.owner_email || "—"}
                        </span>
                      </td>

                      {/* Trigger */}
                      <td className="px-4 py-3">
                        <TriggerChip trigger={automation.trigger_type} />
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge status={automation.status} />
                      </td>

                      {/* Created */}
                      <td
                        className="px-4 py-3 whitespace-nowrap"
                        style={{ color: "rgba(255,255,255,0.50)" }}
                      >
                        {formatDate(automation.created_at)}
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
