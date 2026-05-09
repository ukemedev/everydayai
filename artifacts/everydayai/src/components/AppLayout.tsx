import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

const navItems = [
  { id: "home",        icon: "🏠", label: "Home",        path: "/dashboard" },
  { id: "learn",       icon: "📚", label: "Learn",       path: "/dashboard" },
  { id: "studio",      icon: "🎛️", label: "Studio",      path: "/dashboard" },
  { id: "automations", icon: "⚡", label: "Automations", path: "/automations" },
  { id: "billing",     icon: "💳", label: "Billing",     path: "/billing"    },
  { id: "settings",    icon: "⚙️", label: "Settings",    path: "/settings"   },
];

interface AppLayoutProps {
  children: React.ReactNode;
  activeItemId?: string;
}

export default function AppLayout({ children, activeItemId }: AppLayoutProps) {
  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserEmail(session?.user?.email ?? null);
    });
  }, []);

  async function handleLogOut() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  function isActive(item: typeof navItems[number]): boolean {
    if (activeItemId) return activeItemId === item.id;
    return location === item.path;
  }

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
        {/* Logo + close */}
        <div className="px-5 py-6 flex items-center justify-between">
          <span className="font-bold text-lg tracking-tight text-white">EverydayAI</span>
          <button
            className="md:hidden w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            onClick={() => setSidebarOpen(false)}
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            ✕
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 flex flex-col gap-1">
          {navItems.map((item) => {
            const active = isActive(item);
            return (
              <button
                key={item.id}
                onClick={() => { navigate(item.path); setSidebarOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left"
                style={{
                  backgroundColor: active ? "rgba(59,91,252,0.15)" : "transparent",
                  color: active ? "#3b5bfc" : "rgba(255,255,255,0.55)",
                }}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          className="px-4 py-5 border-t flex flex-col gap-3"
          style={{ borderColor: "rgba(255,255,255,0.05)" }}
        >
          {userEmail && (
            <p
              className="text-xs truncate"
              style={{ color: "rgba(255,255,255,0.35)" }}
              title={userEmail}
            >
              {userEmail}
            </p>
          )}
          <button
            onClick={handleLogOut}
            className="w-full py-2 rounded-lg text-sm font-medium transition-all duration-150"
            style={{ color: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.10)" }}
          >
            Log Out
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
            className="text-xl text-white"
          >
            ☰
          </button>
          <span className="font-bold text-lg text-white">EverydayAI</span>
        </div>

        {children}
      </div>
    </div>
  );
}
