import { Sparkles } from "lucide-react";

export const Footer = () => (
  <footer data-testid="site-footer" className="border-t border-white/10 mt-24">
    <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
      <div className="md:col-span-2">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-lg">Knowledge-Nexus <span className="gradient-text">AI</span></span>
        </div>
        <p className="text-sm text-muted-foreground max-w-md">
          Turn any idea into a fully-designed, responsive website in seconds using AI.
        </p>
      </div>
      <div>
        <div className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground mb-3">Product</div>
        <ul className="space-y-2 text-sm">
          <li><a href="#features" className="hover:text-primary transition-colors">Features</a></li>
          <li><a href="#how" className="hover:text-primary transition-colors">How it works</a></li>
        </ul>
      </div>
      <div>
        <div className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground mb-3">Company</div>
        <ul className="space-y-2 text-sm">
          <li><span className="text-muted-foreground">© {new Date().getFullYear()} Knowledge-Nexus AI</span></li>
        </ul>
      </div>
    </div>
  </footer>
);
