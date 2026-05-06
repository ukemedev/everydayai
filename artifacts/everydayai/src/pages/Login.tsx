import { Link } from "wouter";

export default function Login() {
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
          <h1 className="text-2xl font-bold text-white">Welcome back</h1>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-white/70">Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              className="w-full rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/30 border border-white/10 outline-none focus:border-[#3b5bfc] transition-colors"
              style={{ backgroundColor: "#0a0f1e" }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-white/70">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              className="w-full rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/30 border border-white/10 outline-none focus:border-[#3b5bfc] transition-colors"
              style={{ backgroundColor: "#0a0f1e" }}
            />
          </div>
        </div>

        {/* CTA */}
        <button
          className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 active:scale-95"
          style={{ backgroundColor: "#3b5bfc" }}
        >
          Log In
        </button>

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
