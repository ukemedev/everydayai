import { useState, useEffect } from "react";
import { Link } from "wouter";
import { supabase } from "@/lib/supabase";

// ─── Plan data ─────────────────────────────────────────────────────────────────

const plans = [
  {
    id:          "free",
    name:        "Free",
    price:       "₦0",
    dollarEquiv: null as string | null,
    period:      "forever",
    accent:      "rgba(255,255,255,0.45)",
    border:      "rgba(255,255,255,0.10)",
    glow:        false,
    badge:       null as string | null,
    cta:         "Get Started Free",
    ctaHref:     "/signup",
    ctaStyle:    "outline" as const,
    summary:     "Try it out. No card needed.",
  },
  {
    id:          "starter",
    name:        "Starter",
    price:       "₦10,500",
    dollarEquiv: "~$7.75/month",
    period:      "/month",
    accent:      "#10b981",
    border:      "rgba(16,185,129,0.35)",
    glow:        false,
    badge:       null as string | null,
    cta:         "Upgrade to Starter",
    ctaHref:     "/signup",
    ctaStyle:    "filled" as const,
    summary:     "For small businesses going live on their first channel.",
  },
  {
    id:          "pro",
    name:        "Pro",
    price:       "₦22,000",
    dollarEquiv: "~$16.25/month",
    period:      "/month",
    accent:      "#3b5bfc",
    border:      "rgba(59,91,252,0.50)",
    glow:        true,
    badge:       "Most Popular",
    cta:         "Upgrade to Pro",
    ctaHref:     "/signup",
    ctaStyle:    "filled" as const,
    summary:     "Full power — all channels, all tools, all input types.",
  },
] as const;

// ─── Feature table ──────────────────────────────────────────────────────────────

type CellValue = string | boolean;

interface FeatureRow {
  label:     string;
  sublabel?: string;
  free:      CellValue;
  starter:   CellValue;
  pro:       CellValue;
}

interface FeatureSection {
  section: string;
  rows:    FeatureRow[];
}

const featureTable: FeatureSection[] = [
  {
    section: "Core",
    rows: [
      {
        label:    "AI Agents",
        sublabel: "Number of agents you can create",
        free:     "1 agent",
        starter:  "3 agents",
        pro:      "10 agents",
      },
      {
        label:    "Messages per Month",
        sublabel: "Conversations across all channels",
        free:     "200",
        starter:  "2,000",
        pro:      "10,000",
      },
      {
        label:    "Agent Templates",
        sublabel: "Pre-built agents you can launch in seconds",
        free:     "Free templates",
        starter:  "Starter templates",
        pro:      "All templates",
      },
      {
        label:    "Knowledge Base",
        sublabel: "Upload documents your agent learns from",
        free:     false,
        starter:  "Up to 10 docs",
        pro:      "Unlimited",
      },
    ],
  },
  {
    section: "Channels",
    rows: [
      {
        label:    "Web Chat Widget",
        sublabel: "Embeddable chat on your website",
        free:     true,
        starter:  true,
        pro:      true,
      },
      {
        label:    "WhatsApp",
        sublabel: "Deploy your agent to WhatsApp Business",
        free:     false,
        starter:  "1 channel",
        pro:      true,
      },
      {
        label:    "Telegram",
        sublabel: "Deploy your agent as a Telegram bot",
        free:     false,
        starter:  "1 channel",
        pro:      true,
      },
      {
        label:    "Messenger & Instagram",
        sublabel: "Facebook Messenger + Instagram DMs",
        free:     false,
        starter:  false,
        pro:      true,
      },
    ],
  },
  {
    section: "Tools & Integrations",
    rows: [
      {
        label:    "Google Sheets",
        sublabel: "Log leads, orders, and data automatically",
        free:     false,
        starter:  true,
        pro:      true,
      },
      {
        label:    "Gmail",
        sublabel: "Send confirmation and notification emails",
        free:     false,
        starter:  true,
        pro:      true,
      },
      {
        label:    "Telegram Notifications",
        sublabel: "Get instant alerts when customers send messages",
        free:     false,
        starter:  true,
        pro:      true,
      },
      {
        label:    "Termii SMS",
        sublabel: "Send OTPs and SMS to Nigerian numbers",
        free:     false,
        starter:  true,
        pro:      true,
      },
      {
        label:    "Paystack",
        sublabel: "Check balances and transaction history",
        free:     false,
        starter:  false,
        pro:      true,
      },
      {
        label:    "HubSpot CRM",
        sublabel: "Auto-create contacts from conversations",
        free:     false,
        starter:  false,
        pro:      true,
      },
      {
        label:    "Web Search",
        sublabel: "Real-time internet search in every reply",
        free:     false,
        starter:  false,
        pro:      true,
      },
      {
        label:    "Google Calendar",
        sublabel: "Book appointments from the chat",
        free:     false,
        starter:  false,
        pro:      true,
      },
      {
        label:    "Google Drive",
        sublabel: "Save and retrieve files automatically",
        free:     false,
        starter:  false,
        pro:      true,
      },
      {
        label:    "Vapi.ai Voice Calls",
        sublabel: "Trigger AI phone calls from the agent",
        free:     false,
        starter:  false,
        pro:      true,
      },
    ],
  },
  {
    section: "Input Capabilities",
    rows: [
      {
        label:    "Text",
        sublabel: "Standard text conversations",
        free:     true,
        starter:  true,
        pro:      true,
      },
      {
        label:    "File Uploads",
        sublabel: "Customers can send PDFs and documents",
        free:     false,
        starter:  true,
        pro:      true,
      },
      {
        label:    "Image Input",
        sublabel: "Customers can send photos for analysis",
        free:     false,
        starter:  false,
        pro:      true,
      },
      {
        label:    "Voice Notes",
        sublabel: "Customers can send voice messages",
        free:     false,
        starter:  false,
        pro:      true,
      },
    ],
  },
  {
    section: "Support & Access",
    rows: [
      {
        label:   "Support",
        free:    "Community",
        starter: "Email",
        pro:     "Priority email",
      },
      {
        label:    "Usage Analytics",
        sublabel: "See how your agents are performing",
        free:     false,
        starter:  false,
        pro:      true,
      },
      {
        label:    "White-label",
        sublabel: "Remove EverydayAI branding entirely",
        free:     false,
        starter:  false,
        pro:      false,
      },
    ],
  },
];

