import { Link } from "wouter";
import { Check } from "lucide-react";

// ─── Data ─────────────────────────────────────────────────────────────────────

const plans = [
  {
    id:      "free",
    name:    "Free",
    price:   "$0",
    period:  "/month",
    border:  "rgba(255,255,255,0.12)",
    accent:  "rgba(255,255,255,0.55)",
    btnStyle: "outline" as const,
    badge:   null,
    features: [
      "1 agent",
      "50 messages/month",
      "Basic knowledge base",
    ],
  },
  {
    id:      "starter",
    name:    "Starter",
    price:   "$5",
    period:  "/month",
    border:  "rgba(16,185,129,0.35)",
    accent:  "#10b981",
    btnStyle: "filled" as const,
    badge:   null,
    features: [
      "3 agents",
      "500 messages/month",
      "Knowledge base",
      "All connectors",
    ],
  },
  {
    id:      "pro",
    name:    "Pro",
    price:   "$15",
    period:  "/month",
    border:  "rgba(59,91,252,0.50)",
    accent:  "#3b5bfc",
    btnStyle: "filled" as const,
    badge:   "Most Popular",
    features: [
      "10 agents",
      "Unlimited messages",
      "Knowledge base",
      "All connectors",
      "Priority support",
    ],
  },
  {
    id:      "business",
    name:    "Business",
    price:   "$35",
    period:  "/month",
    border:  "rgba(245,158,11,0.40)",
    accent:  "#f59e0b",
    btnStyle: "filled" as const,
    badge:   null,
    features: [
      "Unlimited agents",
      "Unlimited messages",
      "Knowledge base",
      "All connectors",
      "Priority support",
      "Custom onboarding",
    ],
  },
] as const;

const faqs = [
  {
    q: "Can I cancel anytime?",
    a: "Yes, cancel anytime from your billing dashboard.",
  },
  {
    q: "What payment methods are accepted?",
    a: "We accept cards via Stripe and bank payments via Paystack.",
  },
  {
    q: "What happens when I hit my message limit?",
    a: "You will see an upgrade prompt. Your agent stays live but new messages are paused until you upgrade or the month resets.",
  },
];

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({ plan }: { plan: typeof plans[number] }) {
  const isOutline = plan.btnStyle === "outline";

  return (
    <div
      className="relative flex flex-col rounded-2xl p-6 transition-transform duration-200 hover:-translate-y-0.5"
      style={{
        backgroundColor: "#0d1424",
        border: `1px solid ${plan.border}`,
        boxShadow: plan.id === "pro" ? `0 0 40px rgba(59,91,252,0.12)` : undefined,
      }}
    >
      {/* Most Popular badge */}
      {plan.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span
            className="px-3 py-1 rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: "#3b5bfc" }}
          >
            {plan.badge}
          </span>
        </div>
      )}

      {/* Plan name */}
      <p className="text-sm font-semibold mb-3" style={{ color: plan.accent }}>
        {plan.name}
      </p>

      {/* Price */}
      <div className="flex items-end gap-1 mb-6">
        <span className="text-4xl font-bold text-white leading-none">{plan.price}</span>
        <span className="text-sm mb-1" style={{ color: "rgba(255,255,255,0.40)" }}>
          {plan.period}
        </span>
      </div>

      {/* Features */}
      <ul className="flex flex-col gap-2.5 mb-8 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-center gap-2.5 text-sm" style={{ color: "rgba(255,255,255,0.70)" }}>
            <Check size={14} strokeWidth={2.5} style={{ color: plan.accent, flexShrink: 0 }} />
            {f}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <Link href="/signup">
        <button
          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 hover:opacity-90 active:scale-95"
          style={
            isOutline
              ? {
                  backgroundColor: "transparent",
                  border: `1px solid ${plan.border}`,
                  color: "rgba(255,255,255,0.70)",
                }
              : {
                  backgroundColor: plan.accent,
                  color: "#fff",
                }
          }
        >
          Get Started
        </button>
      </Link>
    </div>
  );
}

// ─── FAQ Item ─────────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div
      className="rounded-xl px-5 py-4"
      style={{
        backgroundColor: "#0d1424",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <p className="text-sm font-semibold text-white mb-1.5">{q}</p>
      <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.50)" }}>{a}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Pricing() {
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
        <div className="flex items-center gap-1.5 sm:gap-3">
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

      {/* Main */}
      <main className="flex-1 flex flex-col items-center px-6 pt-12 pb-24">
        {/* Header */}
        <div className="text-center mb-12 max-w-xl">
          <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight tracking-tight">
            Simple, Fair Pricing
          </h1>
          <p className="mt-4 text-base" style={{ color: "rgba(255,255,255,0.50)" }}>
            Start free. Upgrade when you're ready.
          </p>
        </div>

        {/* Plan cards grid */}
        <div className="w-full max-w-5xl grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>

        {/* FAQ */}
        <div className="w-full max-w-2xl mt-16">
          <h2 className="text-lg font-semibold text-white mb-5 text-center">
            Frequently Asked Questions
          </h2>
          <div className="flex flex-col gap-3">
            {faqs.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
