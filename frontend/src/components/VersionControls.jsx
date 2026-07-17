import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Undo2, Redo2, History, GitCompare, Check, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

const formatTime = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
};

export const VersionControls = ({
  projectId,
  currentVersionId,
  onReverted,
  onCompareToggle,
  compareVersionId,
  refreshKey,
  disabled,
}) => {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reverting, setReverting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/projects/${projectId}/versions`);
      setVersions(res.data.versions || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, refreshKey]);

  const currentIdx = versions.findIndex((v) => v.version_id === currentVersionId);
  const canUndo = !disabled && currentIdx > 0;
  const canRedo = !disabled && currentIdx >= 0 && currentIdx < versions.length - 1;

  const revertTo = async (versionId) => {
    setReverting(true);
    try {
      const res = await api.post(`/projects/${projectId}/revert`, { version_id: versionId });
      onReverted?.(res.data);
      toast.success("Reverted");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Revert failed");
    } finally {
      setReverting(false);
    }
  };

  const undo = () => canUndo && revertTo(versions[currentIdx - 1].version_id);
  const redo = () => canRedo && revertTo(versions[currentIdx + 1].version_id);

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          data-testid="undo-btn"
          variant="outline"
          size="icon"
          className="rounded-full w-9 h-9"
          disabled={!canUndo || reverting}
          onClick={undo}
          title="Undo"
        >
          {reverting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
        </Button>
        <Button
          data-testid="redo-btn"
          variant="outline"
          size="icon"
          className="rounded-full w-9 h-9"
          disabled={!canRedo || reverting}
          onClick={redo}
          title="Redo"
        >
          <Redo2 className="w-4 h-4" />
        </Button>
        <Button
          data-testid="compare-toggle-btn"
          variant={compareVersionId ? "default" : "outline"}
          size="icon"
          className={`rounded-full w-9 h-9 ${compareVersionId ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white" : ""}`}
          onClick={() => onCompareToggle?.(compareVersionId ? null : versions[currentIdx - 1]?.version_id || versions[0]?.version_id)}
          disabled={disabled || versions.length < 2}
          title="Before / After"
        >
          <GitCompare className="w-4 h-4" />
        </Button>
        <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
          <SheetTrigger asChild>
            <Button
              data-testid="history-btn"
              variant="outline"
              size="icon"
              className="rounded-full w-9 h-9"
              title="History"
            >
              <History className="w-4 h-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" data-testid="history-panel">
            <SheetHeader>
              <SheetTitle>Version history</SheetTitle>
              <SheetDescription>Every AI generation and edit is saved.</SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-2">
              {loading && (
                <div className="text-sm text-muted-foreground text-center py-8">Loading…</div>
              )}
              {!loading && versions.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-8">No versions yet.</div>
              )}
              {[...versions].reverse().map((v, i) => {
                const isCurrent = v.version_id === currentVersionId;
                return (
                  <div
                    key={v.version_id}
                    data-testid={`version-item-${v.version_id}`}
                    className={`rounded-xl border p-4 transition-colors ${
                      isCurrent ? "border-purple-500/50 bg-purple-500/5" : "border-white/10 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                          <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                            {v.action}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              current
                            </span>
                          )}
                        </div>
                        <div className="text-sm line-clamp-2">{v.prompt || v.name}</div>
                        <div className="text-xs text-muted-foreground mt-1">{formatTime(v.created_at)}</div>
                      </div>
                      {!isCurrent && (
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid={`revert-btn-${v.version_id}`}
                          onClick={() => revertTo(v.version_id)}
                          disabled={reverting}
                          className="rounded-full shrink-0"
                        >
                          <Check className="w-3.5 h-3.5 mr-1.5" /> Use
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
};
