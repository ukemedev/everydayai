import { Link } from "wouter";

export default function Home() {
  return (
    <div
      className="min-h-screen w-full flex flex-col"
      style={{ backgroundColor: "#0a0f1e", fontFamily: "'Inter', sans-serif" }}
    >
      {/* Navigation */}
      <nav className="w-full flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5">
        <span className="text-white font-bold text-lg sm:text-xl tracking-tight shrink-0">
          EverydayAI
        </span>
        <div className="flex items-center gap-1.5 sm:gap-3">
          <Link href="/pricing">
            <button className="px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium text-white/60 hover:text-white transition-colors duration-200 whitespace-nowrap">
              Pricing
            </button>
          </Link>
          <Link href="/login">
            <button className="px-3 sm:px-5 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium text-white border border-white/20 hover:border-white/40 hover:bg-white/5 transition-all duration-200 whitespace-nowrap">
              Log In
            </button>
          </Link>
          <Link href="/signup">
            <button
              className="px-3 sm:px-5 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium text-white transition-all duration-200 hover:opacity-90 active:scale-95 whitespace-nowrap"
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
