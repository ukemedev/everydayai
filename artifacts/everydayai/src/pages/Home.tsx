import { useState, useEffect } from "react";
import { Link } from "wouter";

// ─── Nav ────────────────────────────────────────────────────────────────────────

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll when menu open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          backgroundColor: scrolled || menuOpen ? "rgba(10,15,30,0.97)" : "transparent",
          backdropFilter: scrolled || menuOpen ? "blur(14px)" : "none",
          borderBottom: scrolled ? "1px solid rgba(255,255,255,0.07)" : "none",
        }}
      >
        {/* ── Desktop bar ── */}
        <div className="hidden sm:flex max-w-6xl mx-auto px-6 items-center justify-between h-16">
          <Link href="/">
            <span className="flex items-center gap-2 cursor-pointer">
              <img src="/owl-logo.webp" alt="EverydayAI" className="w-8 h-8 rounded-lg object-cover" />
              <span className="text-white font-bold text-lg tracking-tight">EverydayAI</span>
            </span>
          </Link>

          <div className="flex items-center gap-1">
            <a href="#features" className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">How It Works</a>
            <Link href="/pricing">
              <span className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors cursor-pointer">Pricing</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/login">
              <span className="px-4 py-2 rounded-lg text-sm text-white border border-white/20 hover:border-white/40 hover:bg-white/5 transition-all cursor-pointer">
                Log In
              </span>
            </Link>
            <Link href="/signup">
              <span
                className="px-5 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer hover:opacity-90 transition-opacity"
                style={{ backgroundColor: "#3b5bfc" }}
              >
                Get Started Free
              </span>
            </Link>
          </div>
        </div>

        {/* ── Mobile bar: owl | WORDMARK centered | hamburger ── */}
        <div className="sm:hidden grid h-16 px-4" style={{ gridTemplateColumns: "1fr auto 1fr" }}>
          {/* Left: owl logo */}
          <div className="flex items-center">
            <img src="/owl-logo.webp" alt="EverydayAI" className="w-8 h-8 rounded-lg object-cover" />
          </div>

          {/* Center: wordmark */}
          <div className="flex items-center justify-center">
            <span className="text-white font-bold text-lg tracking-tight">EverydayAI</span>
          </div>

          {/* Right: hamburger */}
          <div className="flex items-center justify-end">
            <button
              className="text-white/70 hover:text-white p-2 -mr-2"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle menu"
            >
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {menuOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* ── Mobile full-screen overlay menu ── */}
      {menuOpen && (
        <div
          className="sm:hidden fixed inset-0 z-40 flex flex-col pt-16"
          style={{ backgroundColor: "rgba(10,15,30,0.98)", backdropFilter: "blur(16px)" }}
        >
          <div className="flex flex-col px-6 pt-6 gap-1 flex-1">
            <a
              href="#features"
              onClick={() => setMenuOpen(false)}
              className="py-4 text-base font-medium text-white/80 hover:text-white border-b transition-colors"
              style={{ borderColor: "rgba(255,255,255,0.07)" }}
            >
              Features
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMenuOpen(false)}
              className="py-4 text-base font-medium text-white/80 hover:text-white border-b transition-colors"
              style={{ borderColor: "rgba(255,255,255,0.07)" }}
            >
              How It Works
            </a>
            <Link href="/pricing">
              <span
                onClick={() => setMenuOpen(false)}
                className="block py-4 text-base font-medium text-white/80 hover:text-white border-b transition-colors cursor-pointer"
                style={{ borderColor: "rgba(255,255,255,0.07)" }}
              >
                Pricing
              </span>
            </Link>
          </div>

          {/* CTAs pinned to bottom */}
          <div className="px-6 pb-10 pt-6 flex flex-col gap-3">
            <Link href="/signup">
              <span
                className="block text-center py-3.5 rounded-xl text-sm font-semibold text-white cursor-pointer"
                style={{ backgroundColor: "#3b5bfc" }}
              >
                Get Started Free
              </span>
            </Link>
            <Link href="/login">
              <span
                className="block text-center py-3.5 rounded-xl text-sm font-medium cursor-pointer"
                style={{ color: "rgba(255,255,255,0.65)", border: "1px solid rgba(255,255,255,0.15)" }}
              >
                Log In
              </span>
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────────────────

const CHANNEL_ICONS = [
  {
    name: "WhatsApp",
    color: "#25d366",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 shrink-0">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
  },
  {
    name: "Telegram",
    color: "#229ed9",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 shrink-0">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
  },
  {
    name: "Instagram",
    color: "#e1306c",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 shrink-0">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
      </svg>
    ),
  },
  {
    name: "Messenger",
    color: "#0084ff",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 shrink-0">
        <path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.498 1.744 6.614 4.469 8.654V24l4.088-2.242c1.092.3 2.246.464 3.443.464 6.627 0 12-4.975 12-11.111C24 4.974 18.627 0 12 0zm1.191 14.963l-3.055-3.26-5.963 3.26L10.732 8.1l3.131 3.26L19.752 8.1l-6.561 6.863z" />
      </svg>
    ),
  },
  {
    name: "Website",
    color: "#6366f1",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 shrink-0">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
];

