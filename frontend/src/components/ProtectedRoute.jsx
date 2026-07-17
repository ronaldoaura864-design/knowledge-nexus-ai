import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

export const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div data-testid="auth-loading" className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
      </div>
    );
  }
  if (!user) return <Navigate to="/" replace />;
  return children;
};
