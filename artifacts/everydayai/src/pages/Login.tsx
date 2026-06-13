import { useState } from "react";
import { Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Forgot password state
  const [showForgot, setShowForgot]         = useState(false);
  const [forgotEmail, setForgotEmail]       = useState("");
  const [forgotLoading, setForgotLoading]   = useState(false);
  const [forgotSuccess, setForgotSuccess]   = useState(false);
  const [forgotError, setForgotError]       = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(error.message); } else { navigate("/dashboard"); }
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setForgotError("");
    setForgotLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setForgotLoading(false);
    if (error) {
      setForgotError(error.message);
    } else {
      setForgotSuccess(true);
    }
  }

  if (showForgot) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center px-4"
        style={{ backgroundColor: "#0a0f1e", fontFamily: "'Inter', sans-serif" }}
      >
        <div
          className="w-full max-w-md rounded-2xl border border-white/10 px-8 py-10 flex flex-col gap-6"
          style={{ backgroundColor: "#111827" }}
        >
          <div className="text-center">
            <span className="text-white font-bold text-xl tracking-tight">EverydayAI</span>
          </div>

          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">Reset password</h1>
            <p className="text-sm text-white/40 mt-1">
              We'll send a reset link to your email.
            </p>
          </div>

          {forgotSuccess ? (
            <div className="flex flex-col gap-4">
              <div
                className="rounded-lg px-4 py-3 text-sm text-green-400 border border-green-500/20"
                style={{ backgroundColor: "rgba(34,197,94,0.08)" }}
              >
                Check your email — a reset link is on the way.
              </div>
              <button
                onClick={() => { setShowForgot(false); setForgotSuccess(false); setForgotEmail(""); }}
                className="text-sm text-[#3b5bfc] hover:underline text-center"
              >
                ← Back to login
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-white/70">Email</label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                  className="w-full rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/30 border border-white/10 outline-none focus:border-[#3b5bfc] transition-colors"
                  style={{ backgroundColor: "#0a0f1e" }}
                />
              </div>

              {forgotError && (
                <p className="text-sm text-red-400 text-center">{forgotError}</p>
              )}

              <button
                type="submit"
                disabled={forgotLoading}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: "#3b5bfc" }}
              >
                {forgotLoading ? "Sending…" : "Send Reset Link"}
              </button>

              <button
                type="button"
                onClick={() => { setShowForgot(false); setForgotError(""); }}
                className="text-sm text-white/40 hover:text-white/60 transition-colors text-center"
              >
                ← Back to login
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-4"
      style={{ backgroundColor: "#0a0f1e", fontFamily: "'Inter', sans-serif" }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 px-8 py-10 flex flex-col gap-6"
        style={{ backgroundColor: "#111827" }}
      >
        {/* Brand */}
        <div className="text-center">
          <span className="text-white font-bold text-xl tracking-tight">
            EverydayAI
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-white/70">Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/30 border border-white/10 outline-none focus:border-[#3b5bfc] transition-colors"
              style={{ backgroundColor: "#0a0f1e" }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-white/70">Password</label>
              <button
                type="button"
                onClick={() => { setShowForgot(true); setForgotEmail(email); setForgotError(""); setForgotSuccess(false); }}
                className="text-xs text-white/40 hover:text-[#3b5bfc] transition-colors"
              >
                Forgot password?
              </button>
            </div>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/30 border border-white/10 outline-none focus:border-[#3b5bfc] transition-colors"
              style={{ backgroundColor: "#0a0f1e" }}
            />
          </div>

          {/* Error message */}
          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          {/* CTA */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: "#3b5bfc" }}
          >
            {loading ? "Logging in…" : "Log In"}
          </button>
        </form>

        {/* Footer link */}
        <p className="text-center text-sm text-white/40">
          Don't have an account?{" "}
          <Link href="/signup" className="text-[#3b5bfc] hover:underline font-medium">
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}
