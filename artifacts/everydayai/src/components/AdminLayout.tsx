import { useState } from "react";
import { useLocation } from "wouter";
import {
  LayoutGrid,
  Users,
  Bot,
  Zap,
  BarChart2,
  ArrowLeft,
  X,
  Menu,
} from "lucide-react";

const navItems = [
  { id: "overview",    icon: LayoutGrid, label: "Overview",    path: "/admin" },
  { id: "users",       icon: Users,      label: "Users",       path: "/admin/users" },
  { id: "agents",      icon: Bot,        label: "Agents",      path: "/admin/agents" },
  { id: "automations", icon: Zap,        label: "Automations", path: "/admin/automations" },
  { id: "revenue",     icon: BarChart2,  label: "Revenue",     path: "/admin/revenue" },
];

interface AdminLayoutProps {
  children: React.ReactNode;
  activeItemId?: string;
}

export default function AdminLayout({ children, activeItemId = "overview" }: AdminLayoutProps) {
  const [, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div
      className="flex min-h-screen w-full"
      style={{ fontFamily: "'Inter', sans-serif", backgroundColor: "#0a0f1e" }}
    >
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-screen w-60 flex flex-col border-r z-40 transition-transform duration-300 ease-in-out
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
            className="md:hidden w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            onClick={() => setSidebarOpen(false)}
            style={{ color: "rgba(255,255,255,0.35)" }}
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
                onClick={() => { navigate(item.path); setSidebarOpen(false); }}
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
            onClick={() => navigate("/dashboard")}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            <ArrowLeft size={16} strokeWidth={2} />
            Back to App
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col md:ml-60 min-h-screen">
        {/* Mobile top bar */}
        <div
          className="md:hidden flex items-center gap-3 px-4 py-4 border-b flex-shrink-0"
          style={{ backgroundColor: "#0d1117", borderColor: "rgba(255,255,255,0.05)" }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-white"
          >
            <Menu size={20} />
          </button>
          <div className="flex flex-col">
            <span className="font-bold text-sm text-white leading-tight">Admin Panel</span>
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>EverydayAI</span>
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
