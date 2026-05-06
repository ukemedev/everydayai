import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

const navItems = [
  { icon: "🏠", label: "Home", id: "home" },
  { icon: "📚", label: "Learn", id: "learn" },
  { icon: "🎛️", label: "Studio", id: "studio" },
];

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [activeNav, setActiveNav] = useState("home");
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

  return (
    <div
      className="flex min-h-screen w-full"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Sidebar */}
      <aside
        className="w-60 flex-shrink-0 flex flex-col fixed top-0 left-0 h-screen border-r border-white/5"
        style={{ backgroundColor: "#0d1117" }}
      >
        {/* Logo */}
        <div className="px-5 py-6">
          <span className="text-white font-bold text-lg tracking-tight">
            EverydayAI
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left"
                style={{
                  backgroundColor: isActive ? "rgba(59,91,252,0.15)" : "transparent",
                  color: isActive ? "#3b5bfc" : "rgba(255,255,255,0.55)",
                }}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Bottom: user + logout */}
        <div className="px-4 py-5 border-t border-white/5 flex flex-col gap-3">
          {userEmail && (
            <p className="text-xs text-white/35 truncate" title={userEmail}>
              {userEmail}
            </p>
          )}
          <button
            onClick={handleLogOut}
            className="w-full py-2 rounded-lg text-sm font-medium text-white/60 border border-white/10 hover:border-white/20 hover:text-white/80 transition-all duration-150"
          >
            Log Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main
        className="flex-1 ml-60 min-h-screen px-8 py-8"
        style={{ backgroundColor: "#0a0f1e" }}
      >
        {/* Greeting */}
        <h1 className="text-2xl font-bold text-white mb-6">
          Welcome back 👋
        </h1>

        {/* Blue banner card */}
        <div
          className="w-full rounded-2xl px-8 py-7 mb-8 flex items-center justify-between"
          style={{
            background: "linear-gradient(135deg, #1e3a8a 0%, #3b5bfc 100%)",
          }}
        >
          <div>
            <h2 className="text-xl font-bold text-white mb-1">
              Begin Your EverydayAI Journey
            </h2>
            <p className="text-white/70 text-sm leading-relaxed">
              Build and deploy AI agents for any business in minutes
            </p>
          </div>
          <button
            className="flex-shrink-0 ml-6 px-5 py-2.5 rounded-lg text-sm font-semibold text-[#3b5bfc] bg-white hover:bg-white/90 transition-all duration-150"
          >
            Learn More
          </button>
        </div>

        {/* My Agents section */}
        <div>
          <h2 className="text-base font-semibold text-white mb-4">
            My Agents
          </h2>

          {/* Empty state card */}
          <div
            className="w-48 h-40 rounded-2xl border border-dashed border-white/15 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-[#3b5bfc]/50 hover:bg-white/[0.02] transition-all duration-200 group"
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-xl text-white/30 group-hover:text-[#3b5bfc]/70 transition-colors duration-200"
              style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
            >
              +
            </div>
            <span className="text-xs text-white/35 group-hover:text-white/50 transition-colors duration-200">
              Create New Agent
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
