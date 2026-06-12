import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import OnboardingChatModal from "./OnboardingChatModal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Step {
  id:          number;
  label:       string;
  description: string;
  time:        string;
  done:        boolean;
  skippable?:  boolean;
}

interface Props {
  hasAgents:       boolean;
  hasDocuments:    boolean;
  hasTestedChat:   boolean;
  hasLiveChannel:  boolean;
  firstAgentId:    string | null;
  firstAgentName:  string;
  onComplete:      () => void;
  onTestedChat:    () => void;
  onRetakeChat:    () => void;
  onCreateAgent:   () => void;
  step3Skipped:    boolean;
  onSkipStep3:     () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// ─── OnboardingCard ───────────────────────────────────────────────────────────

export default function OnboardingCard({
  hasAgents, hasDocuments, hasTestedChat, hasLiveChannel,
  firstAgentId, firstAgentName,
  onComplete, onTestedChat, onRetakeChat, onCreateAgent,
  step3Skipped, onSkipStep3,
}: Props) {
  const [, navigate]          = useLocation();
  const [showChat, setShowChat] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const steps: Step[] = [
    {
      id:          1,
      label:       "Create your account",
      description: "You're in. Your EverydayAI account is ready.",
      time:        "",
      done:        true,
    },
    {
      id:          2,
      label:       "Create your first agent",
      description: "Give your AI a name and tell it about your business.",
      time:        "1 min",
      done:        hasAgents,
    },
    {
      id:          3,
      label:       "Teach it your business",
      description: "Upload a price list, menu, or FAQ so your agent knows your products.",
      time:        "2 min",
      done:        hasDocuments || step3Skipped,
      skippable:   true,
    },
    {
      id:          4,
      label:       "Test your agent",
      description: "Chat with your agent right here before going live.",
      time:        "1 min",
      done:        hasTestedChat,
    },
    {
      id:          5,
      label:       "Go live on WhatsApp or Telegram",
      description: "Connect a channel so real customers can talk to your agent.",
      time:        "3 min",
      done:        hasLiveChannel,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const progressPct    = Math.round((completedCount / steps.length) * 100);
  const allDone        = completedCount === steps.length;

  const activeStep = steps.find((s) => !s.done) ?? steps[steps.length - 1];

  async function handleDismiss() {
    setDismissing(true);
    const session = await getSession();
    if (session) {
      void fetch("/api/onboarding/complete", {
        method:  "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => {});
    }
    onComplete();
  }

  function handleStepAction(step: Step) {
    if (step.done) return;
    switch (step.id) {
      case 2: onCreateAgent(); break;
      case 3: navigate(`/studio/${firstAgentId ?? ""}`); break;
      case 4: setShowChat(true); break;
      case 5: navigate(`/studio/${firstAgentId ?? ""}`); break;
    }
  }

  return (
    <>
      <AnimatePresence>
        {showChat && firstAgentId && (
          <OnboardingChatModal
            agentId={firstAgentId}
            agentName={firstAgentName}
            onClose={() => setShowChat(false)}
            onTested={() => { onTestedChat(); setShowChat(false); }}
          />
        )}
      </AnimatePresence>

      <motion.div
        className="w-full rounded-2xl border mb-8 overflow-hidden"
        style={{ backgroundColor: "#111827", borderColor: "rgba(255,255,255,0.08)" }}
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16, scale: 0.98 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-base font-bold text-white leading-snug">
                {allDone ? "Your agent is live! 🎉" : "Get your first agent live"}
              </h2>
              <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.40)" }}>
                {allDone
                  ? "You've completed all setup steps. Your agent is ready for customers."
                  : `${completedCount} of ${steps.length} steps done · under 3 minutes total`}
              </p>
            </div>
            <button
              onClick={() => void handleDismiss()}
              disabled={dismissing}
              className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg transition-colors hover:bg-white/5 disabled:opacity-40"
              style={{ color: "rgba(255,255,255,0.30)" }}
            >
              {allDone ? "Dismiss" : "Skip setup"}
            </button>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.07)" }}>
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: allDone ? "#22c55e" : "#3b5bfc" }}
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
          <p className="text-[11px] mt-1.5 font-medium" style={{ color: "rgba(255,255,255,0.25)" }}>
            {progressPct}% complete
          </p>
        </div>

        {/* Divider */}
        <div style={{ height: "1px", backgroundColor: "rgba(255,255,255,0.06)" }} />

        {/* Steps */}
        <div className="px-3 py-3 flex flex-col gap-0.5">
          {steps.map((step, idx) => {
            const isActive  = step.id === activeStep.id && !step.done;
            const isLocked  = !step.done && step.id > activeStep.id;

            return (
              <motion.div
                key={step.id}
                layout
                className={`flex items-center gap-3.5 px-3 py-3 rounded-xl transition-colors ${
                  isActive ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"
                } ${isLocked ? "opacity-40" : ""}`}
              >
                {/* Check circle */}
                <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
                  {step.done ? (
                    <motion.div
                      className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: "rgba(34,197,94,0.15)" }}
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    >
                      <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3">
                        <path d="M2 6l3 3 5-5" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </motion.div>
                  ) : (
                    <div
                      className="w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold"
                      style={{
                        borderColor: isActive ? "#3b5bfc" : "rgba(255,255,255,0.12)",
                        color: isActive ? "#3b5bfc" : "rgba(255,255,255,0.25)",
                      }}
                    >
                      {idx + 1}
                    </div>
                  )}
                </div>

                {/* Label + description */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-medium leading-none"
                    style={{ color: step.done ? "rgba(255,255,255,0.50)" : isActive ? "#fff" : "rgba(255,255,255,0.55)" }}
                  >
                    {step.label}
                    {step.time && !step.done && (
                      <span className="ml-2 text-[10px] font-normal" style={{ color: "rgba(255,255,255,0.25)" }}>
                        ~{step.time}
                      </span>
                    )}
                  </p>
                  {isActive && (
                    <motion.p
                      className="text-xs mt-0.5 leading-relaxed"
                      style={{ color: "rgba(255,255,255,0.35)" }}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      transition={{ duration: 0.2 }}
                    >
                      {step.description}
                    </motion.p>
                  )}
                </div>

                {/* CTA */}
                {isActive && (
                  <motion.div
                    className="flex-shrink-0 flex items-center gap-2"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: 0.05 }}
                  >
                    {step.skippable && !step.done && (
                      <button
                        onClick={onSkipStep3}
                        className="text-xs transition-colors"
                        style={{ color: "rgba(255,255,255,0.25)" }}
                      >
                        Skip
                      </button>
                    )}
                    {step.id !== 1 && (
                      <button
                        onClick={() => handleStepAction(step)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                        style={{ backgroundColor: "#3b5bfc" }}
                      >
                        {step.id === 2 && "Create agent"}
                        {step.id === 3 && "Add knowledge"}
                        {step.id === 4 && "Test now"}
                        {step.id === 5 && "Connect channel"}
                      </button>
                    )}
                    {/* Retake button — only when step 4 is already done */}
                    {step.id === 4 && hasTestedChat && step.done && (
                      <button
                        onClick={onRetakeChat}
                        className="text-xs transition-colors ml-2"
                        style={{ color: "rgba(255,255,255,0.25)" }}
                      >
                        Retake
                      </button>
                    )}
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </>
  );
}
