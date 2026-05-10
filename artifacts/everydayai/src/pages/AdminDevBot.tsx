import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot, Send, Trash2, FileCode, Search, X, ChevronRight,
  Loader2, GitBranch, Eye,
} from "lucide-react";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
  autoDetectedFiles?: string[];
}

interface RepoFile {
  path: string;
  type: string;
  size?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

function getFileName(path: string): string {
  return path.split("/").pop() ?? path;
}

function getFileExt(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

function getFileDir(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}

function extColor(ext: string): string {
  const colors: Record<string, string> = {
    ts: "#3b82f6", tsx: "#06b6d4", js: "#f59e0b", jsx: "#f97316",
    json: "#10b981", md: "#8b5cf6", css: "#ec4899",
    yaml: "#f59e0b", yml: "#f59e0b", sh: "#22c55e", toml: "#ef4444",
  };
  return colors[ext] ?? "rgba(255,255,255,0.35)";
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
      `<pre style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);border-radius:8px;padding:12px 14px;overflow-x:auto;margin:10px 0;font-size:12.5px;line-height:1.6;font-family:monospace;"><code>${code.trim()}</code></pre>`
    )
    .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-size:0.9em;font-family:monospace;">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^#{3}\s(.+)$/gm, '<h3 style="font-size:14px;font-weight:700;color:#fff;margin:14px 0 4px;">$1</h3>')
    .replace(/^#{2}\s(.+)$/gm, '<h2 style="font-size:15px;font-weight:700;color:#fff;margin:16px 0 6px;">$1</h2>')
    .replace(/^#{1}\s(.+)$/gm, '<h1 style="font-size:17px;font-weight:700;color:#fff;margin:18px 0 8px;">$1</h1>')
    .replace(/^[-*]\s(.+)$/gm, '<li style="margin:3px 0;padding-left:4px;">$1</li>')
    .replace(/(<li[\s\S]*?<\/li>)/g, '<ul style="padding-left:18px;margin:6px 0;">$1</ul>')
    .replace(/\n\n/g, '</p><p style="margin:0 0 8px;">')
    .replace(/\n/g, "<br />");
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`} style={{ marginBottom: "14px" }}>
      <div
        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
        style={{
          backgroundColor: isUser ? "#3b5bfc" : "rgba(168,85,247,0.20)",
          color: isUser ? "#fff" : "#a855f7",
          border: isUser ? "none" : "1px solid rgba(168,85,247,0.30)",
        }}
      >
        {isUser ? "A" : <Bot size={13} />}
      </div>
      <div style={{ maxWidth: "82%" }}>
        <div
          className="px-3.5 py-2.5 text-sm leading-relaxed"
          style={{
            backgroundColor: isUser ? "#3b5bfc" : "rgba(255,255,255,0.05)",
            color: isUser ? "#fff" : "rgba(255,255,255,0.85)",
            border: isUser ? "none" : "1px solid rgba(255,255,255,0.08)",
            borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          }}
        >
          {isUser ? (
            <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} style={{ lineHeight: "1.65" }} />
          )}
        </div>
        {!isUser && msg.autoDetectedFiles && msg.autoDetectedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {msg.autoDetectedFiles.map((f) => (
              <span
                key={f}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                style={{ backgroundColor: "rgba(59,91,252,0.12)", color: "rgba(255,255,255,0.50)", border: "1px solid rgba(59,91,252,0.20)" }}
              >
                <Eye size={10} />
                {getFileName(f)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex gap-2.5 flex-row" style={{ marginBottom: "14px" }}>
      <div
        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
        style={{ backgroundColor: "rgba(168,85,247,0.20)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.30)" }}
      >
        <Bot size={13} />
      </div>
      <div
        className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl"
        style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px 16px 16px 4px" }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: "rgba(168,85,247,0.70)", animation: `devbot-bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </div>
    </div>
  );
}

// ── File explorer ─────────────────────────────────────────────────────────────

interface FileExplorerProps {
  files: RepoFile[];
  loadedFiles: string[];
  loading: boolean;
  githubConfigured: boolean;
  onToggleFile: (path: string) => void;
  onPreviewFile: (path: string) => void;
}

function FileExplorer({ files, loadedFiles, loading, githubConfigured, onToggleFile, onPreviewFile }: FileExplorerProps) {
  const [search, setSearch] = useState("");
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  const filtered = search.trim()
    ? files.filter((f) => f.path.toLowerCase().includes(search.toLowerCase()))
    : files;

  // Group by top-level directory
  const groups = new Map<string, RepoFile[]>();
  for (const file of filtered) {
    const parts = file.path.split("/");
    const topDir = parts.length > 1 ? parts[0] : "__root__";
    if (!groups.has(topDir)) groups.set(topDir, []);
    groups.get(topDir)!.push(file);
  }

  function toggleDir(dir: string) {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  }

  return (
    <div
      className="hidden lg:flex flex-col w-72 flex-shrink-0 border-l h-full"
      style={{ backgroundColor: "#0d1117", borderColor: "rgba(255,255,255,0.06)" }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 border-b flex items-center gap-2 flex-shrink-0"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <GitBranch size={14} style={{ color: "rgba(255,255,255,0.40)" }} />
        <span className="text-xs font-semibold text-white">File Explorer</span>
        {loadedFiles.length > 0 && (
          <span
            className="ml-auto text-xs px-1.5 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: "rgba(59,91,252,0.20)", color: "#3b5bfc" }}
          >
            {loadedFiles.length} loaded
          </span>
        )}
      </div>

      {/* Search */}
      <div className="px-3 py-2.5 border-b flex-shrink-0" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <Search size={12} style={{ color: "rgba(255,255,255,0.30)", flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Filter files…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: "#fff" }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ color: "rgba(255,255,255,0.30)" }}>
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Not configured notice */}
      {!githubConfigured && !loading && (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 px-4 text-center">
          <GitBranch size={20} style={{ color: "rgba(255,255,255,0.20)" }} />
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.30)" }}>
            Add <code style={{ color: "rgba(255,255,255,0.50)" }}>GITHUB_TOKEN</code> and{" "}
            <code style={{ color: "rgba(255,255,255,0.50)" }}>GITHUB_REPO</code> to secrets to enable file browsing.
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center flex-1 gap-2" style={{ color: "rgba(255,255,255,0.30)" }}>
          <Loader2 size={14} className="animate-spin" />
          <span className="text-xs">Loading files…</span>
        </div>
      )}

      {/* File tree */}
      {!loading && githubConfigured && (
        <div className="flex-1 overflow-y-auto py-1">
          {[...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dir, dirFiles]) => {
            const isExpanded = expandedDirs.has(dir) || !!search.trim();
            const isRoot = dir === "__root__";

            return (
              <div key={dir}>
                {!isRoot && (
                  <button
                    onClick={() => toggleDir(dir)}
                    className="w-full flex items-center gap-1.5 px-3 py-1 text-xs font-semibold transition-colors hover:bg-white/5"
                    style={{ color: "rgba(255,255,255,0.45)" }}
                  >
                    <ChevronRight
                      size={11}
                      style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}
                    />
                    {dir}
                    <span className="ml-auto" style={{ color: "rgba(255,255,255,0.25)", fontSize: "10px" }}>
                      {dirFiles.length}
                    </span>
                  </button>
                )}

                {(isExpanded || isRoot) && dirFiles.map((file) => {
                  const isLoaded = loadedFiles.includes(file.path);
                  const ext = getFileExt(file.path);
                  const name = getFileName(file.path);
                  const subDir = !isRoot ? getFileDir(file.path).slice(dir.length + 1) : getFileDir(file.path);

                  return (
                    <div
                      key={file.path}
                      className="group flex items-center gap-2 px-3 py-1 cursor-pointer transition-colors hover:bg-white/5"
                      style={{
                        paddingLeft: isRoot ? "12px" : "22px",
                        backgroundColor: isLoaded ? "rgba(59,91,252,0.10)" : "transparent",
                      }}
                    >
                      <span
                        className="text-xs font-mono font-bold flex-shrink-0"
                        style={{ color: extColor(ext), fontSize: "9px", minWidth: "24px" }}
                      >
                        {ext.toUpperCase().slice(0, 3)}
                      </span>
                      <div
                        className="flex-1 min-w-0"
                        onClick={() => onToggleFile(file.path)}
                      >
                        <p
                          className="text-xs truncate"
                          style={{ color: isLoaded ? "#fff" : "rgba(255,255,255,0.65)" }}
                          title={file.path}
                        >
                          {name}
                        </p>
                        {subDir && (
                          <p className="text-xs truncate" style={{ color: "rgba(255,255,255,0.25)", fontSize: "10px" }}>
                            {subDir}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); onPreviewFile(file.path); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        title="Preview file"
                        style={{ color: "rgba(255,255,255,0.30)" }}
                      >
                        <Eye size={11} />
                      </button>
                      {isLoaded && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onToggleFile(file.path); }}
                          className="flex-shrink-0"
                          title="Remove from context"
                          style={{ color: "#3b5bfc" }}
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {filtered.length === 0 && search && (
            <p className="text-center text-xs py-8" style={{ color: "rgba(255,255,255,0.25)" }}>
              No files match "{search}"
            </p>
          )}
        </div>
      )}

      {/* Loaded files count */}
      {loadedFiles.length > 0 && (
        <div
          className="px-3 py-2.5 border-t flex-shrink-0 flex items-center gap-2"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          <FileCode size={12} style={{ color: "#3b5bfc" }} />
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.50)" }}>
            {loadedFiles.length} file{loadedFiles.length > 1 ? "s" : ""} in context
          </span>
          <button
            onClick={() => loadedFiles.forEach((f) => onToggleFile(f))}
            className="ml-auto text-xs transition-opacity hover:opacity-80"
            style={{ color: "rgba(239,68,68,0.70)" }}
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

// ── File preview modal ────────────────────────────────────────────────────────

interface FilePreviewProps {
  path: string;
  content: string | null;
  loading: boolean;
  onClose: () => void;
  onLoad: () => void;
  isLoaded: boolean;
}

function FilePreview({ path, content, loading, onClose, onLoad, isLoaded }: FilePreviewProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[80vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ backgroundColor: "#0d1117", border: "1px solid rgba(255,255,255,0.10)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-3 px-5 py-3.5 border-b flex-shrink-0"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
          <FileCode size={15} style={{ color: extColor(getFileExt(path)) }} />
          <span className="text-sm font-medium text-white truncate flex-1">{path}</span>
          <button
            onClick={onLoad}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 flex-shrink-0"
            style={{
              backgroundColor: isLoaded ? "rgba(239,68,68,0.12)" : "rgba(59,91,252,0.15)",
              color: isLoaded ? "#ef4444" : "#3b5bfc",
              border: isLoaded ? "1px solid rgba(239,68,68,0.25)" : "1px solid rgba(59,91,252,0.30)",
            }}
          >
            {isLoaded ? <><X size={11} /> Remove</> : <><FileCode size={11} /> Load into context</>}
          </button>
          <button onClick={onClose} style={{ color: "rgba(255,255,255,0.35)" }}>
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2" style={{ color: "rgba(255,255,255,0.30)" }}>
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : content ? (
            <pre
              className="text-xs leading-relaxed"
              style={{ color: "rgba(255,255,255,0.75)", fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" }}
            >
              {content}
            </pre>
          ) : (
            <p className="text-sm text-center py-12" style={{ color: "rgba(255,255,255,0.30)" }}>
              Could not load file content.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminDevBot() {
  const [messages, setMessages]         = useState<Message[]>([]);
  const [input, setInput]               = useState("");
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");

  // File explorer state
  const [repoFiles, setRepoFiles]       = useState<RepoFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [githubReady, setGithubReady]   = useState(false);
  const [loadedFiles, setLoadedFiles]   = useState<string[]>([]);

  // Preview modal state
  const [preview, setPreview]           = useState<{ path: string; content: string | null; loading: boolean } | null>(null);

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Load file tree on mount ────────────────────────────────────────────────
  useEffect(() => {
    async function loadFiles() {
      setFilesLoading(true);
      try {
        const token = await getToken();
        const res = await fetch("/api/devbot/files", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json() as { files: RepoFile[]; githubConfigured: boolean };
        setRepoFiles(data.files);
        setGithubReady(data.githubConfigured);
      } catch {
        // silently fail — file explorer just won't show
      } finally {
        setFilesLoading(false);
      }
    }
    void loadFiles();
  }, []);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── Toggle file in context ─────────────────────────────────────────────────
  function toggleFile(path: string) {
    setLoadedFiles((prev) =>
      prev.includes(path) ? prev.filter((f) => f !== path) : [...prev, path]
    );
  }

  // ── Open file preview ──────────────────────────────────────────────────────
  async function openPreview(path: string) {
    setPreview({ path, content: null, loading: true });
    try {
      const token = await getToken();
      const res = await fetch(`/api/devbot/file?path=${encodeURIComponent(path)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { content?: string };
      setPreview({ path, content: data.content ?? null, loading: false });
    } catch {
      setPreview((prev) => prev ? { ...prev, loading: false } : null);
    }
  }

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { role: "user", content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError("");

    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const token = await getToken();
      const res = await fetch("/api/devbot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: trimmed, history: messages, loadedFiles }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as { reply: string; autoDetectedFiles?: string[] };
      setMessages([...newMessages, {
        role: "assistant",
        content: data.reply,
        autoDetectedFiles: data.autoDetectedFiles,
      }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "DevBot failed to respond");
      setMessages(newMessages);
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading, loadedFiles]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }

  function clearChat() {
    setMessages([]);
    setError("");
    setLoadedFiles([]);
  }

  return (
    <AdminLayout activeItemId="devbot">
      <style>{`
        @keyframes devbot-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40%            { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>

      <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "#0a0f1e" }}>

        {/* ── Chat panel ── */}
        <div className="flex flex-col flex-1 min-w-0 h-full">

          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0"
            style={{ backgroundColor: "#0d1117", borderColor: "rgba(255,255,255,0.06)" }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "rgba(168,85,247,0.18)", border: "1px solid rgba(168,85,247,0.30)" }}
              >
                <Bot size={16} style={{ color: "#a855f7" }} />
              </div>
              <div>
                <h1 className="text-sm font-bold text-white leading-tight">DevBot</h1>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>Your private AI developer</p>
              </div>
              {loadedFiles.length > 0 && (
                <div
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ml-2"
                  style={{ backgroundColor: "rgba(59,91,252,0.12)", color: "#3b5bfc", border: "1px solid rgba(59,91,252,0.25)" }}
                >
                  <FileCode size={11} />
                  {loadedFiles.length} file{loadedFiles.length > 1 ? "s" : ""} in context
                </div>
              )}
            </div>

            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                style={{ backgroundColor: "rgba(239,68,68,0.10)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.20)" }}
              >
                <Trash2 size={12} />
                Clear
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
            <div className="max-w-2xl mx-auto">
              {messages.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ backgroundColor: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.25)" }}
                  >
                    <Bot size={24} style={{ color: "#a855f7" }} />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-base">DevBot is ready</p>
                    <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.38)" }}>
                      Ask anything about the EverydayAI codebase. Load files from the explorer to give DevBot direct access to current code.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center mt-1">
                    {[
                      "How does the chat route work?",
                      "Add a new admin page",
                      "Explain API key encryption",
                      "How do tool calls work?",
                    ].map((hint) => (
                      <button
                        key={hint}
                        onClick={() => setInput(hint)}
                        className="px-3 py-1.5 rounded-full text-xs font-medium transition-opacity hover:opacity-80"
                        style={{ backgroundColor: "rgba(59,91,252,0.10)", color: "rgba(255,255,255,0.55)", border: "1px solid rgba(59,91,252,0.22)" }}
                      >
                        {hint}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
              {loading && <ThinkingBubble />}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              className="mx-4 mb-1.5 md:mx-6 px-3.5 py-2 rounded-xl text-sm flex-shrink-0"
              style={{ backgroundColor: "rgba(239,68,68,0.10)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.20)" }}
            >
              {error}
            </div>
          )}

          {/* Loaded files chips (mobile) */}
          {loadedFiles.length > 0 && (
            <div className="lg:hidden px-4 pb-1 flex flex-wrap gap-1.5 flex-shrink-0">
              {loadedFiles.map((f) => (
                <span
                  key={f}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                  style={{ backgroundColor: "rgba(59,91,252,0.15)", color: "#3b5bfc", border: "1px solid rgba(59,91,252,0.25)" }}
                >
                  <FileCode size={10} />
                  {getFileName(f)}
                  <button onClick={() => toggleFile(f)}><X size={10} /></button>
                </span>
              ))}
            </div>
          )}

          {/* Input */}
          <div
            className="px-4 pb-3.5 pt-2.5 md:px-6 flex-shrink-0 border-t"
            style={{ borderColor: "rgba(255,255,255,0.06)", backgroundColor: "#0d1117" }}
          >
            <div className="max-w-2xl mx-auto flex gap-2.5 items-end">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder="Ask DevBot anything about the codebase…"
                rows={1}
                className="flex-1 resize-none rounded-xl px-3.5 py-2.5 text-sm outline-none"
                style={{
                  backgroundColor: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  color: "#fff",
                  minHeight: "42px",
                  maxHeight: "160px",
                  lineHeight: "1.5",
                }}
                onFocus={(e) => { e.currentTarget.style.border = "1px solid rgba(59,91,252,0.50)"; }}
                onBlur={(e) => { e.currentTarget.style.border = "1px solid rgba(255,255,255,0.10)"; }}
              />
              <button
                onClick={() => void sendMessage()}
                disabled={!input.trim() || loading}
                className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: "#3b5bfc" }}
                aria-label="Send"
              >
                {loading ? <Loader2 size={14} className="animate-spin" style={{ color: "#fff" }} /> : <Send size={14} style={{ color: "#fff" }} />}
              </button>
            </div>
            <p className="text-center text-xs mt-1.5" style={{ color: "rgba(255,255,255,0.18)" }}>
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>

        {/* ── File explorer panel (desktop) ── */}
        <FileExplorer
          files={repoFiles}
          loadedFiles={loadedFiles}
          loading={filesLoading}
          githubConfigured={githubReady}
          onToggleFile={toggleFile}
          onPreviewFile={openPreview}
        />
      </div>

      {/* ── File preview modal ── */}
      {preview && (
        <FilePreview
          path={preview.path}
          content={preview.content}
          loading={preview.loading}
          isLoaded={loadedFiles.includes(preview.path)}
          onClose={() => setPreview(null)}
          onLoad={() => {
            toggleFile(preview.path);
            setPreview(null);
          }}
        />
      )}
    </AdminLayout>
  );
}
