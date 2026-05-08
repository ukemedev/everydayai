import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/lib/supabase";

interface AdminAgent {
  id: string;
  name: string;
  description: string;
  model: string;
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
  const isLive = status === "live";
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={
        isLive
          ? { backgroundColor: "rgba(16,185,129,0.12)", color: "#10b981" }
          : { backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.50)" }
      }
    >
      {isLive ? "Live" : "Draft"}
    </span>
  );
}

export default function AdminAgents() {
  const [agents, setAgents] = useState<AdminAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchAgents = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/agents", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { agents: AdminAgent[] };
      setAgents(data.agents);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  return (
    <AdminLayout activeItemId="agents">
      <div className="flex-1 p-6 md:p-8">
        <h1 className="text-2xl font-bold text-white">Agents</h1>
        <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.40)" }}>
          All agents built on EverydayAI
        </p>

        <div className="mt-8">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 rounded-full border-2 border-[#3b5bfc] border-t-transparent animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm py-10 text-center" style={{ color: "#f87171" }}>
              Could not load agents — check the API connection.
            </p>
          ) : agents.length === 0 ? (
            <p className="text-sm py-10 text-center" style={{ color: "rgba(255,255,255,0.35)" }}>
              No agents found.
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
                    {["Agent Name", "Owner Email", "Model", "Status", "Created"].map((col) => (
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
                  {agents.map((agent, i) => (
                    <tr
                      key={agent.id}
                      style={{
                        backgroundColor:
                          i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      {/* Agent Name */}
                      <td className="px-4 py-3">
                        <span
                          className="font-medium text-white truncate block max-w-[180px]"
                          title={agent.name}
                        >
                          {agent.name}
                        </span>
                        {agent.description && (
                          <span
                            className="text-xs truncate block max-w-[180px]"
                            style={{ color: "rgba(255,255,255,0.35)" }}
                            title={agent.description}
                          >
                            {agent.description}
                          </span>
                        )}
                      </td>

                      {/* Owner Email */}
                      <td className="px-4 py-3">
                        <span
                          className="truncate block max-w-[200px]"
                          style={{ color: "rgba(255,255,255,0.60)" }}
                          title={agent.owner_email}
                        >
                          {agent.owner_email || "—"}
                        </span>
                      </td>

                      {/* Model */}
                      <td className="px-4 py-3">
                        <span
                          className="font-mono text-xs px-2 py-1 rounded"
                          style={{
                            backgroundColor: "rgba(255,255,255,0.06)",
                            color: "rgba(255,255,255,0.55)",
                          }}
                        >
                          {agent.model || "—"}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge status={agent.status} />
                      </td>

                      {/* Created */}
                      <td
                        className="px-4 py-3 whitespace-nowrap"
                        style={{ color: "rgba(255,255,255,0.50)" }}
                      >
                        {formatDate(agent.created_at)}
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
