import { useState } from "react";
import { useLocation } from "wouter";
import {
  LayoutGrid,
  Users,
  Bot,
  LayoutTemplate,
  BarChart2,
  Shield,
  ArrowLeft,
  X,
  Menu,
} from "lucide-react";

const navItems = [
  { id: "overview",   icon: LayoutGrid,     label: "Overview",   path: "/admin" },
  { id: "users",      icon: Users,          label: "Users",      path: "/admin/users" },
  { id: "agents",     icon: Bot,            label: "Agents",     path: "/admin/agents" },
  { id: "templates",  icon: LayoutTemplate, label: "Templates",  path: "/admin/templates" },
  { id: "revenue",    icon: BarChart2,      label: "Revenue",    path: "/admin/revenue" },
  { id: "audit",      icon: Shield,         label: "Audit Log",  path: "/admin/audit" },
];

interface AdminLayoutProps {
  children: React.ReactNode;
  activeItemId?: string;
}

export default function AdminLayout({ children, activeItemId = "overview" }: AdminLayoutProps) {
  const [, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function handleNav(path: string) {
    navigate(path);
    setSidebarOpen(false);
  }

  return (
    <div
      className="flex min-h-screen w-full"
      style={{ fontFamily: "'Inter', sans-serif", backgroundColor: "#0a0f1e" }}
    >
      {/* ── Mobile backdrop — sits above everything except the sidebar ── */}
      <div
        className="fixed inset-0 z-40 md:hidden transition-opacity duration-300"
        style={{
          backgroundColor: "rgba(0,0,0,0.65)",
          opacity: sidebarOpen ? 1 : 0,
          pointerEvents: sidebarOpen ? "auto" : "none",
        }}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* ── Sidebar — z-50 so it always sits above the backdrop ── */}
      <aside
        className={`fixed top-0 left-0 h-screen w-60 flex flex-col border-r z-50 transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
        style={{ backgroundColor: "#0d1117", borderColor: "rgba(255,255,255,0.05)" }}
      >
        {/* Header */}
        <div className="px-5 py-6 flex items-center justify-between flex-shrink-0">
          <div className="flex flex-col">
            <span className="font-bold text-base text-white leading-tight">Admin Panel</span>
            <span className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
              EverydayAI
            </span>
          </div>
          <button
            className="md:hidden w-7 h-7 flex items-center justify-center rounded-lg"
            onClick={() => setSidebarOpen(false)}
            style={{ color: "rgba(255,255,255,0.35)" }}
            aria-label="Close sidebar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 flex flex-col gap-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = activeItemId === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.path)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left"
                style={{
                  backgroundColor: active ? "#3b5bfc" : "transparent",
                  color: active ? "#ffffff" : "rgba(255,255,255,0.55)",
                }}
              >
                <Icon size={16} strokeWidth={2} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Back to App */}
        <div
          className="px-3 py-5 border-t flex-shrink-0"
          style={{ borderColor: "rgba(255,255,255,0.05)" }}
        >
          <button
            onClick={() => { navigate("/dashboard"); setSidebarOpen(false); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            <ArrowLeft size={16} strokeWidth={2} />
            Back to App
          </button>
        </div>
      </aside>

      {/* ── Main area ──
            Mobile: full viewport width (sidebar is fixed/off-screen, not in flow)
            Desktop: offset by sidebar width with md:ml-60
            min-w-0 prevents flex children from overflowing their container
      ── */}
      <div className="flex flex-col min-h-screen w-full md:ml-60 min-w-0">
        {/* Mobile top bar */}
        <div
          className="md:hidden flex items-center gap-3 px-4 py-4 border-b flex-shrink-0"
          style={{ backgroundColor: "#0d1117", borderColor: "rgba(255,255,255,0.05)" }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-white flex-shrink-0"
            aria-label="Open sidebar"
          >
            <Menu size={20} />
          </button>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-sm text-white leading-tight truncate">Admin Panel</span>
            <span className="text-xs truncate" style={{ color: "rgba(255,255,255,0.35)" }}>EverydayAI</span>
          </div>
        </div>

        {/* Page content — overflow-x-auto here ensures any table inside can scroll horizontally */}
        <div className="flex-1 flex flex-col min-w-0 overflow-x-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
