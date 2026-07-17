import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { Landing } from "@/pages/Landing";
import { Dashboard } from "@/pages/Dashboard";
import { Builder } from "@/pages/Builder";
import { AuthCallback } from "@/pages/AuthCallback";
import { PublicPreview } from "@/pages/PublicPreview";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Toaster } from "sonner";

const AppRouter = () => {
  const location = useLocation();

  // Ensure dark class exists at bootstrap
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const dark = saved ? saved === "dark" : true;
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("light", !dark);
  }, []);

  // Handle Emergent OAuth callback (session_id in URL hash) synchronously
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/p/:slug" element={<PublicPreview />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/builder/:id"
        element={
          <ProtectedRoute>
            <Builder />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Landing />} />
    </Routes>
  );
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
          <Toaster
            richColors
            theme="dark"
            position="bottom-right"
            toastOptions={{ style: { fontFamily: "Manrope, sans-serif" } }}
          />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
