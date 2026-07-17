import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Wand2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const EDIT_SUGGESTIONS = [
  "Change the color scheme to dark mode",
  "Make the design more modern",
  "Add smooth animations",
  "Add a pricing section",
  "Add a testimonials section",
  "Improve the hero section",
  "Change fonts to a serif style",
  "Improve spacing and responsiveness",
  "Add a contact form",
  "Add an FAQ section",
  "Optimize for SEO",
];

export const EditWithAIDialog = ({ projectId, open, onOpenChange, onEditStarted }) => {
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!prompt.trim()) {
      toast.error("Describe the change you want");
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/projects/${projectId}/edit`, { prompt });
      toast.info("AI is editing your website…");
      onOpenChange(false);
      setPrompt("");
      onEditStarted?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Edit failed to start");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="edit-ai-dialog">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" /> Edit with AI
          </DialogTitle>
          <DialogDescription>
            Describe the change. Your existing content is preserved unless you ask to change it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <Textarea
            data-testid="edit-prompt-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., Add a pricing section with three tiers..."
            className="min-h-[110px] font-mono text-sm resize-none"
          />
          <div className="space-y-2">
            <div className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground">
              Suggestions
            </div>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {EDIT_SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  data-testid={`edit-suggestion-${i}`}
                  onClick={() => setPrompt(s)}
                  className="text-xs px-3 py-1.5 rounded-full border border-white/10 hover:border-purple-500/50 hover:bg-purple-500/10 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            data-testid="apply-edit-btn"
            onClick={submit}
            disabled={submitting}
            className="rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting…
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 mr-2" /> Apply Edit
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
