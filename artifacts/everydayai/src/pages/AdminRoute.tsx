// frontend/src/pages/AdminRoute.tsx

import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

interface AdminRouteProps {
  component: React.ComponentType;
}

export default function AdminRoute({ component: Component }: AdminRouteProps) {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"checking" | "allowed" | "denied">("checking");
  const resolved = useRef(false);

  useEffect(() => {
    resolved.current = false;

    async function verify() {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data.session;

        if (!session) {
          navigate("/login");
          return;
        }

        const res = await fetch("/api/admin/verify", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (res.status === 403) {
          setStatus("denied");
          return;
        }

        if (res.status === 401) {
          navigate("/login");
          return;
        }

        if (res.ok) {
          setStatus("allowed");
          return;
        }

        navigate("/dashboard");
      } catch {
        navigate("/login");
      } finally {
        resolved.current = true;
      }
    }

    verify();

    const timer = setTimeout(() => {
      if (!resolved.current && status === "checking") {
        navigate("/login");
      }
    }, 10000);

    return () => clearTimeout(timer);
  }, [navigate]);

  if (status === "allowed") {
    return <Component />;
  }

  if (status === "denied") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0f1e] text-white">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-red-400">Access Denied</h1>
          <p className="mt-2 text-gray-400">You do not have admin privileges.</p>
          <button
            onClick={() => navigate("/dashboard")}
            className="mt-4 px-4 py-2 bg-[#3b5bfc] rounded hover:bg-[#2a4bd4]"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0f1e]">
      <div className="w-6 h-6 rounded-full border-2 border-[#3b5bfc] border-t-transparent animate-spin" />
    </div>
  );
}
