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
      let session = null;

      try {
        const { data } = await supabase.auth.getSession();
        session = data.session;
      } catch {
        // getSession() failed — treat as unauthenticated
        navigate("/login");
        return;
      }

      if (!session) {
        navigate("/login");
        return;
      }

      try {
        const res = await fetch("/api/admin/verify", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (res.ok) {
          setStatus("allowed");
        } else {
          setStatus("denied");
          navigate("/dashboard");
        }
      } catch {
        setStatus("denied");
        navigate("/dashboard");
      }
    }

    verify();

    // Safety: if verify() hangs for more than 10 s, redirect to login
    const timer = setTimeout(() => {
      if (!resolved.current && status === "checking") {
        navigate("/login");
      }
    }, 10000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  if (status === "allowed") {
    return <Component />;
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center"
      style={{ backgroundColor: "#0a0f1e" }}
    >
      <div className="w-6 h-6 rounded-full border-2 border-[#3b5bfc] border-t-transparent animate-spin" />
    </div>
  );
}
