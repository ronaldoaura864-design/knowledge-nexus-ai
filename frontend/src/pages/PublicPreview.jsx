import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { API } from "@/lib/api";
import { Sparkles, ExternalLink } from "lucide-react";

export const PublicPreview = () => {
  const { slug } = useParams();
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${API}/public/sites/${slug}/meta`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setMeta)
      .catch(() => setError(true));
    document.documentElement.classList.add("dark");
  }, [slug]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-4xl">🔒</div>
        <h1 className="text-2xl font-semibold">Link unavailable</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          This share link has been disabled by its owner, or it doesn't exist.
        </p>
        <a
          href="/"
          className="mt-4 text-xs px-4 py-2 rounded-full border border-white/10 hover:border-purple-500/50 transition-colors"
        >
          Go to Knowledge-Nexus AI
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Slim public preview bar */}
      <div
        data-testid="public-preview-bar"
        className="glass border-b border-white/10 px-4 py-2 flex items-center justify-between text-xs"
      >
        <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="w-3 h-3 text-white" />
          </div>
          <span className="font-medium">
            {meta?.name || "Preview"} · <span className="text-muted-foreground">Knowledge-Nexus AI</span>
          </span>
        </a>
        <a
          href={`${API}/public/sites/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          data-testid="public-open-standalone"
        >
          Open standalone <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <iframe
        data-testid="public-preview-iframe"
        title={meta?.name || "Preview"}
        src={`${API}/public/sites/${slug}`}
        className="flex-1 w-full bg-white"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  );
};
