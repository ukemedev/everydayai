import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";

interface ProtectedRouteProps {
  component: React.ComponentType;
}

export default function ProtectedRoute({ component: Component }: ProtectedRouteProps) {
  const [, navigate] = useLocation();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading && !session) {
      navigate("/login");
    }
  }, [loading, session, navigate]);

  if (loading) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center"
        style={{ backgroundColor: "#0a0f1e" }}
      >
        <div className="w-6 h-6 rounded-full border-2 border-[#3b5bfc] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session) return null;

  return <Component />;
}
