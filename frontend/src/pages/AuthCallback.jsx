import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const AuthCallback = () => {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const sessionId = params.get("session_id");

    if (!sessionId) {
      navigate("/", { replace: true });
      return;
    }

    (async () => {
      try {
        const res = await api.post("/auth/session", { session_id: sessionId });
        setUser(res.data.user);
        // Clear hash and go to dashboard
        window.history.replaceState({}, "", "/dashboard");
        navigate("/dashboard", { replace: true, state: { user: res.data.user } });
        toast.success(`Welcome, ${res.data.user.name.split(" ")[0]}!`);
      } catch (err) {
        toast.error("Sign-in failed. Please try again.");
        navigate("/", { replace: true });
      }
    })();
  }, [navigate, setUser]);

  return (
    <div data-testid="auth-callback" className="min-h-screen flex flex-col items-center justify-center gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      <div className="text-sm text-muted-foreground">Signing you in…</div>
    </div>
  );
};
