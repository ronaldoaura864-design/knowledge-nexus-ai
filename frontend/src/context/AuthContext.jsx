import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext({ user: null, loading: true, refresh: () => {}, logout: () => {} });

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get("/auth/me");
      setUser(res.data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // CRITICAL: skip /me check if OAuth callback is in progress
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    refresh();
  }, [refresh]);

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch { /* noop */ }
    setUser(null);
    window.location.href = "/";
  };

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
