import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { api, API } from "@/lib/api";
import { toast } from "sonner";
import {
  Loader2,
  Send,
  Plus,
  MessageSquare,
  Trash2,
  Pencil,
  Search,
  FileText,
  Upload,
  Share2,
  Download,
  X,
  Sparkles,
  ArrowLeft,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { motion, AnimatePresence } from "framer-motion";

export const Chat = () => {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const [chats, setChats] = useState([]);
  const [q, setQ] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [chat, setChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [docs, setDocs] = useState([]);
  const [selectedDocIds, setSelectedDocIds] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const loadChats = async () => {
    setLoadingList(true);
    try {
      const r = await api.get("/chats", { params: q ? { q } : {} });
      setChats(r.data);
    } catch {
      /* silent */
    } finally {
      setLoadingList(false);
    }
  };

  const loadDocs = async () => {
    try {
      const r = await api.get("/documents");
      setDocs(r.data);
    } catch {
      /* silent */
    }
  };

  useEffect(() => {
    loadChats();
    loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(loadChats, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    if (!chatId) {
      setChat(null);
      setMessages([]);
      return;
    }
    (async () => {
      try {
        const r = await api.get(`/chats/${chatId}`);
        setChat(r.data.chat);
        setMessages(r.data.messages);
        setRenameTitle(r.data.chat.title);
      } catch {
        toast.error("Chat not found");
        navigate("/chat");
      }
    })();
  }, [chatId, navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const newChat = async () => {
    try {
      const r = await api.post("/chats", {});
      navigate(`/chat/${r.data.chat_id}`);
      loadChats();
      setSidebarOpen(false);
    } catch {
      toast.error("Failed");
    }
  };

  const send = async () => {
    if (!content.trim() || sending) return;
    let activeId = chatId;
    if (!activeId) {
      try {
        const r = await api.post("/chats", {});
        activeId = r.data.chat_id;
        navigate(`/chat/${activeId}`, { replace: true });
      } catch {
        toast.error("Failed to start chat");
        return;
      }
    }
    const text = content;
    setContent("");
    setSending(true);
    // Optimistic user message
    const tempUser = {
      message_id: `tmp_${Date.now()}`,
      role: "user",
      content: text,
      doc_ids: selectedDocIds,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, tempUser]);
    try {
      const r = await api.post(`/chats/${activeId}/messages`, {
        content: text,
        doc_ids: selectedDocIds,
      });
      setMessages((m) => [
        ...m.filter((x) => x.message_id !== tempUser.message_id),
        r.data.user_message,
        r.data.assistant_message,
      ]);
      if (r.data.title && chat && r.data.title !== chat.title) {
        setChat((c) => ({ ...c, title: r.data.title }));
        loadChats();
      }
    } catch (err) {
      setMessages((m) => m.filter((x) => x.message_id !== tempUser.message_id));
      toast.error(err.response?.data?.detail || "Send failed");
    } finally {
      setSending(false);
    }
  };

  const rename = async () => {
    try {
      await api.patch(`/chats/${chatId}`, { title: renameTitle });
      setChat((c) => ({ ...c, title: renameTitle }));
      loadChats();
      setRenameOpen(false);
      toast.success("Renamed");
    } catch {
      toast.error("Failed");
    }
  };

  const removeChat = async (id) => {
    if (!window.confirm("Delete this chat?")) return;
    try {
      await api.delete(`/chats/${id}`);
      setChats((c) => c.filter((x) => x.chat_id !== id));
      if (id === chatId) navigate("/chat");
      toast.success("Deleted");
    } catch {
      toast.error("Failed");
    }
  };

  const uploadDoc = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    try {
      toast.info(`Uploading ${file.name}…`);
      const r = await api.post("/documents/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Document uploaded");
      await loadDocs();
      setSelectedDocIds((ids) => [...ids, r.data.doc_id]);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleDoc = (id) => {
    setSelectedDocIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const removeDoc = async (id) => {
    if (!window.confirm("Delete this document?")) return;
    try {
      await api.delete(`/documents/${id}`);
      setDocs((d) => d.filter((x) => x.doc_id !== id));
      setSelectedDocIds((ids) => ids.filter((x) => x !== id));
    } catch {
      toast.error("Failed");
    }
  };

  const exportTxt = () => {
    api.get(`/chats/${chatId}/export.txt`, { responseType: "blob" }).then((r) => {
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${chat.title || "chat"}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };
  const exportPdf = () => {
    api.get(`/chats/${chatId}/export.pdf`, { responseType: "blob" }).then((r) => {
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${chat.title || "chat"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const enableShare = async () => {
    try {
      const r = await api.post(`/chats/${chatId}/share`);
      setChat((c) => ({ ...c, share_enabled: true, share_slug: r.data.share_slug }));
      toast.success("Share link enabled");
    } catch {
      toast.error("Failed");
    }
  };
  const disableShare = async () => {
    try {
      await api.delete(`/chats/${chatId}/share`);
      setChat((c) => ({ ...c, share_enabled: false }));
      toast.success("Share disabled");
    } catch {
      toast.error("Failed");
    }
  };

  const shareUrl =
    chat?.share_enabled && chat?.share_slug
      ? `${window.location.origin}/p/chat/${chat.share_slug}`
      : "";

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="pt-16 flex-1 flex overflow-hidden">
        {/* Sidebar (chat list) */}
        <aside
          data-testid="chat-sidebar"
          className={`${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } lg:translate-x-0 fixed lg:sticky top-16 left-0 z-40 h-[calc(100vh-4rem)] w-72 border-r border-white/10 bg-background/95 backdrop-blur transition-transform lg:transition-none flex flex-col`}
        >
          <div className="p-4 space-y-3">
            <Button
              data-testid="new-chat-btn"
              onClick={newChat}
              className="w-full rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white"
            >
              <Plus className="w-4 h-4 mr-2" /> New chat
            </Button>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                data-testid="chat-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search chats…"
                className="pl-9 h-9"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 space-y-1">
            {loadingList ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
              </div>
            ) : chats.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-8">No chats yet.</div>
            ) : (
              chats.map((c) => (
                <Link
                  key={c.chat_id}
                  to={`/chat/${c.chat_id}`}
                  onClick={() => setSidebarOpen(false)}
                  data-testid={`chat-item-${c.chat_id}`}
                  className={`group flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    c.chat_id === chatId
                      ? "bg-purple-500/10 border border-purple-500/30"
                      : "hover:bg-white/5"
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{c.title}</span>
                  <button
                    data-testid={`delete-chat-${c.chat_id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      removeChat(c.chat_id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </Link>
              ))
            )}
          </div>
          <div className="p-3 border-t border-white/10">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              Documents
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={uploadDoc}
              className="hidden"
              data-testid="doc-upload-input"
            />
            <Button
              data-testid="upload-doc-btn"
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-full mb-2"
            >
              <Upload className="w-3.5 h-3.5 mr-2" /> Upload PDF/DOCX/TXT
            </Button>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {docs.length === 0 ? (
                <div className="text-[11px] text-muted-foreground text-center py-2">No docs.</div>
              ) : (
                docs.map((d) => (
                  <label
                    key={d.doc_id}
                    className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-white/5 cursor-pointer"
                    data-testid={`doc-item-${d.doc_id}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDocIds.includes(d.doc_id)}
                      onChange={() => toggleDoc(d.doc_id)}
                      className="shrink-0"
                    />
                    <FileText className="w-3 h-3 shrink-0 text-purple-400" />
                    <span className="flex-1 truncate">{d.name}</span>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        removeDoc(d.doc_id);
                      }}
                      className="opacity-60 hover:opacity-100 hover:text-red-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </label>
                ))
              )}
            </div>
          </div>
        </aside>

        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 top-16 bg-black/40 backdrop-blur-sm z-30 lg:hidden"
          />
        )}

        {/* Main pane */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b border-white/10 px-4 py-3 flex items-center gap-3 min-h-[52px]">
            <button
              data-testid="toggle-sidebar"
              onClick={() => setSidebarOpen((v) => !v)}
              className="lg:hidden p-2 rounded-lg hover:bg-white/5"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
            {chat ? (
              <>
                <div className="flex-1 min-w-0 truncate font-medium" data-testid="chat-title">
                  {chat.title}
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    data-testid="rename-chat-btn"
                    onClick={() => setRenameOpen(true)}
                    className="p-2 rounded-lg hover:bg-white/5"
                    title="Rename"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    data-testid="share-chat-btn"
                    onClick={() => setShareOpen(true)}
                    className="p-2 rounded-lg hover:bg-white/5"
                    title="Share"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    data-testid="export-txt-btn"
                    onClick={exportTxt}
                    className="p-2 rounded-lg hover:bg-white/5 text-xs"
                    title="Export .txt"
                  >
                    .txt
                  </button>
                  <button
                    data-testid="export-pdf-btn"
                    onClick={exportPdf}
                    className="p-2 rounded-lg hover:bg-white/5 text-xs"
                    title="Export .pdf"
                  >
                    .pdf
                  </button>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Start a new conversation</div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-6" data-testid="messages-scroll">
            <div className="max-w-3xl mx-auto space-y-6">
              {!chat && messages.length === 0 && (
                <div className="text-center py-20">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="w-6 h-6 text-purple-400" />
                  </div>
                  <h2 className="text-2xl font-semibold mb-2">How can I help you today?</h2>
                  <p className="text-sm text-muted-foreground">
                    Ask anything, or attach a PDF / DOCX / TXT to chat with your docs.
                  </p>
                </div>
              )}
              <AnimatePresence>
                {messages.map((m) => (
                  <motion.div
                    key={m.message_id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    data-testid={`msg-${m.role}`}
                    className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}
                  >
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
                  </motion.div>
                ))}
              </AnimatePresence>
              {sending && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-white animate-pulse" />
                  </div>
                  <div className="glass rounded-2xl px-4 py-3">
                    <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="border-t border-white/10 p-4">
            <div className="max-w-3xl mx-auto">
              {selectedDocIds.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {selectedDocIds.map((id) => {
                    const d = docs.find((x) => x.doc_id === id);
                    if (!d) return null;
                    return (
                      <div
                        key={id}
                        className="text-xs px-2 py-1 rounded-full glass flex items-center gap-1.5"
                      >
                        <FileText className="w-3 h-3 text-purple-400" />
                        {d.name}
                        <button onClick={() => toggleDoc(id)}>
                          <X className="w-3 h-3 opacity-60 hover:opacity-100" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="glass rounded-2xl p-2 flex items-end gap-2">
                <Textarea
                  data-testid="message-input"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Message Knowledge-Nexus AI…"
                  className="flex-1 min-h-[44px] max-h-40 resize-none border-0 focus-visible:ring-0 bg-transparent"
                />
                <Button
                  data-testid="send-message-btn"
                  onClick={send}
                  disabled={sending || !content.trim()}
                  size="icon"
                  className="rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white shrink-0"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
              <div className="text-[11px] text-muted-foreground text-center mt-2">
                AI responses may be inaccurate. Powered by GPT-5.2.
              </div>
            </div>
          </div>
        </main>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent data-testid="rename-dialog">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <Input
            data-testid="rename-input"
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            className="mt-2"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button
              data-testid="save-rename-btn"
              onClick={rename}
              className="rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent data-testid="chat-share-dialog">
          <DialogHeader>
            <DialogTitle>Share this chat</DialogTitle>
            <DialogDescription>Anyone with the link can read the conversation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between rounded-xl border border-white/10 p-4">
              <div>
                <div className="font-medium">Public link</div>
                <div className="text-xs text-muted-foreground">
                  Anyone with the link can read the conversation.
                </div>
              </div>
              <Switch
                data-testid="chat-share-toggle"
                checked={Boolean(chat?.share_enabled)}
                onCheckedChange={(v) => (v ? enableShare() : disableShare())}
              />
            </div>
            {shareUrl && (
              <div className="flex gap-2">
                <Input readOnly value={shareUrl} className="font-mono text-xs" data-testid="chat-share-url" />
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl);
                    toast.success("Copied");
                  }}
                  data-testid="chat-share-copy"
                >
                  Copy
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
