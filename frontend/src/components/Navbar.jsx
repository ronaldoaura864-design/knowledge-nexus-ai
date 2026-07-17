import { Link, useNavigate } from "react-router-dom";
import { Sparkles, LogOut, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/AuthContext";
import { ThemeToggle } from "@/components/ThemeToggle";

const googleLogin = () => {
  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  const redirectUrl = window.location.origin + "/dashboard";
  window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
};

export const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header
      data-testid="site-navbar"
      className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/10"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 h-16">
        <Link to="/" data-testid="brand-link" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-600/30">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Knowledge-Nexus <span className="gradient-text">AI</span></span>
        </Link>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <>
              <Button
                data-testid="nav-dashboard-btn"
                variant="ghost"
                onClick={() => navigate("/dashboard")}
                className="rounded-full hidden sm:inline-flex"
              >
                <LayoutDashboard className="w-4 h-4 mr-2" />
                Dashboard
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button data-testid="user-menu-trigger" className="rounded-full outline-none focus:ring-2 focus:ring-purple-500/50">
                    <Avatar className="w-9 h-9 border border-white/10">
                      <AvatarImage src={user.picture} alt={user.name} />
                      <AvatarFallback>{user.name?.[0] || "U"}</AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="font-medium">{user.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem data-testid="menu-dashboard" onClick={() => navigate("/dashboard")}>
                    <LayoutDashboard className="w-4 h-4 mr-2" /> Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuItem data-testid="menu-logout" onClick={logout}>
                    <LogOut className="w-4 h-4 mr-2" /> Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button
              data-testid="nav-login-btn"
              onClick={googleLogin}
              className="rounded-full bg-gradient-to-r from-blue-600 to-purple-600 hover:shadow-[0_0_25px_rgba(139,92,246,0.4)] text-white px-5"
            >
              Sign in with Google
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};

export { googleLogin };
