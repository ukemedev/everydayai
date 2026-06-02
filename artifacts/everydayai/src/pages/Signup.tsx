import { useState } from "react";
import { Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

export default function Signup() {
  const [, navigate] = useLocation();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      // Fire welcome email (non-blocking — don't await)
      if (data.session?.access_token) {
        void fetch("/api/auth/welcome", {
          method:  "POST",
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        }).catch(() => { /* swallow — email failure should never block signup */ });
      }
      navigate("/dashboard");
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
        {/* Brand */}
        <div className="text-center">
          <span className="text-white font-bold text-xl tracking-tight">
            EverydayAI
          </span>
        </div>

        {/* Heading */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Create your account</h1>
        </div>

        {/* Form */}
        <form onSubmit={handleSignup} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-white/70">Full Name</label>
            <input
              type="text"
              placeholder="Jane Smith"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/30 border border-white/10 outline-none focus:border-[#3b5bfc] transition-colors"
              style={{ backgroundColor: "#0a0f1e" }}
            />
          </div>

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
            <label className="text-sm font-medium text-white/70">Password</label>
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
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>

        {/* Footer link */}
        <p className="text-center text-sm text-white/40">
          Already have an account?{" "}
          <Link href="/login" className="text-[#3b5bfc] hover:underline font-medium">
            Log In
          </Link>
        </p>
      </div>
    </div>
  );
}
