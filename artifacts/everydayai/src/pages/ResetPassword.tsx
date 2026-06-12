import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [success, setSuccess]         = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });
  }, []);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      setTimeout(() => navigate("/dashboard"), 2500);
    }
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
        <div className="text-center">
          <span className="text-white font-bold text-xl tracking-tight">EverydayAI</span>
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Set new password</h1>
          <p className="text-sm text-white/40 mt-1">Choose a strong password for your account.</p>
        </div>

        {success ? (
          <div
            className="rounded-lg px-4 py-3 text-sm text-green-400 border border-green-500/20 text-center"
            style={{ backgroundColor: "rgba(34,197,94,0.08)" }}
          >
            Password updated! Redirecting to dashboard…
          </div>
        ) : !sessionReady ? (
          <div className="text-center text-sm text-white/40">
            Loading — please wait…
          </div>
        ) : (
          <form onSubmit={handleReset} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-white/70">New password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/30 border border-white/10 outline-none focus:border-[#3b5bfc] transition-colors"
                style={{ backgroundColor: "#0a0f1e" }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-white/70">Confirm password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="w-full rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/30 border border-white/10 outline-none focus:border-[#3b5bfc] transition-colors"
                style={{ backgroundColor: "#0a0f1e" }}
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#3b5bfc" }}
            >
              {loading ? "Updating…" : "Update Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
