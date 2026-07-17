import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { API } from "@/lib/api";
import { Sparkles, Loader2 } from "lucide-react";

export const PublicChat = () => {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${API}/public/chats/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true));
  }, [slug]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-4xl">🔒</div>
        <h1 className="text-2xl font-semibold">Link unavailable</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          This chat has been made private or does not exist.
        </p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="glass border-b border-white/10 px-4 py-3 flex items-center justify-between text-sm sticky top-0 z-10">
        <a href="/" className="flex items-center gap-2 hover:opacity-80">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="w-3 h-3 text-white" />
          </div>
          <span className="font-medium truncate max-w-xs" data-testid="public-chat-title">
            {data.chat.title}
          </span>
        </a>
        <span className="text-xs text-muted-foreground">Knowledge-Nexus AI</span>
      </div>
      <div className="max-w-3xl mx-auto py-8 px-4 space-y-6" data-testid="public-chat-messages">
        {data.messages.map((m) => (
          <div key={m.message_id} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role !== "user" && (
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
            )}
            <div
              className={`rounded-2xl px-4 py-3 max-w-[85%] whitespace-pre-wrap break-words text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-gradient-to-br from-blue-600 to-purple-600 text-white"
                  : "glass"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {data.messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-16">This chat has no messages yet.</div>
        )}
      </div>
    </div>
  );
};
