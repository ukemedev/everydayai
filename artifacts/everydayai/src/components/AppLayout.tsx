import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { LayoutDashboard, MessageSquare, Cpu, Settings } from "lucide-react";

const navItems = [
  { id: "home",     icon: LayoutDashboard, label: "Home",     path: "/dashboard" },
  { id: "inbox",    icon: MessageSquare,   label: "Inbox",    path: "/inbox"     },
  { id: "studio",   icon: Cpu,             label: "Studio",   path: "/studio"    },
  { id: "settings", icon: Settings,        label: "Settings", path: "/settings"  },
];

interface AppLayoutProps {
  children: React.ReactNode;
  activeItemId?: string;
}

export default function AppLayout({ children, activeItemId }: AppLayoutProps) {
  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserEmail(session?.user?.email ?? null);
    });
  }, []);

  async function handleLogOut() {
    // Clear all cached query data before signing out so the next user
    // starts with a completely clean cache — no stale data bleeds over.
    queryClient.clear();
    try { await supabase.auth.signOut({ scope: 'local' }); } catch (_) {}
    Object.keys(localStorage).forEach((k) => { if (k.startsWith('sb-')) localStorage.removeItem(k); });
    navigate("/login");
  }

  function isActive(item: typeof navItems[number]): boolean {
    if (activeItemId) return activeItemId === item.id;
    return location === item.path;
  }

  return (
    <div
      className="flex h-screen w-full overflow-hidden"
      style={{ fontFamily: "'Inter', sans-serif", backgroundColor: "var(--app-bg)" }}
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
        className={`fixed top-0 left-0 h-full w-60 flex flex-col border-r z-40 transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
        style={{
          backgroundColor: "var(--app-sidebar)",
          borderColor: "var(--app-border)",
        }}
      >
        {/* Logo + close */}
        <div className="px-5 py-6 flex items-center justify-between flex-shrink-0">
          <span
            className="font-bold text-lg tracking-tight"
            style={{ color: "var(--app-text)" }}
          >
            EverydayAI
          </span>
          <button
            className="md:hidden w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            onClick={() => setSidebarOpen(false)}
            style={{ color: "var(--app-text-faint)" }}
          >
            ✕
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 flex flex-col gap-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => { navigate(item.path); setSidebarOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left"
                style={{
                  backgroundColor: active ? "rgba(59,91,252,0.15)" : "transparent",
                  color: active ? "#3b5bfc" : "var(--app-text-nav)",
                }}
              >
                <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={1.75} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          className="px-4 py-5 border-t flex flex-col gap-3 flex-shrink-0"
          style={{ borderColor: "var(--app-border-subtle)" }}
        >
          {userEmail && (
            <p
              className="text-xs truncate"
              style={{ color: "var(--app-text-faint)" }}
              title={userEmail}
            >
              {userEmail}
            </p>
          )}
          <button
            onClick={handleLogOut}
            className="w-full py-2 rounded-lg text-sm font-medium transition-all duration-150 hover:opacity-80"
            style={{
              color: "var(--app-text-muted)",
              border: "1px solid var(--app-logout-border)",
            }}
          >
            Log Out
          </button>
        </div>
      </aside>

      {/* Main area — fills remaining space beside the sidebar on desktop */}
      <div className="flex-1 flex flex-col overflow-hidden md:ml-60 min-w-0">
        {/* Mobile top bar */}
        <div
          className="md:hidden flex items-center gap-3 px-4 py-4 border-b flex-shrink-0"
          style={{
            backgroundColor: "var(--app-sidebar)",
            borderColor: "var(--app-border)",
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-xl"
            style={{ color: "var(--app-text)" }}
          >
            ☰
          </button>
          <span
            className="font-bold text-lg"
            style={{ color: "var(--app-text)" }}
          >
            EverydayAI
          </span>
        </div>

        {/* Page content — fills all remaining height, scrollable for normal pages */}
        <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
          {children}
        </div>
      </div>
    </div>
  );
}
