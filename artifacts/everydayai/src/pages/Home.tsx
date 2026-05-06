import { Link } from "wouter";

export default function Home() {
  return (
    <div
      className="min-h-screen w-full flex flex-col"
      style={{ backgroundColor: "#0a0f1e", fontFamily: "'Inter', sans-serif" }}
    >
      {/* Navigation */}
      <nav className="w-full flex items-center justify-between px-8 py-5">
        <span className="text-white font-bold text-xl tracking-tight">
          EverydayAI
        </span>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <button className="px-5 py-2 rounded-lg text-sm font-medium text-white border border-white/20 hover:border-white/40 hover:bg-white/5 transition-all duration-200">
              Log In
            </button>
          </Link>
          <Link href="/signup">
            <button
              className="px-5 py-2 rounded-lg text-sm font-medium text-white transition-all duration-200 hover:opacity-90 active:scale-95"
              style={{ backgroundColor: "#3b5bfc" }}
            >
              Get Started
            </button>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 pb-24">
        {/* Subtle glow behind heading */}
        <div
          className="absolute rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{
            width: "600px",
            height: "300px",
            backgroundColor: "#3b5bfc",
            top: "30%",
            left: "50%",
            transform: "translateX(-50%)",
          }}
        />

        <h1
          className="text-5xl sm:text-6xl font-bold text-white leading-tight tracking-tight max-w-3xl"
          style={{ lineHeight: "1.15" }}
        >
          Build AI Agents for<br />Any Business
        </h1>

        <p className="mt-6 text-lg text-white/60 max-w-xl leading-relaxed">
          Create, deploy and manage AI agents for WhatsApp, websites and more —
          no coding needed.
        </p>

        <Link href="/signup">
          <button
            className="mt-10 px-8 py-3.5 rounded-xl text-base font-semibold text-white transition-all duration-200 hover:opacity-90 hover:scale-105 active:scale-95 shadow-lg"
            style={{
              backgroundColor: "#3b5bfc",
              boxShadow: "0 0 40px rgba(59, 91, 252, 0.35)",
            }}
          >
            Start Building Free
          </button>
        </Link>
      </main>
    </div>
  );
}
