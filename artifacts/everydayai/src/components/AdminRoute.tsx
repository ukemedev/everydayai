import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

interface AdminRouteProps {
  component: React.ComponentType;
}

export default function AdminRoute({ component: Component }: AdminRouteProps) {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    async function verify() {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        navigate("/login");
        return;
      }

      try {
        const res = await fetch("/api/admin/verify", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
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