function Hero() {
  return (
    <section className="relative min-h-[85vh] sm:min-h-screen flex flex-col items-center justify-center text-center px-4 sm:px-6 overflow-hidden pt-20 pb-10 sm:pb-16">
      {/* Background glow */}
      <div
        className="absolute rounded-full blur-3xl pointer-events-none"
        style={{
          width: "700px",
          height: "350px",
          background: "radial-gradient(ellipse, rgba(59,91,252,0.22) 0%, transparent 70%)",
          top: "35%",
          left: "50%",
          transform: "translateX(-50%)",
        }}
      />

      {/* Badge */}
      <div
        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-6 sm:mb-8"
        style={{ backgroundColor: "rgba(59,91,252,0.15)", border: "1px solid rgba(59,91,252,0.35)", color: "#818cf8" }}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        Built for Nigerian businesses
      </div>

      {/* FIX 1: No explicit <br /> — headline wraps naturally */}
      <h1
        className="text-4xl sm:text-5xl md:text-6xl font-bold text-white max-w-2xl mx-auto"
        style={{ lineHeight: "1.12", letterSpacing: "-0.02em" }}
      >
        Give Your Business a{" "}
        <span style={{ color: "#3b5bfc" }}>24/7 AI&nbsp;Employee</span>
      </h1>

      <p className="mt-6 text-base sm:text-lg text-white/55 max-w-xl leading-relaxed">
        Build AI agents that answer questions, take orders, and handle customer conversations on WhatsApp, Telegram, Instagram, and your website — no coding needed.
      </p>

      {/* FIX 2: "Join Waitlist" replaced with "See How It Works" */}
      <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center gap-3">
        <Link href="/signup">
          <span
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold text-white cursor-pointer hover:opacity-90 transition-all hover:scale-105 active:scale-95"
            style={{ backgroundColor: "#3b5bfc", boxShadow: "0 0 40px rgba(59,91,252,0.4)" }}
          >
            Get Started Free
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </span>
        </Link>
        <a
          href="#how-it-works"
          className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold cursor-pointer transition-all hover:bg-white/5"
          style={{ color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.15)" }}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
          </svg>
          See How It Works
        </a>
      </div>

      {/* FIX 3: Channel pills in a single scrollable row — no orphan wrapping */}
      <div className="mt-10 sm:mt-14 w-full max-w-lg mx-auto">
        <p className="text-xs text-white/30 mb-3">Connects with</p>
        <div className="flex items-center justify-center gap-2 overflow-x-auto pb-2 px-2 scrollbar-none">
          {CHANNEL_ICONS.map((ch) => (
            <div
              key={ch.name}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0"
              style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: ch.color }}
            >
              {ch.icon}
              <span className="text-white/70">{ch.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="mt-12 sm:mt-16 grid grid-cols-3 gap-8 sm:gap-16 border-t border-white/5 pt-10 w-full max-w-lg">
        {[
          { value: "10+", label: "Built-in Tools" },
          { value: "5", label: "Channels" },
          { value: "₦0", label: "To Get Started" },
        ].map((s) => (
          <div key={s.label} className="text-center">
            <div className="text-2xl sm:text-3xl font-bold text-white">{s.value}</div>
            <div className="text-xs text-white/40 mt-1">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── How It Works ────────────────────────────────────────────────────────────────

const STEPS = [
  {
    num: "01",
    title: "Create Your Agent",
    desc: "Give your agent a name, personality, and instructions. Pick from ready-made templates for popular business types — restaurants, stores, clinics, and more.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
  },
  {
    num: "02",
    title: "Connect Your Channels",
    desc: "Link your WhatsApp Business, Telegram bot, Instagram, or Messenger account in a few clicks. Your agent goes live instantly on every channel you choose.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
      </svg>
    ),
  },
  {
    num: "03",
    title: "Watch It Handle Customers",
    desc: "Your AI agent responds 24/7 — answering questions, collecting orders, and escalating to you when needed. Check every conversation in your shared inbox.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="py-14 sm:py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10 sm:mb-16">
          <p className="text-sm font-medium mb-3" style={{ color: "#3b5bfc" }}>Simple process</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white">Up and running in minutes</h2>
          <p className="mt-4 text-white/50 max-w-md mx-auto">No technical knowledge needed. If you can use WhatsApp, you can build an AI agent.</p>
        </div>

        <div className="grid sm:grid-cols-3 gap-6">
          {STEPS.map((step, i) => (
            <div
              key={step.num}
              className="relative rounded-2xl p-6"
              style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              {i < STEPS.length - 1 && (
                <div
                  className="hidden sm:block absolute top-10 left-full w-6 z-10"
                  style={{ borderTop: "1px dashed rgba(255,255,255,0.12)" }}
                />
              )}
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
                style={{ backgroundColor: "rgba(59,91,252,0.15)", color: "#3b5bfc" }}
              >
                {step.icon}
              </div>
              <div className="text-xs font-mono mb-2" style={{ color: "rgba(59,91,252,0.6)" }}>{step.num}</div>
              <h3 className="text-white font-semibold text-lg mb-2">{step.title}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Features ────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    title: "WhatsApp Business",
    desc: "Deploy your agent to WhatsApp and handle customer chats automatically, around the clock.",
    color: "#25d366",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
  },
  {
    title: "Telegram",
    desc: "Launch a Telegram bot that handles FAQs, orders, and bookings for your customers.",
    color: "#229ed9",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
  },
  {
    title: "Instagram DMs",
    desc: "Respond to Instagram direct messages instantly — perfect for e-commerce and service bookings.",
    color: "#e1306c",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
      </svg>
    ),
  },
  {
    title: "Facebook Messenger",
    desc: "Handle Messenger conversations automatically. Keep your Facebook page responsive 24/7.",
    color: "#0084ff",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.498 1.744 6.614 4.469 8.654V24l4.088-2.242c1.092.3 2.246.464 3.443.464 6.627 0 12-4.975 12-11.111C24 4.974 18.627 0 12 0zm1.191 14.963l-3.055-3.26-5.963 3.26L10.732 8.1l3.131 3.26L19.752 8.1l-6.561 6.863z" />
      </svg>
    ),
  },
  {
    title: "Inbox & Human Takeover",
    desc: "All conversations in one place. Jump in and reply as yourself whenever a customer needs a human touch.",
    color: "#f59e0b",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
    ),
  },
  {
    title: "10+ Built-in Tools",
    desc: "Send images, generate PDFs, handle bookings, collect payments, and more — without writing a single line of code.",
    color: "#8b5cf6",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
      </svg>
    ),
  },
  {
    title: "Knowledge Base",
    desc: "Upload your product catalogue, FAQs, price lists, or any document. Your agent learns from it instantly.",
    color: "#10b981",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    ),
  },
  {
    title: "Voice & Image Input",
    desc: "Customers can send voice notes and photos — your agent understands and responds to both.",
    color: "#f97316",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
      </svg>
    ),
  },
];

function Features() {
  return (
    <section id="features" className="py-14 sm:py-24 px-4" style={{ backgroundColor: "rgba(255,255,255,0.01)" }}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10 sm:mb-16">
          <p className="text-sm font-medium mb-3" style={{ color: "#3b5bfc" }}>Everything included</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white">One platform, every channel</h2>
          <p className="mt-4 text-white/50 max-w-md mx-auto">Stop losing customers because you can't reply fast enough. Your AI agent never sleeps, never takes a break.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((feat) => (
            <div
              key={feat.title}
              className="rounded-2xl p-5 hover:scale-[1.02] transition-transform duration-200"
              style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{ backgroundColor: `${feat.color}18`, color: feat.color }}
              >
                {feat.icon}
              </div>
              <h3 className="text-white font-semibold text-sm mb-1.5">{feat.title}</h3>
              <p className="text-white/45 text-xs leading-relaxed">{feat.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ─────────────────────────────────────────────────────────────────────

const PLANS = [
  {
    name: "Free",
    price: "₦0",
    period: "forever",
    accent: "rgba(255,255,255,0.5)",
    accentSolid: "#ffffff",
    border: "rgba(255,255,255,0.10)",
    glow: false,
    badge: null as string | null,
    cta: "Get Started Free",
    ctaHref: "/signup",
    ctaFilled: false,
    summary: "Try it out. No card needed.",
    highlights: ["1 AI agent", "200 messages / month", "Web chat widget", "Free templates"],
  },
  {
    name: "Starter",
    price: "₦15,000",
    period: "/month",
    accent: "#10b981",
    accentSolid: "#10b981",
    border: "rgba(16,185,129,0.30)",
    glow: false,
    badge: null as string | null,
    cta: "Get Starter",
    ctaHref: "/signup",
    ctaFilled: true,
    summary: "For small businesses going live.",
    highlights: ["3 AI agents", "2,000 messages / month", "WhatsApp or Telegram (1 channel)", "Knowledge base (10 docs)", "File uploads"],
  },
  {
    name: "Pro",
    price: "₦39,000",
    period: "/month",
    accent: "#3b5bfc",
    accentSolid: "#3b5bfc",
    border: "rgba(59,91,252,0.45)",
    glow: true,
    badge: "Most Popular" as string | null,
    cta: "Get Pro",
    ctaHref: "/signup",
    ctaFilled: true,
    summary: "Full power — all channels, all tools.",
    highlights: ["10 AI agents", "10,000 messages / month", "All 5 channels unlocked", "Unlimited knowledge base", "Voice & image input", "10+ built-in tools"],
  },
  {
    name: "Business",
    price: "₦89,000",
    period: "/month",
    accent: "#f59e0b",
    accentSolid: "#f59e0b",
    border: "rgba(245,158,11,0.35)",
    glow: false,
    badge: null as string | null,
    cta: "Contact Sales",
    ctaHref: "mailto:sales@everydayai.com",
    ctaFilled: true,
    summary: "Unlimited everything. Agencies & enterprises.",
    highlights: ["Unlimited agents", "Unlimited messages", "All channels + priority support", "Custom integrations", "Dedicated account manager"],
  },
];

function Pricing() {
  return (
    <section id="pricing" className="py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-sm font-medium mb-3" style={{ color: "#3b5bfc" }}>Simple pricing</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white">Priced for Nigerian businesses</h2>
          <p className="mt-4 text-white/50">Start free. Upgrade when you're ready. No surprises.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className="relative rounded-2xl p-6 flex flex-col"
              style={{
                backgroundColor: plan.glow ? "rgba(59,91,252,0.07)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${plan.border}`,
                boxShadow: plan.glow ? "0 0 40px rgba(59,91,252,0.15)" : "none",
              }}
            >
              {plan.badge && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold text-white whitespace-nowrap"
                  style={{ backgroundColor: plan.accentSolid }}
                >
                  {plan.badge}
                </div>
              )}
              <div className="mb-5">
                <h3 className="text-sm font-semibold mb-1" style={{ color: plan.accent }}>{plan.name}</h3>
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-bold text-white">{plan.price}</span>
                  <span className="text-white/40 text-sm pb-0.5">{plan.period}</span>
                </div>
                <p className="text-white/40 text-xs mt-2">{plan.summary}</p>
              </div>
              <ul className="space-y-2.5 mb-8 flex-1">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-xs text-white/65">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: plan.accentSolid }}>
                      <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                    </svg>
                    {h}
                  </li>
                ))}
              </ul>
              {plan.ctaHref.startsWith("/") ? (
                <Link href={plan.ctaHref}>
                  <span
                    className="block text-center py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-all hover:opacity-90"
                    style={plan.ctaFilled
                      ? { backgroundColor: plan.accentSolid, color: "#fff" }
                      : { border: `1px solid ${plan.border}`, color: "rgba(255,255,255,0.7)" }}
                  >
                    {plan.cta}
                  </span>
                </Link>
              ) : (
                <a
                  href={plan.ctaHref}
                  className="block text-center py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                  style={{ backgroundColor: plan.accentSolid, color: "#fff" }}
                >
                  {plan.cta}
                </a>
              )}
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-white/30 mt-8">
          All prices in Nigerian Naira (₦). Monthly billing. Cancel anytime.{" "}
          <Link href="/pricing">
            <span className="text-white/50 hover:text-white underline cursor-pointer transition-colors">See full feature comparison →</span>
          </Link>
        </p>
      </div>
    </section>
  );
}

// ─── CTA Banner ───────────────────────────────────────────────────────────────────

function CTABanner() {
  return (
    <section className="py-20 px-4">
      <div
        className="max-w-3xl mx-auto rounded-3xl p-10 sm:p-14 text-center relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, rgba(59,91,252,0.2) 0%, rgba(59,91,252,0.08) 100%)",
          border: "1px solid rgba(59,91,252,0.3)",
        }}
      >
        <div
          className="absolute inset-0 rounded-3xl pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(59,91,252,0.15) 0%, transparent 60%)" }}
        />
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 relative">
          Your competitors are already using AI.{" "}
          <span style={{ color: "#3b5bfc" }}>Don't get left behind.</span>
        </h2>
        <p className="text-white/50 mb-8 relative">Start for free. No credit card. No coding. Just results.</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 relative">
          <Link href="/signup">
            <span
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-semibold text-white cursor-pointer hover:opacity-90 transition-all hover:scale-105 active:scale-95"
              style={{ backgroundColor: "#3b5bfc", boxShadow: "0 0 40px rgba(59,91,252,0.4)" }}
            >
              Get Started Free
            </span>
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold transition-all hover:bg-white/5"
            style={{ color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.15)" }}
          >
            See How It Works
          </a>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────────

// FIX 5: More generous spacing on mobile throughout footer
function Footer() {
  return (
    <footer className="border-t px-4 pt-14 pb-10" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
      <div className="max-w-6xl mx-auto">
        <div className="grid sm:grid-cols-4 gap-10 sm:gap-8 mb-14">
          {/* Brand */}
          <div className="sm:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <img src="/owl-logo.webp" alt="EverydayAI" className="w-8 h-8 rounded-lg object-cover" />
              <span className="text-white font-bold text-base">EverydayAI</span>
            </div>
            <p className="text-sm text-white/40 leading-relaxed max-w-xs">
              AI agents for Nigerian businesses. Built to help you sell more, serve better, and grow faster.
            </p>
            <div className="flex items-center gap-4 mt-6">
              <a href="https://twitter.com/everydayai_hq" target="_blank" rel="noopener noreferrer" className="text-white/40 hover:text-white transition-colors" aria-label="Twitter">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a href="https://instagram.com/everydayai.hq" target="_blank" rel="noopener noreferrer" className="text-white/40 hover:text-white transition-colors" aria-label="Instagram">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-white text-xs font-semibold uppercase tracking-wider mb-5">Product</h4>
            <ul className="space-y-4">
              {[
                { label: "Features", href: "#features", internal: false },
                { label: "How It Works", href: "#how-it-works", internal: false },
                { label: "Pricing", href: "/pricing", internal: true },
                { label: "Templates", href: "/templates", internal: true },
              ].map((l) => (
                <li key={l.label}>
                  {l.internal ? (
                    <Link href={l.href}>
                      <span className="text-sm text-white/50 hover:text-white transition-colors cursor-pointer">{l.label}</span>
                    </Link>
                  ) : (
                    <a href={l.href} className="text-sm text-white/50 hover:text-white transition-colors">{l.label}</a>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-white text-xs font-semibold uppercase tracking-wider mb-5">Company</h4>
            <ul className="space-y-4">
              {[
                { label: "About", href: "https://everydayaihq.carrd.co" },
                { label: "Contact", href: "mailto:hello@everydayai.com" },
                { label: "Privacy Policy", href: "#" },
                { label: "Terms of Service", href: "#" },
              ].map((l) => (
                <li key={l.label}>
                  <a href={l.href} target={l.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="text-sm text-white/50 hover:text-white transition-colors">{l.label}</a>
                </li>
              ))}
            </ul>
          </div>

          {/* Get Started */}
          <div>
            <h4 className="text-white text-xs font-semibold uppercase tracking-wider mb-5">Get Started</h4>
            <ul className="space-y-4">
              <li><Link href="/signup"><span className="text-sm text-white/50 hover:text-white transition-colors cursor-pointer">Create Account</span></Link></li>
              <li><Link href="/login"><span className="text-sm text-white/50 hover:text-white transition-colors cursor-pointer">Log In</span></Link></li>
              <li><a href="https://everydayaihq.carrd.co" target="_blank" rel="noopener noreferrer" className="text-sm text-white/50 hover:text-white transition-colors">Join Waitlist</a></li>
              <li><a href="mailto:sales@everydayai.com" className="text-sm text-white/50 hover:text-white transition-colors">Sales Enquiries</a></li>
            </ul>
          </div>
        </div>

        <div
          className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          <p className="text-xs text-white/30">© {new Date().getFullYear()} EverydayAI. All rights reserved.</p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-white/30">
            <a href="https://twitter.com/everydayai_hq" target="_blank" rel="noopener noreferrer" className="hover:text-white/60 transition-colors">@everydayai_hq</a>
            <span className="hidden sm:inline">·</span>
            <a href="https://instagram.com/everydayai.hq" target="_blank" rel="noopener noreferrer" className="hover:text-white/60 transition-colors">@everydayai.hq</a>
            <span className="hidden sm:inline">·</span>
            <a href="https://everydayaihq.carrd.co" target="_blank" rel="noopener noreferrer" className="hover:text-white/60 transition-colors">everydayaihq.carrd.co</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <div style={{ backgroundColor: "#0a0f1e", fontFamily: "'Inter', sans-serif", minHeight: "100vh" }}>
      <Nav />
      <Hero />
      <HowItWorks />
      <Features />
      <Pricing />
      <CTABanner />
      <Footer />
    </div>
  );
}
