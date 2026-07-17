import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Plus,
  Sparkles,
  Loader2,
  Trash2,
  ExternalLink,
  ClipboardList,
  Wand2,
  User as UserIcon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const SUGGESTIONS = [
  "Create a modern restaurant website with menu and reservations",
  "Build a portfolio for a freelance photographer",
  "Landing page for a SaaS analytics tool",
  "A modern dental clinic website",
  "Yoga studio site with class schedule",
];

export const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState("projects");

  const load = async () => {
    try {
      const res = await api.get("/projects");
      setProjects(res.data);
    } catch {
      toast.error("Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Please describe your website first");
      return;
    }
    setGenerating(true);
    toast.info("AI is designing your website…");
    try {
      const res = await api.post("/projects/generate", { prompt });
      setOpen(false);
      setPrompt("");
      navigate(`/builder/${res.data.project_id}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Delete this project?")) return;
    try {
      await api.delete(`/projects/${id}`);
      setProjects(projects.filter((p) => p.project_id !== id));
      toast.success("Project deleted");
    } catch {
      toast.error("Delete failed");
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="max-w-7xl mx-auto pt-24 px-6 pb-16">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-10 gap-4">
          <div>
            <div className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground mb-2">
              Dashboard
            </div>
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
              Welcome back, <span className="gradient-text">{user?.name?.split(" ")[0]}</span>
            </h1>
          </div>
          <Button
            data-testid="new-project-btn"
            onClick={() => setOpen(true)}
            className="rounded-full bg-gradient-to-r from-blue-600 to-purple-600 hover:shadow-[0_0_25px_rgba(139,92,246,0.4)] text-white h-11 px-5"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-8" data-testid="dashboard-tabs">
            <TabsTrigger value="projects" data-testid="tab-projects">
              <ClipboardList className="w-4 h-4 mr-2" /> My Projects
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">
              History
            </TabsTrigger>
            <TabsTrigger value="profile" data-testid="tab-profile">
              <UserIcon className="w-4 h-4 mr-2" /> Profile
            </TabsTrigger>
          </TabsList>

          <TabsContent value="projects">
            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
              </div>
            ) : projects.length === 0 ? (
              <EmptyState onNew={() => setOpen(true)} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((p, i) => (
                  <motion.div
                    key={p.project_id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <Link
                      to={`/builder/${p.project_id}`}
                      data-testid={`project-card-${p.project_id}`}
                    >
                      <Card className="group glass hover:border-purple-500/30 transition-all p-5 h-full cursor-pointer">
                        <div className="flex items-start justify-between mb-4">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-purple-400" />
                          </div>
                          <button
                            data-testid={`delete-project-${p.project_id}`}
                            onClick={(e) => handleDelete(p.project_id, e)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="font-medium text-lg mb-1 line-clamp-1">{p.name}</div>
                        <div className="text-sm text-muted-foreground line-clamp-2 mb-4">
                          {p.description || p.prompt}
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{new Date(p.created_at).toLocaleDateString()}</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </div>
                      </Card>
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history">
            <Card className="glass p-6">
              <div className="text-sm text-muted-foreground mb-4">
                Recent generations ({projects.length} total)
              </div>
              {projects.length === 0 ? (
                <div className="text-muted-foreground text-sm py-8 text-center">
                  No history yet. Create your first project.
                </div>
              ) : (
                <div className="space-y-2">
                  {projects.slice(0, 20).map((p) => (
                    <Link
                      key={p.project_id}
                      to={`/builder/${p.project_id}`}
                      data-testid={`history-item-${p.project_id}`}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{p.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{p.prompt}</div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0 ml-4">
                        {new Date(p.created_at).toLocaleDateString()}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="profile">
            <Card className="glass p-8 max-w-xl" data-testid="profile-card">
              <div className="flex items-center gap-4 mb-6">
                {user?.picture && (
                  <img
                    src={user.picture}
                    alt={user.name}
                    className="w-16 h-16 rounded-full border border-white/10"
                  />
                )}
                <div>
                  <div className="text-xl font-medium">{user?.name}</div>
                  <div className="text-sm text-muted-foreground">{user?.email}</div>
                </div>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-muted-foreground">Total projects</span>
                  <span>{projects.length}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="gradient-text font-medium">Free</span>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* New project dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" data-testid="new-project-dialog">
          <DialogHeader>
            <DialogTitle className="text-2xl">Describe your website</DialogTitle>
            <DialogDescription>
              Be as specific or as vague as you like — the AI will handle the rest.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Textarea
              data-testid="prompt-input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Create a modern restaurant website with menu and reservations..."
              className="min-h-[120px] font-mono text-sm resize-none"
            />
            <div className="space-y-2">
              <div className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                Suggestions
              </div>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    data-testid={`suggestion-${i}`}
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
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={generating}>
              Cancel
            </Button>
            <Button
              data-testid="generate-btn"
              onClick={handleGenerate}
              disabled={generating}
              className="rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-2" />
                  Generate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const EmptyState = ({ onNew }) => (
  <div className="glass rounded-2xl p-16 text-center" data-testid="empty-projects">
    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center mx-auto mb-5">
      <Sparkles className="w-7 h-7 text-purple-400" />
    </div>
    <h3 className="text-xl font-medium mb-2">Nothing here yet</h3>
    <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
      Your generated websites will appear here. Create your first one in under a minute.
    </p>
    <Button
      data-testid="empty-new-project-btn"
      onClick={onNew}
      className="rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white"
    >
      <Plus className="w-4 h-4 mr-2" />
      Create your first project
    </Button>
  </div>
);
