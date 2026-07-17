import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Copy, ExternalLink, RefreshCcw, Link as LinkIcon, Loader2 } from "lucide-react";

export const ShareDialog = ({ projectId, initialShare, open, onOpenChange, onChanged }) => {
  const [enabled, setEnabled] = useState(Boolean(initialShare?.share_enabled && initialShare?.share_slug));
  const [slug, setSlug] = useState(initialShare?.share_slug || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEnabled(Boolean(initialShare?.share_enabled && initialShare?.share_slug));
    setSlug(initialShare?.share_slug || "");
  }, [initialShare]);

  const shareUrl = slug ? `${window.location.origin}/p/${slug}` : "";

  const toggleEnabled = async (next) => {
    setBusy(true);
    try {
      if (next) {
        const r = await api.post(`/projects/${projectId}/share`);
        setEnabled(true);
        setSlug(r.data.share_slug);
        onChanged?.({ share_enabled: true, share_slug: r.data.share_slug });
        toast.success("Public link enabled");
      } else {
        await api.delete(`/projects/${projectId}/share`);
        setEnabled(false);
        onChanged?.({ share_enabled: false, share_slug: slug });
        toast.success("Public link disabled");
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/projects/${projectId}/share/regenerate`);
      setSlug(r.data.share_slug);
      setEnabled(true);
      onChanged?.({ share_enabled: true, share_slug: r.data.share_slug });
      toast.success("New link generated");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="share-dialog">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <LinkIcon className="w-5 h-5 text-purple-400" /> Public share link
          </DialogTitle>
          <DialogDescription>
            Anyone with the link can preview this site — no login required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          <div className="flex items-center justify-between rounded-xl border border-white/10 p-4">
            <div>
              <div className="font-medium">Enable public link</div>
              <div className="text-xs text-muted-foreground">Turn off to make the site private again.</div>
            </div>
            <Switch
              data-testid="share-toggle"
              checked={enabled}
              onCheckedChange={toggleEnabled}
              disabled={busy}
            />
          </div>

          {enabled && slug && (
            <div className="space-y-3">
              <div className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                Your link
              </div>
              <div className="flex gap-2">
                <Input
                  data-testid="share-url-input"
                  readOnly
                  value={shareUrl}
                  className="font-mono text-xs"
                  onClick={(e) => e.target.select()}
                />
                <Button
                  data-testid="share-copy-btn"
                  variant="outline"
                  size="icon"
                  onClick={copy}
                  className="shrink-0"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  data-testid="share-open-btn"
                  variant="outline"
                  onClick={() => window.open(shareUrl, "_blank", "noopener")}
                  className="rounded-full"
                >
                  <ExternalLink className="w-4 h-4 mr-2" /> Open preview
                </Button>
                <Button
                  data-testid="share-regenerate-btn"
                  variant="outline"
                  onClick={regenerate}
                  disabled={busy}
                  className="rounded-full"
                >
                  {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
                  Regenerate
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                Regenerating creates a new URL and invalidates the old one.
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
