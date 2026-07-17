import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, ImageIcon, Download, Trash2, Sparkles, AlertTriangle, RefreshCcw } from "lucide-react";
import { motion } from "framer-motion";

const SUGGESTIONS = [
  "a cyberpunk city at night, neon reflections on wet streets",
  "isometric 3D icon of a rocket launching, pastel colors",
  "watercolor mountain landscape at golden hour",
  "minimalist logo of a fox reading a book",
  "vintage travel poster of Tokyo in the 1960s",
];

export const Images = () => {
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    try {
      const r = await api.get("/images");
      setImages(r.data);
    } catch {
      toast.error("Failed to load images");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      // Poll while any image is generating
      setImages((prev) => {
        if (prev.some((im) => im.status === "generating")) {
          api.get("/images").then((r) => setImages(r.data)).catch(() => {});
        }
        return prev;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const generate = async () => {
    if (!prompt.trim()) {
      toast.error("Enter a prompt");
      return;
    }
    setGenerating(true);
    try {
      await api.post("/images/generate", { prompt });
      setPrompt("");
      toast.info("Generating…");
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally {
      setGenerating(false);
    }
  };

  const downloadImage = async (img) => {
    try {
      const r = await api.get(`/images/${img.image_id}`);
      const b64 = r.data.data_b64;
      const mime = r.data.mime_type || "image/png";
      const link = document.createElement("a");
      link.href = `data:${mime};base64,${b64}`;
      link.download = `image-${img.image_id}.png`;
      link.click();
      toast.success("Downloaded");
    } catch {
      toast.error("Download failed");
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this image?")) return;
    try {
      await api.delete(`/images/${id}`);
      setImages(images.filter((i) => i.image_id !== id));
      toast.success("Deleted");
    } catch {
      toast.error("Failed");
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="max-w-7xl mx-auto pt-24 px-6 pb-16">
        <div className="mb-8">
          <div className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground mb-2">
            AI Images
          </div>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
            Generate <span className="gradient-text">any image</span> from text
          </h1>
        </div>

        <Card className="glass p-5 mb-8" data-testid="image-generator-card">
          <div className="flex flex-col gap-3">
            <Textarea
              data-testid="image-prompt-input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A retro-futuristic library on a floating island…"
              className="min-h-[90px] resize-none"
            />
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  data-testid={`image-suggestion-${i}`}
                  onClick={() => setPrompt(s)}
                  className="text-xs px-3 py-1.5 rounded-full border border-white/10 hover:border-purple-500/50 hover:bg-purple-500/10 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <Button
                data-testid="generate-image-btn"
                onClick={generate}
                disabled={generating}
                className="rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" /> Generate
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
          </div>
        ) : images.length === 0 ? (
          <div className="glass rounded-2xl p-16 text-center" data-testid="empty-images">
            <ImageIcon className="w-10 h-10 text-purple-400 mx-auto mb-3" />
            <div className="font-medium mb-1">No images yet</div>
            <div className="text-sm text-muted-foreground">Describe what you want above.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {images.map((im, i) => (
              <motion.div
                key={im.image_id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
              >
                <ImageCard image={im} onDownload={() => downloadImage(im)} onDelete={() => remove(im.image_id)} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const ImageCard = ({ image, onDownload, onDelete }) => {
  const [thumb, setThumb] = useState(null);
  const [loadingThumb, setLoadingThumb] = useState(false);

  useEffect(() => {
    if (image.status !== "ready" || thumb) return;
    setLoadingThumb(true);
    api.get(`/images/${image.image_id}`)
      .then((r) => setThumb(`data:${r.data.mime_type || "image/png"};base64,${r.data.data_b64}`))
      .catch(() => {})
      .finally(() => setLoadingThumb(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image.status, image.image_id]);

  return (
    <div
      className="glass rounded-2xl overflow-hidden group"
      data-testid={`image-card-${image.image_id}`}
    >
      <div className="aspect-square bg-zinc-950/50 relative flex items-center justify-center overflow-hidden">
        {image.status === "generating" || loadingThumb ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
            <div className="text-xs">Generating…</div>
          </div>
        ) : image.status === "failed" ? (
          <div className="flex flex-col items-center gap-2 text-center px-4">
            <AlertTriangle className="w-6 h-6 text-red-400" />
            <div className="text-xs text-muted-foreground line-clamp-3">{image.error || "Failed"}</div>
          </div>
        ) : thumb ? (
          <img src={thumb} alt={image.prompt} className="w-full h-full object-cover" />
        ) : null}
      </div>
      <div className="p-3 space-y-2">
        <div className="text-xs text-muted-foreground line-clamp-2">{image.prompt}</div>
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {new Date(image.created_at).toLocaleDateString()}
          </div>
          <div className="flex gap-1">
            {image.status === "ready" && (
              <button
                data-testid={`download-image-${image.image_id}`}
                onClick={onDownload}
                className="p-1.5 rounded-md hover:bg-white/5 transition-colors"
                title="Download"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              data-testid={`delete-image-${image.image_id}`}
              onClick={onDelete}
              className="p-1.5 rounded-md hover:bg-white/5 text-muted-foreground hover:text-red-400 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
