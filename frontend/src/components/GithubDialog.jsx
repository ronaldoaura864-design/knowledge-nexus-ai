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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Github, Loader2, ExternalLink, Lock, Unplug } from "lucide-react";

export const GithubDialog = ({ projectId, open, onOpenChange, projectName }) => {
  const [status, setStatus] = useState({ configured: false, connected: false, github_username: null });
  const [loading, setLoading] = useState(true);
  const [repos, setRepos] = useState([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [mode, setMode] = useState("new");
  const [repoName, setRepoName] = useState("");
  const [privateRepo, setPrivateRepo] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [commitMessage, setCommitMessage] = useState("Update from Knowledge-Nexus AI");
  const [pushing, setPushing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [pushResult, setPushResult] = useState(null);

  const suggestSlug = (name) =>
    (name || "site")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const r = await api.get("/github/status");
      setStatus(r.data);
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  };

  const loadRepos = async () => {
    setReposLoading(true);
    try {
      const r = await api.get("/github/repos");
      setRepos(r.data.repos || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to load repos");
    } finally {
      setReposLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setPushResult(null);
    setRepoName(suggestSlug(projectName));
    loadStatus();
  }, [open, projectName]);

  useEffect(() => {
    if (open && status.connected && mode === "existing") loadRepos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, status.connected, mode]);

  const connect = async () => {
    setConnecting(true);
    try {
      const r = await api.get(`/github/authorize`, { params: { project_id: projectId } });
      window.location.href = r.data.authorize_url;
    } catch (err) {
      toast.error(err.response?.data?.detail || "GitHub not configured on this server");
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    try {
      await api.post("/github/disconnect");
      toast.success("Disconnected from GitHub");
      loadStatus();
    } catch {
      toast.error("Failed");
    }
  };

  const push = async () => {
    const target = mode === "new" ? repoName : selectedRepo;
    if (!target) {
      toast.error("Choose or name a repository");
      return;
    }
    setPushing(true);
    setPushResult(null);
    toast.info("Pushing files to GitHub…");
    try {
      const r = await api.post(`/projects/${projectId}/github`, {
        repo_name: target.includes("/") ? target.split("/")[1] : target,
        existing: mode === "existing",
        private: privateRepo,
        commit_message: commitMessage || "Update from Knowledge-Nexus AI",
      });
      setPushResult(r.data);
      toast.success(`Pushed to ${r.data.repo}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Push failed");
    } finally {
      setPushing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="github-dialog">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Github className="w-5 h-5" /> Save to GitHub
          </DialogTitle>
          <DialogDescription>
            {status.connected
              ? `Signed in as ${status.github_username}. Push your project files as a repo.`
              : "Connect your GitHub account to push this project."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
            </div>
          ) : !status.configured ? (
            <div
              data-testid="github-not-configured"
              className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4 text-sm"
            >
              GitHub integration isn't configured on this server yet.
              Ask the admin to set <code className="text-xs">GITHUB_CLIENT_ID</code> and{" "}
              <code className="text-xs">GITHUB_CLIENT_SECRET</code>.
            </div>
          ) : !status.connected ? (
            <Button
              data-testid="github-connect-btn"
              onClick={connect}
              disabled={connecting}
              className="w-full rounded-full bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10"
            >
              {connecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Redirecting…
                </>
              ) : (
                <>
                  <Github className="w-4 h-4 mr-2" /> Connect GitHub account
                </>
              )}
            </Button>
          ) : pushResult ? (
            <div
              data-testid="github-push-success"
              className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 space-y-3"
            >
              <div className="font-medium text-green-300">Pushed successfully</div>
              <div className="text-sm text-muted-foreground break-all">{pushResult.repo}</div>
              <Button
                variant="outline"
                onClick={() => window.open(pushResult.html_url, "_blank", "noopener")}
                className="rounded-full"
                data-testid="github-open-repo-btn"
              >
                <ExternalLink className="w-4 h-4 mr-2" /> Open on GitHub
              </Button>
            </div>
          ) : (
            <>
              <Tabs value={mode} onValueChange={setMode}>
                <TabsList className="w-full">
                  <TabsTrigger value="new" data-testid="tab-new-repo" className="flex-1">
                    New repo
                  </TabsTrigger>
                  <TabsTrigger value="existing" data-testid="tab-existing-repo" className="flex-1">
                    Existing repo
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="new" className="space-y-3 mt-4">
                  <div>
                    <Label className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                      Repository name
                    </Label>
                    <Input
                      data-testid="github-repo-name"
                      value={repoName}
                      onChange={(e) => setRepoName(e.target.value)}
                      placeholder="my-awesome-site"
                      className="mt-2 font-mono text-sm"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      data-testid="github-private-checkbox"
                      type="checkbox"
                      checked={privateRepo}
                      onChange={(e) => setPrivateRepo(e.target.checked)}
                      className="rounded border-white/20 bg-transparent"
                    />
                    <Lock className="w-3.5 h-3.5" /> Make private
                  </label>
                </TabsContent>
                <TabsContent value="existing" className="space-y-3 mt-4">
                  {reposLoading ? (
                    <div className="text-sm text-muted-foreground text-center py-4">Loading repos…</div>
                  ) : repos.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-4">No repos found.</div>
                  ) : (
                    <div>
                      <Label className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                        Select repository
                      </Label>
                      <Select value={selectedRepo} onValueChange={setSelectedRepo}>
                        <SelectTrigger data-testid="github-repo-select" className="mt-2">
                          <SelectValue placeholder="Choose a repository" />
                        </SelectTrigger>
                        <SelectContent>
                          {repos.map((r) => (
                            <SelectItem key={r.full_name} value={r.full_name}>
                              {r.full_name} {r.private ? "· private" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              <div>
                <Label className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                  Commit message
                </Label>
                <Input
                  data-testid="github-commit-message"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  className="mt-2 text-sm"
                />
              </div>

              <div className="flex justify-between items-center pt-2 gap-2 flex-wrap">
                <button
                  data-testid="github-disconnect-btn"
                  onClick={disconnect}
                  className="text-xs text-muted-foreground hover:text-red-400 transition-colors flex items-center gap-1.5"
                >
                  <Unplug className="w-3.5 h-3.5" /> Disconnect
                </button>
                <Button
                  data-testid="github-push-btn"
                  onClick={push}
                  disabled={pushing}
                  className="rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white"
                >
                  {pushing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Pushing…
                    </>
                  ) : (
                    <>
                      <Github className="w-4 h-4 mr-2" /> Push to GitHub
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pushing}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
