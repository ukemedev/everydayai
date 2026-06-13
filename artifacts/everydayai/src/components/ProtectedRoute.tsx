import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

interface ProtectedRouteProps {
  component: React.ComponentType;
}

export default function ProtectedRoute({ component: Component }: ProtectedRouteProps) {
  const [, navigate] = useLocation();
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const resolved = useRef(false);

  useEffect(() => {
    resolved.current = false;

    function resolve(hasSession: boolean) {
      if (resolved.current) return;
      resolved.current = true;
      if (hasSession) {
        setAuthenticated(true);
      } else {
        navigate("/login");
      }
      setChecking(false);
    }

    // onAuthStateChange is the single source of truth.
    // INITIAL_SESSION fires exactly once per registration (with or without a session)
    // and is the authoritative answer to "is the user logged in right now?".
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") {
        resolve(!!session);
      } else if (event === "SIGNED_OUT") {
        setAuthenticated(false);
        navigate("/login");
      } else if (
        (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") &&
        session
      ) {
        setAuthenticated(true);
        // Safety: if checking was never cleared (e.g. INITIAL_SESSION misfired)
        if (!resolved.current) resolve(true);
      }
    });

    // Absolute fallback: if INITIAL_SESSION never fires within 5 s (e.g. Supabase JS bug),
    // kick the user to login rather than show an infinite spinner.
    const timer = setTimeout(() => {
      if (!resolved.current) {
        resolved.current = true;
        setChecking(false);
        navigate("/login");
      }
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [navigate]);

  if (checking) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center"
        style={{ backgroundColor: "#0a0f1e" }}
      >
        <div className="w-6 h-6 rounded-full border-2 border-[#3b5bfc] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!authenticated) return null;

  return <Component />;
}
