import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { googleLogin } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, Mail, KeyRound, User as UserIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Login = () => {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Email and password required");
      return;
    }
    setBusy(true);
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const body = mode === "login" ? { email, password } : { email, password, name };
      const res = await api.post(path, body);
      // Persist JWT in localStorage; interceptor will send it
      localStorage.setItem("kn_token", res.data.token);
      setUser(res.data.user);
      toast.success(mode === "login" ? "Welcome back!" : "Account created!");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden">
      <div className="orb bg-blue-500" style={{ width: 400, height: 400, top: -100, left: -100 }} />
      <div className="orb bg-purple-600" style={{ width: 400, height: 400, bottom: -100, right: -100 }} />
      <div className="grid-bg absolute inset-0 opacity-40" />

      <div className="relative w-full max-w-md">
        <a href="/" className="flex items-center gap-2 justify-center mb-8">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-600/30">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Knowledge-Nexus <span className="gradient-text">AI</span></span>
        </a>

        <div className="glass rounded-2xl p-8">
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList className="w-full grid grid-cols-2 mb-6">
              <TabsTrigger value="login" data-testid="tab-login">Log in</TabsTrigger>
              <TabsTrigger value="register" data-testid="tab-register">Sign up</TabsTrigger>
            </TabsList>

            <Button
              data-testid="google-login-btn"
              onClick={googleLogin}
              variant="outline"
              className="w-full rounded-full mb-5"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.9 2.3 30.3 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.8 6C12.3 13.1 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.6c-.5 2.9-2.2 5.3-4.7 6.9l7.3 5.7c4.3-3.9 6.8-9.7 6.8-16.9z"/><path fill="#FBBC05" d="M10.3 28.7c-.5-1.5-.8-3.1-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.7 0 20.3 0 24s1 7.3 2.5 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.3-5.7c-2 1.3-4.6 2.1-8.5 2.1-6.3 0-11.7-3.6-13.7-9.6l-7.8 6C6.4 42.6 14.6 48 24 48z"/></svg>
              Continue with Google
            </Button>

            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            <form onSubmit={submit} className="space-y-4">
              <TabsContent value="register" className="mt-0 space-y-4">
                <div>
                  <Label className="text-xs">Name</Label>
                  <div className="relative mt-1">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      data-testid="signup-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Doe"
                      className="pl-9"
                    />
                  </div>
                </div>
              </TabsContent>

              <div>
                <Label className="text-xs">Email</Label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    data-testid="email-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="pl-9"
                    required
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Password</Label>
                <div className="relative mt-1">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    data-testid="password-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="pl-9"
                    required
                    minLength={8}
                  />
                </div>
              </div>

              <Button
                data-testid="submit-auth-btn"
                type="submit"
                disabled={busy}
                className="w-full rounded-full bg-gradient-to-r from-blue-600 to-purple-600 hover:shadow-[0_0_25px_rgba(139,92,246,0.4)] text-white"
              >
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {mode === "login" ? "Log in" : "Create account"}
              </Button>
            </form>
          </Tabs>
        </div>
        <div className="text-center text-xs text-muted-foreground mt-4">
          By continuing you agree to the Terms & Privacy.
        </div>
      </div>
    </div>
  );
};
