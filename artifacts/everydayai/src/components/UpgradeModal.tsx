import { useLocation } from "wouter";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason: "agent_limit" | "message_limit";
  currentPlan?: string;
}

const plans = [
  {
    key: "starter",
    name: "Starter",
    price: "$5",
    period: "/month",
    features: ["3 agents", "500 messages/month", "Knowledge base", "All connectors"],
    badge: null,
    buttonLabel: "Upgrade to Starter",
    buttonStyle: { backgroundColor: "#16a34a" },
  },
  {
    key: "pro",
    name: "Pro",
    price: "$15",
    period: "/month",
    features: ["10 agents", "Unlimited messages", "Priority support", "Advanced analytics"],
    badge: "Most Popular",
    buttonLabel: "Upgrade to Pro",
    buttonStyle: { backgroundColor: "#3b5bfc" },
  },
  {
    key: "business",
    name: "Business",
    price: "$35",
    period: "/month",
    features: ["Unlimited agents", "Unlimited messages", "Dedicated support", "Custom integrations"],
    badge: null,
    buttonLabel: "Upgrade to Business",
    buttonStyle: { backgroundColor: "#b45309" },
  },
];

export default function UpgradeModal({ isOpen, onClose, reason }: UpgradeModalProps) {
  const [, navigate] = useLocation();

  if (!isOpen) return null;

  const subtitle =
    reason === "agent_limit"
      ? "You've reached your agent limit on the Free plan. Upgrade to create more agents."
      : "You've used all your messages this month. Upgrade to keep chatting.";

  function handleUpgrade() {
    onClose();
    navigate("/pricing");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      style={{ backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border flex flex-col overflow-hidden"
        style={{ backgroundColor: "#131a2e", borderColor: "rgba(255,255,255,0.08)" }}
      >
        {/* Header */}
        <div className="relative flex flex-col items-center text-center px-8 pt-8 pb-6">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-xl transition-colors hover:bg-white/5"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            ×
          </button>

          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-4"
            style={{ backgroundColor: "rgba(59,91,252,0.15)" }}
          >
            🚀
          </div>

          <h2 className="text-xl font-bold text-white mb-2">Upgrade Your Plan</h2>
          <p className="text-sm leading-relaxed max-w-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
            {subtitle}
          </p>
        </div>

        {/* Divider */}
        <div style={{ height: "1px", backgroundColor: "rgba(255,255,255,0.06)" }} />

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-6 py-6">
          {plans.map((plan) => (
            <div
              key={plan.key}
              className="relative flex flex-col rounded-xl border p-5"
              style={{
                backgroundColor: "#0d1424",
                borderColor: plan.key === "pro" ? "rgba(59,91,252,0.4)" : "rgba(255,255,255,0.07)",
              }}
            >
              {plan.badge && (
                <span
                  className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold px-3 py-1 rounded-full whitespace-nowrap"
                  style={{ backgroundColor: "#3b5bfc", color: "#fff" }}
                >
                  {plan.badge}
                </span>
              )}

              <p className="text-sm font-semibold text-white mb-1">{plan.name}</p>
              <div className="flex items-baseline gap-0.5 mb-4">
                <span className="text-2xl font-bold text-white">{plan.price}</span>
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>{plan.period}</span>
              </div>

              <ul className="flex flex-col gap-2 mb-5 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
                    <span className="text-green-400 mt-0.5 flex-shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={handleUpgrade}
                className="w-full py-2 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                style={plan.buttonStyle}
              >
                {plan.buttonLabel}
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="text-center px-8 py-4 border-t"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
            Questions? Contact us at{" "}
            <a
              href="mailto:support@everydayai.com"
              className="hover:underline"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              support@everydayai.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
