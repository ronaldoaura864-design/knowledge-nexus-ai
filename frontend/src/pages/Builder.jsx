import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  Download,
  Loader2,
  RefreshCcw,
  Monitor,
  Smartphone,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const buildFullHtml = (p) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${p.name || "Preview"}</title>
<style>${p.css || ""}</style>
</head>
<body>
${p.html || ""}
<script>${p.js || ""}<\/script>
</body>
</html>`;

export const Builder = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [viewport, setViewport] = useState("desktop");
  const pollRef = useRef(null);
  const toastedRef = useRef(false);

  const fetchProject = async () => {
    const res = await api.get(`/projects/${id}`);
    return res.data;
  };

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const p = await fetchProject();
        setProject(p);
        if (p.status === "ready") {
          clearInterval(pollRef.current);
          pollRef.current = null;
          if (!toastedRef.current) {
            toast.success("Website ready!");
            toastedRef.current = true;
          }
        } else if (p.status === "failed") {
          clearInterval(pollRef.current);
          pollRef.current = null;
          toast.error(p.error || "Generation failed");
        }
      } catch {
        /* keep polling */
      }
    }, 2500);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const p = await fetchProject();
        if (!mounted) return;
        setProject(p);
        setPrompt(p.prompt);
        if (p.status === "generating") startPolling();
      } catch {
        toast.error("Project not found");
        navigate("/dashboard");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fullHtml = useMemo(() => (project ? buildFullHtml(project) : ""), [project]);
  const isGenerating = project?.status === "generating";
  const hasFailed = project?.status === "failed";

  const handleRegenerate = async () => {
    if (!prompt.trim()) return;
    setRegenerating(true);
    toastedRef.current = false;
    toast.info("Regenerating…");
    try {
      await api.post("/projects/generate", { prompt, project_id: id });
      const p = await fetchProject();
      setProject(p);
      startPolling();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally {
      setRegenerating(false);
    }
  };

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed");
    }
  };

  const download = (content, filename, mime = "text/plain") => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="pt-24 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
        </div>
      </div>
    );
  }
  if (!project) return null;

  const previewWidth = viewport === "mobile" ? 390 : "100%";

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="pt-20 px-4 pb-6">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <Link
                to="/dashboard"
                data-testid="back-to-dashboard"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="min-w-0">
                <div className="text-lg font-medium truncate flex items-center gap-2" data-testid="project-name">
                  {project.name}
                  {isGenerating && <Loader2 className="w-4 h-4 animate-spin text-purple-500" />}
                </div>
                <div className="text-xs text-muted-foreground truncate max-w-lg">
                  {project.prompt}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center rounded-full border border-white/10 p-0.5">
                <button
                  data-testid="viewport-desktop"
                  onClick={() => setViewport("desktop")}
                  className={`p-1.5 rounded-full transition-colors ${viewport === "desktop" ? "bg-white/10" : ""}`}
                >
                  <Monitor className="w-4 h-4" />
                </button>
                <button
                  data-testid="viewport-mobile"
                  onClick={() => setViewport("mobile")}
                  className={`p-1.5 rounded-full transition-colors ${viewport === "mobile" ? "bg-white/10" : ""}`}
                >
                  <Smartphone className="w-4 h-4" />
                </button>
              </div>
              <Button
                data-testid="download-html-btn"
                variant="outline"
                disabled={isGenerating || !project.html}
                onClick={() => download(fullHtml, `${project.name.replace(/\s+/g, "-")}.html`, "text/html")}
                className="rounded-full"
              >
                <Download className="w-4 h-4 mr-2" /> Download
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
            {/* Left: prompt + code */}
            <div className="glass rounded-2xl p-4 flex flex-col gap-3 h-fit lg:h-[calc(100vh-140px)] lg:sticky lg:top-24">
              <div className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                Prompt
              </div>
              <Textarea
                data-testid="builder-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[100px] font-mono text-xs resize-none"
              />
              <Button
                data-testid="regenerate-btn"
                onClick={handleRegenerate}
                disabled={regenerating || isGenerating}
                className="rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white"
              >
                {regenerating || isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <RefreshCcw className="w-4 h-4 mr-2" /> Regenerate
                  </>
                )}
              </Button>

              <Tabs defaultValue="html" className="flex-1 min-h-0 flex flex-col">
                <TabsList className="w-full">
                  <TabsTrigger value="html" data-testid="tab-html" className="flex-1">HTML</TabsTrigger>
                  <TabsTrigger value="css" data-testid="tab-css" className="flex-1">CSS</TabsTrigger>
                  <TabsTrigger value="js" data-testid="tab-js" className="flex-1">JS</TabsTrigger>
                </TabsList>
                {[
                  { v: "html", c: project.html, ext: "html", mime: "text/html", label: "HTML" },
                  { v: "css", c: project.css, ext: "css", mime: "text/css", label: "CSS" },
                  { v: "js", c: project.js, ext: "js", mime: "text/javascript", label: "JS" },
                ].map((t) => (
                  <TabsContent key={t.v} value={t.v} className="flex-1 min-h-0 flex flex-col mt-3">
                    <div className="flex items-center justify-end gap-2 mb-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        data-testid={`copy-${t.v}`}
                        disabled={!t.c}
                        onClick={() => copy(t.c, t.label)}
                      >
                        <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        data-testid={`download-${t.v}`}
                        disabled={!t.c}
                        onClick={() => download(t.c, `site.${t.ext}`, t.mime)}
                      >
                        <Download className="w-3.5 h-3.5 mr-1.5" /> .{t.ext}
                      </Button>
                    </div>
                    <pre className="text-[11px] font-mono bg-zinc-950/60 dark:bg-zinc-950/80 rounded-lg p-3 overflow-auto flex-1 border border-white/10 whitespace-pre-wrap break-words max-h-[40vh] lg:max-h-none">
                      {t.c || (isGenerating ? "Generating…" : "")}
                    </pre>
                  </TabsContent>
                ))}
              </Tabs>
            </div>

            {/* Right: preview */}
            <div className="glass rounded-2xl p-4">
              <div className="flex items-center gap-1.5 mb-3 px-2">
                <div className="w-3 h-3 rounded-full bg-red-500/70" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                <div className="w-3 h-3 rounded-full bg-green-500/70" />
                <div className="ml-4 text-xs text-muted-foreground font-mono truncate">
                  preview · {project.name}
                </div>
              </div>

              {isGenerating ? (
                <div
                  data-testid="preview-loading"
                  className="rounded-xl border border-white/10 flex flex-col items-center justify-center gap-4 h-[calc(100vh-220px)] relative overflow-hidden"
                >
                  <div className="orb bg-purple-600" style={{ width: 300, height: 300, top: -60, right: -80 }} />
                  <div className="orb bg-blue-500" style={{ width: 300, height: 300, bottom: -80, left: -60 }} />
                  <div className="relative z-10 flex flex-col items-center gap-4 text-center px-6">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center">
                      <Sparkles className="w-6 h-6 text-purple-400 animate-pulse" />
                    </div>
                    <div>
                      <div className="font-medium mb-1">AI is building your site…</div>
                      <div className="text-sm text-muted-foreground max-w-sm">
                        This usually takes 30–90 seconds. We're designing layout, writing content, and generating code.
                      </div>
                    </div>
                    <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                  </div>
                </div>
              ) : hasFailed ? (
                <div
                  data-testid="preview-failed"
                  className="rounded-xl border border-red-500/30 bg-red-500/5 flex flex-col items-center justify-center gap-3 h-[calc(100vh-220px)] p-6 text-center"
                >
                  <AlertTriangle className="w-8 h-8 text-red-400" />
                  <div className="font-medium">Generation failed</div>
                  <div className="text-sm text-muted-foreground max-w-md">
                    {project.error || "Something went wrong. Try again."}
                  </div>
                  <Button
                    data-testid="retry-btn"
                    onClick={handleRegenerate}
                    className="mt-2 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white"
                  >
                    <RefreshCcw className="w-4 h-4 mr-2" /> Retry
                  </Button>
                </div>
              ) : (
                <div className="bg-white rounded-xl overflow-hidden border border-white/10 flex justify-center">
                  <iframe
                    data-testid="preview-iframe"
                    title="Preview"
                    srcDoc={fullHtml}
                    className="w-full h-[calc(100vh-220px)] bg-white transition-all"
                    style={{ maxWidth: previewWidth }}
                    sandbox="allow-scripts allow-same-origin"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