// ─── Cell renderer ─────────────────────────────────────────────────────────────

function Cell({ value, accent }: { value: CellValue; accent: string }) {
  if (value === true) {
    return (
      <div className="flex justify-center">
        <span
          className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
          style={{ backgroundColor: `${accent}22`, color: accent }}
        >
          ✓
        </span>
      </div>
    );
  }
  if (value === false) {
    return (
      <div className="flex justify-center">
        <span style={{ color: "rgba(255,255,255,0.18)", fontSize: "18px", lineHeight: 1 }}>—</span>
      </div>
    );
  }
  return (
    <p className="text-center text-xs font-medium text-white leading-snug">
      {value}
    </p>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const faqs = [
  {
    q: "Is there a free trial?",
    a: "Yes — the Free plan is free forever with 200 messages/month and 1 agent. No credit card required.",
  },
  {
    q: "What currency do you charge in?",
    a: "All payments are processed in Nigerian Naira (₦) via Paystack. No dollar charges, no surprises.",
  },
  {
    q: "What happens when I hit my message limit?",
    a: "Your agent stays live but new conversations are paused until you upgrade or your monthly count resets.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes — cancel any time from your billing page. No lock-ins, no hidden fees.",
  },
  {
    q: "What does '1 channel' mean on Starter?",
    a: "On Starter you can deploy to one external channel — WhatsApp or Telegram. Upgrading to Pro unlocks all five channels simultaneously.",
  },
  {
    q: "Do you offer discounts for annual billing?",
    a: "Yes — pay annually and get 2 months free on any plan. Contact us to switch.",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Pricing() {
  const accents: Record<string, string> = {
    free:    "rgba(255,255,255,0.45)",
    starter: "#10b981",
    pro:     "#3b5bfc",
  };

  const [loggedIn,    setLoggedIn]    = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setLoggedIn(!!data.user);
      setAuthChecked(true);
    });
  }, []);

  return (
    <div
      className="min-h-screen w-full flex flex-col"
      style={{ backgroundColor: "#0a0f1e", fontFamily: "'Inter', sans-serif" }}
    >
      {/* Navbar */}
      <nav className="w-full flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5">
        <Link href="/">
          <span className="text-white font-bold text-lg sm:text-xl tracking-tight cursor-pointer shrink-0">
            EverydayAI
          </span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-3" style={{ minHeight: "36px" }}>
          {authChecked && (loggedIn ? (
            <Link href="/dashboard">
              <button
                className="px-3 sm:px-5 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium text-white transition-all duration-200 hover:opacity-90 active:scale-95 whitespace-nowrap"
                style={{ backgroundColor: "#3b5bfc" }}
              >
                Go to Dashboard →
              </button>
            </Link>
          ) : (
            <>
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
            </>
          ))}
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 pt-10 pb-24">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="text-center mb-10 max-w-xl">
          <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight tracking-tight">
            Simple, honest pricing
          </h1>
          <p className="mt-3 text-base" style={{ color: "rgba(255,255,255,0.45)" }}>
            Start free. Pay when your business is ready to grow.
          </p>
        </div>

        {/* ── Plan cards ──────────────────────────────────────────────────── */}
        <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-3 gap-4 mb-14">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="relative flex flex-col rounded-2xl p-6 transition-transform duration-200 hover:-translate-y-0.5"
              style={{
                backgroundColor: "#0d1424",
                border: `1px solid ${plan.border}`,
                boxShadow: plan.glow ? "0 0 50px rgba(59,91,252,0.13)" : undefined,
              }}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span
                    className="px-3 py-1 rounded-full text-xs font-semibold text-white whitespace-nowrap"
                    style={{ backgroundColor: "#3b5bfc" }}
                  >
                    {plan.badge}
                  </span>
                </div>
              )}

              <p className="text-sm font-semibold mb-2" style={{ color: plan.accent }}>
                {plan.name}
              </p>

              <div className="flex items-end gap-1 mb-0.5">
                <span className="text-3xl font-bold text-white leading-none">{plan.price}</span>
                <span className="text-xs mb-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {plan.period}
                </span>
              </div>

              {plan.dollarEquiv && (
                <p className="text-xs mb-1" style={{ color: "rgba(255,255,255,0.30)" }}>
                  {plan.dollarEquiv}
                </p>
              )}

              <p className="text-xs mb-6 mt-1 leading-snug" style={{ color: "rgba(255,255,255,0.40)" }}>
                {plan.summary}
              </p>

              <Link href={
                plan.id === "free"
                  ? (loggedIn ? "/dashboard" : "/signup")
                  : (loggedIn ? "/billing" : "/signup")
              }>
                <button
                  className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 hover:opacity-90 active:scale-95 mt-auto"
                  style={
                    plan.ctaStyle === "outline"
                      ? {
                          backgroundColor: "transparent",
                          border: `1px solid ${plan.border}`,
                          color: "rgba(255,255,255,0.65)",
                        }
                      : {
                          backgroundColor: plan.accent,
                          color: "#fff",
                          border: "none",
                        }
                  }
                >
                  {plan.id !== "free" && loggedIn ? `Upgrade to ${plan.name}` : plan.cta}
                </button>
              </Link>
            </div>
          ))}
        </div>

        {/* ── Annual discount nudge ───────────────────────────────────────── */}
        <div
          className="w-full max-w-3xl rounded-xl px-5 py-3 mb-10 flex items-center gap-3"
          style={{ backgroundColor: "rgba(59,91,252,0.08)", border: "1px solid rgba(59,91,252,0.20)" }}
        >
          <span className="text-sm">💡</span>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
            Pay annually and get <span className="text-white font-semibold">2 months free</span> on any plan.{" "}
            <a href="mailto:sales@everydayai.com" className="underline underline-offset-2 hover:opacity-80" style={{ color: "#3b5bfc" }}>
              Contact us to switch →
            </a>
          </p>
        </div>

        {/* ── Feature comparison table ─────────────────────────────────────── */}
        <div className="w-full max-w-3xl">

          <h2 className="text-base font-semibold text-white mb-4">
            What's included in each plan
          </h2>

          <div
            className="rounded-2xl overflow-hidden border"
            style={{ borderColor: "rgba(255,255,255,0.07)", backgroundColor: "#0d1424" }}
          >
            {/* Table header */}
            <div
              className="grid grid-cols-4 gap-0 px-5 py-3 border-b"
              style={{ borderColor: "rgba(255,255,255,0.07)" }}
            >
              <div />
              {plans.map((p) => (
                <div key={p.id} className="flex flex-col items-center gap-0.5">
                  <p className="text-xs font-bold" style={{ color: p.accent }}>
                    {p.name}
                  </p>
                  <p className="text-xs font-semibold text-white">{p.price}</p>
                </div>
              ))}
            </div>

            {/* Sections */}
            {featureTable.map((section, si) => (
              <div key={section.section}>
                {/* Section label */}
                <div
                  className="px-5 py-2"
                  style={{ backgroundColor: "rgba(255,255,255,0.025)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {section.section}
                  </p>
                </div>

                {/* Rows */}
                {section.rows.map((row, ri) => {
                  const isLast = si === featureTable.length - 1 && ri === section.rows.length - 1;
                  return (
                    <div
                      key={row.label}
                      className="grid grid-cols-4 gap-0 items-center px-5 py-3.5"
                      style={{
                        borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      <div className="pr-4">
                        <p className="text-sm text-white font-medium leading-snug">{row.label}</p>
                        {row.sublabel && (
                          <p className="text-xs mt-0.5 leading-snug" style={{ color: "rgba(255,255,255,0.35)" }}>
                            {row.sublabel}
                          </p>
                        )}
                      </div>
                      <Cell value={row.free}    accent={accents.free} />
                      <Cell value={row.starter} accent={accents.starter} />
                      <Cell value={row.pro}     accent={accents.pro} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* ── FAQ ─────────────────────────────────────────────────────────── */}
        <div className="w-full max-w-2xl mt-14">
          <h2 className="text-base font-semibold text-white mb-4 text-center">
            Common questions
          </h2>
          <div className="flex flex-col gap-3">
            {faqs.map((faq) => (
              <div
                key={faq.q}
                className="rounded-xl px-5 py-4"
                style={{
                  backgroundColor: "#0d1424",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <p className="text-sm font-semibold text-white mb-1">{faq.q}</p>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.50)" }}>
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Bottom CTA ──────────────────────────────────────────────────── */}
        <div className="mt-14 text-center flex flex-col items-center gap-4">
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.40)" }}>
            Running an agency or need a custom setup?
          </p>
          <a
            href="mailto:sales@everydayai.com"
            className="text-sm font-semibold underline underline-offset-4 transition-opacity hover:opacity-70"
            style={{ color: "#3b5bfc" }}
          >
            Talk to us about enterprise pricing →
          </a>
        </div>

      </main>
    </div>
  );
}
