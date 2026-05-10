import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot, Send, Trash2, FileCode, Search, X, ChevronRight,
  Loader2, GitBranch, Eye, GitPullRequest, CheckCircle2,
  AlertCircle, Rocket, Upload, Activity, RefreshCw, BarChart2,
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

interface SessionChange {
  path: string;
  commitUrl: string;
}

type DeployStatus = "idle" | "creating-pr" | "merging" | "deployed" | "error";

interface ApplyModalState {
  code: string;
  lang: string;
  suggestedPath: string;
}

interface HealthResult {
  status: "ok" | "warning" | "critical";
  errorCount: number;
  errors: Array<{ action: string; count: number }>;
  warnings: string[];
  lastChecked: string;
}

interface WeeklyReport {
  newUsers:      number;
  newAgents:     number;
  totalMessages: number;
  revenueNaira:  number;
  bugsDetected:  number;
  weekStart:     string;
  weekEnd:       string;
  generatedAt:   string;
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

function detectSuggestedPath(precedingText: string, knownFiles: string[]): string {
  const backtickMatches = [...precedingText.matchAll(/`([^`]*\.[a-z]+)`/gi)];
  for (const m of backtickMatches.reverse()) {
    const candidate = m[1];
    const known = knownFiles.find((f) => f.endsWith(candidate) || f === candidate);
    if (known) return known;
  }
  const pathPattern = /(?:[\w-]+\/)+[\w.-]+\.(?:ts|tsx|js|jsx|json|md|yaml|yml|toml|css)/g;
  const pathMatches = [...precedingText.matchAll(pathPattern)];
  for (const m of pathMatches.reverse()) {
    const candidate = m[0];
    const known = knownFiles.find((f) => f.endsWith(candidate) || f === candidate);
    if (known) return known;
  }
  return "";
}

// ── Message parsing ───────────────────────────────────────────────────────────

interface TextPart { type: "text"; content: string; }
interface CodePart { type: "code"; lang: string; code: string; }
type MessagePart = TextPart | CodePart;

function parseMessageParts(text: string): MessagePart[] {
  const parts: MessagePart[] = [];
  const regex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIdx = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push({ type: "text", content: text.slice(lastIdx, match.index) });
    }
    parts.push({ type: "code", lang: match[1] || "", code: match[2].trim() });
    lastIdx = regex.lastIndex;
  }
  if (lastIdx < text.length) {
    parts.push({ type: "text", content: text.slice(lastIdx) });
  }
  return parts;
}

function renderTextMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
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

// ── MessageContent ────────────────────────────────────────────────────────────

interface MessageContentProps {
  content: string;
  knownFiles: string[];
  onApply: (state: ApplyModalState) => void;
}

function MessageContent({ content, knownFiles, onApply }: MessageContentProps) {
  const parts = parseMessageParts(content);
  let precedingText = "";

  return (
    <div style={{ lineHeight: "1.65" }}>
      {parts.map((part, i) => {
        if (part.type === "text") {
          precedingText += part.content;
          return (
            <div
              key={i}
              dangerouslySetInnerHTML={{ __html: renderTextMarkdown(part.content) }}
            />
          );
        }

        const suggestedPath = detectSuggestedPath(precedingText, knownFiles);
        const captured = { code: part.code, lang: part.lang, suggestedPath };

        return (
          <div key={i} style={{ margin: "10px 0" }}>
            <div style={{ position: "relative" }}>
              {part.lang && (
                <div
                  style={{
                    position: "absolute", top: "8px", right: "10px",
                    fontSize: "10px", color: "rgba(255,255,255,0.30)",
                    fontFamily: "monospace", textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {part.lang}
                </div>
              )}
              <pre
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: "8px 8px 0 0",
                  padding: "12px 14px",
                  paddingRight: "70px",
                  overflowX: "auto",
                  margin: 0,
                  fontSize: "12.5px",
                  lineHeight: "1.6",
                  fontFamily: "monospace",
                }}
              >
                <code>{part.code}</code>
              </pre>
            </div>
            <button
              onClick={() => onApply(captured)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "7px 12px",
                background: "rgba(59,91,252,0.10)",
                border: "1px solid rgba(59,91,252,0.25)",
                borderTop: "none",
                borderRadius: "0 0 8px 8px",
                color: "#3b5bfc",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(59,91,252,0.18)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(59,91,252,0.10)"; }}
            >
              <Upload size={11} />
              Apply Change
              {suggestedPath && (
                <span style={{ color: "rgba(59,91,252,0.65)", fontWeight: 400 }}>
                  → {getFileName(suggestedPath)}
                </span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  msg: Message;
  knownFiles: string[];
  onApply: (state: ApplyModalState) => void;
}

function MessageBubble({ msg, knownFiles, onApply }: MessageBubbleProps) {
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
            <MessageContent content={msg.content} knownFiles={knownFiles} onApply={onApply} />
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

// ── Apply Change Modal ────────────────────────────────────────────────────────

interface ApplyModalProps {
  state: ApplyModalState;
  currentBranch: string | null;
  onClose: () => void;
  onApply: (filePath: string, content: string, commitMessage: string) => Promise<void>;
  loading: boolean;
  error: string;
}

function ApplyModal({ state, currentBranch, onClose, onApply, loading, error }: ApplyModalProps) {
  const [filePath, setFilePath] = useState(state.suggestedPath);
  const [commitMsg, setCommitMsg] = useState(
    state.suggestedPath ? `DevBot: update ${getFileName(state.suggestedPath)}` : "DevBot: apply code change"
  );

  async function handleApply() {
    if (!filePath.trim()) return;
    await onApply(filePath.trim(), state.code, commitMsg.trim() || `DevBot: update ${getFileName(filePath.trim())}`);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.80)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl flex flex-col rounded-2xl overflow-hidden"
        style={{ backgroundColor: "#0d1117", border: "1px solid rgba(255,255,255,0.10)", maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-3.5 border-b flex-shrink-0"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
          <Upload size={15} style={{ color: "#3b5bfc" }} />
          <span className="text-sm font-semibold text-white">Apply Code Change</span>
          <button onClick={onClose} className="ml-auto" style={{ color: "rgba(255,255,255,0.35)" }}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* File path */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>
              File path
            </label>
            <input
              type="text"
              value={filePath}
              onChange={(e) => {
                setFilePath(e.target.value);
                setCommitMsg(`DevBot: update ${getFileName(e.target.value)}`);
              }}
              placeholder="e.g. artifacts/api-server/src/routes/devbot.ts"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                backgroundColor: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#fff",
                fontFamily: "monospace",
              }}
              onFocus={(e) => { e.currentTarget.style.border = "1px solid rgba(59,91,252,0.50)"; }}
              onBlur={(e) => { e.currentTarget.style.border = "1px solid rgba(255,255,255,0.12)"; }}
            />
          </div>

          {/* Commit message */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>
              Commit message
            </label>
            <input
              type="text"
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                backgroundColor: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#fff",
              }}
              onFocus={(e) => { e.currentTarget.style.border = "1px solid rgba(59,91,252,0.50)"; }}
              onBlur={(e) => { e.currentTarget.style.border = "1px solid rgba(255,255,255,0.12)"; }}
            />
          </div>

          {/* Branch info */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <GitBranch size={11} style={{ color: "rgba(255,255,255,0.40)", flexShrink: 0 }} />
            <span style={{ color: "rgba(255,255,255,0.40)" }}>
              {currentBranch
                ? <>Will commit to branch <code style={{ color: "rgba(255,255,255,0.70)" }}>{currentBranch}</code></>
                : "A new branch will be created automatically"}
            </span>
          </div>

          {/* Code preview */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>
              Code preview
            </label>
            <pre
              className="overflow-auto rounded-lg text-xs"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                padding: "12px",
                color: "rgba(255,255,255,0.70)",
                fontFamily: "monospace",
                maxHeight: "200px",
                lineHeight: "1.6",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {state.code.slice(0, 2000)}{state.code.length > 2000 ? "\n… [truncated]" : ""}
            </pre>
          </div>

          {/* Error */}
          {error && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
              style={{ backgroundColor: "rgba(239,68,68,0.10)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.20)" }}
            >
              <AlertCircle size={13} />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t flex-shrink-0"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-sm transition-opacity hover:opacity-70"
            style={{ color: "rgba(255,255,255,0.50)" }}
          >
            Cancel
          </button>
          <button
            onClick={() => void handleApply()}
            disabled={!filePath.trim() || loading}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: "#3b5bfc", color: "#fff" }}
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {loading ? "Committing…" : "Apply & Commit"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Deploy Panel ──────────────────────────────────────────────────────────────

interface DeployPanelProps {
  currentBranch: string | null;
  sessionChanges: SessionChange[];
  deployStatus: DeployStatus;
  deployUrl: string | null;
  onDeploy: () => void;
}

const DEPLOY_STEPS: { key: DeployStatus; label: string }[] = [
  { key: "creating-pr", label: "Creating PR…" },
  { key: "merging",     label: "Merging…" },
  { key: "deployed",    label: "Deployed" },
];

function DeployPanel({ currentBranch, sessionChanges, deployStatus, deployUrl, onDeploy }: DeployPanelProps) {
  const isDeploying = deployStatus === "creating-pr" || deployStatus === "merging";
  const isDeployed  = deployStatus === "deployed";
  const isError     = deployStatus === "error";

  return (
    <div
      className="flex-shrink-0 border-t"
      style={{ borderColor: "rgba(255,255,255,0.06)", backgroundColor: "#0d1117" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 border-b"
        style={{ borderColor: "rgba(255,255,255,0.05)" }}
      >
        <Rocket size={13} style={{ color: currentBranch ? "#a855f7" : "rgba(255,255,255,0.30)" }} />
        <span className="text-xs font-semibold" style={{ color: currentBranch ? "#fff" : "rgba(255,255,255,0.40)" }}>
          Deploy
        </span>
        {sessionChanges.length > 0 && (
          <span
            className="ml-auto text-xs px-1.5 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: "rgba(168,85,247,0.18)", color: "#a855f7" }}
          >
            {sessionChanges.length} file{sessionChanges.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="px-4 py-3 flex flex-col gap-2.5">
        {!currentBranch ? (
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.30)" }}>
            Apply a code change above to create a branch and enable deployment.
          </p>
        ) : (
          <>
            {/* Branch */}
            <div className="flex items-center gap-1.5">
              <GitBranch size={10} style={{ color: "rgba(255,255,255,0.35)", flexShrink: 0 }} />
              <span
                className="text-xs font-mono truncate"
                style={{ color: "rgba(255,255,255,0.55)" }}
                title={currentBranch}
              >
                {currentBranch}
              </span>
            </div>

            {/* Changed files */}
            {sessionChanges.length > 0 && (
              <div className="flex flex-col gap-1">
                {sessionChanges.slice(-3).map((c) => (
                  <a
                    key={c.commitUrl}
                    href={c.commitUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs hover:opacity-80 transition-opacity"
                    style={{ color: "rgba(255,255,255,0.45)" }}
                  >
                    <FileCode size={10} style={{ color: "#3b5bfc", flexShrink: 0 }} />
                    <span className="truncate">{getFileName(c.path)}</span>
                  </a>
                ))}
                {sessionChanges.length > 3 && (
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
                    +{sessionChanges.length - 3} more
                  </span>
                )}
              </div>
            )}

            {/* Status steps */}
            {deployStatus !== "idle" && (
              <div className="flex flex-col gap-1 py-1">
                {DEPLOY_STEPS.map((step, idx) => {
                  const stepIdx  = DEPLOY_STEPS.findIndex((s) => s.key === deployStatus);
                  const doneIdx  = DEPLOY_STEPS.findIndex((s) => s.key === "deployed");
                  const thisDone = isDeployed || (stepIdx > idx && !isError);
                  const active   = step.key === deployStatus && !isDeployed && !isError;

                  return (
                    <div key={step.key} className="flex items-center gap-2">
                      {thisDone ? (
                        <CheckCircle2 size={11} style={{ color: "#22c55e", flexShrink: 0 }} />
                      ) : active ? (
                        <Loader2 size={11} className="animate-spin flex-shrink-0" style={{ color: "#a855f7" }} />
                      ) : (
                        <div
                          className="w-2.5 h-2.5 rounded-full border flex-shrink-0"
                          style={{ borderColor: "rgba(255,255,255,0.20)" }}
                        />
                      )}
                      <span
                        className="text-xs"
                        style={{
                          color: thisDone ? "#22c55e" : active ? "#a855f7" : "rgba(255,255,255,0.30)",
                          fontWeight: active ? 600 : 400,
                        }}
                      >
                        {idx === doneIdx && isDeployed ? "Deployed ✅" : step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {isError && (
              <div
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg"
                style={{ backgroundColor: "rgba(239,68,68,0.10)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.20)" }}
              >
                <AlertCircle size={11} />
                Deploy failed — check logs
              </div>
            )}

            {/* Deploy URL */}
            {isDeployed && deployUrl && (
              <a
                href={deployUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                style={{ backgroundColor: "rgba(34,197,94,0.10)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }}
              >
                <GitPullRequest size={11} />
                View merged PR
              </a>
            )}

            {/* Deploy button */}
            {!isDeployed && (
              <button
                onClick={onDeploy}
                disabled={isDeploying || sessionChanges.length === 0}
                className="flex items-center justify-center gap-2 w-full py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: "#a855f7", color: "#fff" }}
              >
                {isDeploying ? (
                  <><Loader2 size={11} className="animate-spin" /> Deploying…</>
                ) : (
                  <><Rocket size={11} /> Deploy to main</>
                )}
              </button>
            )}
          </>
        )}
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
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
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

      {!githubConfigured && !loading && (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 px-4 text-center">
          <GitBranch size={20} style={{ color: "rgba(255,255,255,0.20)" }} />
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.30)" }}>
            Add <code style={{ color: "rgba(255,255,255,0.50)" }}>GITHUB_TOKEN</code> and{" "}
            <code style={{ color: "rgba(255,255,255,0.50)" }}>GITHUB_REPO</code> to secrets to enable file browsing.
          </p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center flex-1 gap-2" style={{ color: "rgba(255,255,255,0.30)" }}>
          <Loader2 size={14} className="animate-spin" />
          <span className="text-xs">Loading files…</span>
        </div>
      )}

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
                      <div className="flex-1 min-w-0" onClick={() => onToggleFile(file.path)}>
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

// ── Right sidebar ─────────────────────────────────────────────────────────────

interface RightSidebarProps extends FileExplorerProps, DeployPanelProps {}

function RightSidebar(props: RightSidebarProps) {
  return (
    <div
      className="hidden lg:flex flex-col w-72 flex-shrink-0 border-l h-full"
      style={{ backgroundColor: "#0d1117", borderColor: "rgba(255,255,255,0.06)" }}
    >
      {/* Explorer header */}
      <div
        className="px-4 py-3 border-b flex items-center gap-2 flex-shrink-0"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <GitBranch size={14} style={{ color: "rgba(255,255,255,0.40)" }} />
        <span className="text-xs font-semibold text-white">File Explorer</span>
        {props.loadedFiles.length > 0 && (
          <span
            className="ml-auto text-xs px-1.5 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: "rgba(59,91,252,0.20)", color: "#3b5bfc" }}
          >
            {props.loadedFiles.length} loaded
          </span>
        )}
      </div>

      <FileExplorer
        files={props.files}
        loadedFiles={props.loadedFiles}
        loading={props.loading}
        githubConfigured={props.githubConfigured}
        onToggleFile={props.onToggleFile}
        onPreviewFile={props.onPreviewFile}
      />

      <DeployPanel
        currentBranch={props.currentBranch}
        sessionChanges={props.sessionChanges}
        deployStatus={props.deployStatus}
        deployUrl={props.deployUrl}
        onDeploy={props.onDeploy}
      />
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

  // Deploy / write state
  const [currentBranch, setCurrentBranch]     = useState<string | null>(null);
  const [sessionChanges, setSessionChanges]   = useState<SessionChange[]>([]);
  const [deployStatus, setDeployStatus]       = useState<DeployStatus>("idle");
  const [deployUrl, setDeployUrl]             = useState<string | null>(null);

  // Apply modal state
  const [applyModal, setApplyModal]           = useState<ApplyModalState | null>(null);
  const [applyLoading, setApplyLoading]       = useState(false);
  const [applyError, setApplyError]           = useState("");

  // Health indicator state
  const [healthResult, setHealthResult]       = useState<HealthResult | null>(null);
  const [healthLoading, setHealthLoading]     = useState(false);
  const [showHealth, setShowHealth]           = useState(false);

  // Weekly report state
  const [report, setReport]                   = useState<WeeklyReport | null>(null);
  const [reportLoading, setReportLoading]     = useState(false);
  const [reportSending, setReportSending]     = useState(false);
  const [reportSent, setReportSent]           = useState(false);
  const [showReport, setShowReport]           = useState(false);

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
        // silently fail
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

  // ── Apply code change ──────────────────────────────────────────────────────
  async function applyChange(filePath: string, content: string, commitMessage: string) {
    setApplyLoading(true);
    setApplyError("");
    try {
      const token = await getToken();
      const res = await fetch("/api/devbot/write", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ path: filePath, content, message: commitMessage, branch: currentBranch }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { success: boolean; commitUrl: string; branch: string };
      setCurrentBranch(data.branch);
      setSessionChanges((prev) => [...prev, { path: filePath, commitUrl: data.commitUrl }]);
      setApplyModal(null);
      setDeployStatus("idle");
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Failed to commit change");
    } finally {
      setApplyLoading(false);
    }
  }

  // ── Deploy branch ──────────────────────────────────────────────────────────
  async function deployBranch() {
    if (!currentBranch || sessionChanges.length === 0) return;
    setDeployStatus("creating-pr");
    setDeployUrl(null);

    // Simulate progress steps for UX
    const mergeTimer = setTimeout(() => {
      setDeployStatus("merging");
    }, 1800);

    try {
      const token = await getToken();
      const res = await fetch("/api/devbot/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          branch: currentBranch,
          title: `DevBot: ${sessionChanges.length} change${sessionChanges.length !== 1 ? "s" : ""} via admin panel`,
        }),
      });
      clearTimeout(mergeTimer);
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { success: boolean; deployUrl: string };
      setDeployUrl(data.deployUrl);
      setDeployStatus("deployed");
    } catch {
      clearTimeout(mergeTimer);
      setDeployStatus("error");
    }
  }

  // ── Fetch health ───────────────────────────────────────────────────────────
  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/devbot/health", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as HealthResult;
        setHealthResult(data);
      }
    } catch { /* silent */ } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHealth();
    const iv = setInterval(() => void fetchHealth(), 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [fetchHealth]);

  // ── Fetch weekly report ────────────────────────────────────────────────────
  const fetchReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/devbot/report", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setReport(await res.json() as WeeklyReport);
    } catch { /* silent */ } finally {
      setReportLoading(false);
    }
  }, []);

  async function sendReportToTelegram() {
    setReportSending(true);
    setReportSent(false);
    try {
      const token = await getToken();
      const res = await fetch("/api/devbot/report", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setReportSent(true);
    } catch { /* silent */ } finally {
      setReportSending(false);
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

  const knownFilePaths = repoFiles.map((f) => f.path);

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
              {currentBranch && (
                <div
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ml-1"
                  style={{ backgroundColor: "rgba(168,85,247,0.12)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.25)" }}
                >
                  <GitBranch size={11} />
                  {sessionChanges.length} commit{sessionChanges.length !== 1 ? "s" : ""}
                </div>
              )}
            </div>

            {/* Reports button */}
            <button
              onClick={() => {
                setShowReport((v) => !v);
                if (!report) void fetchReport();
              }}
              title="Weekly report"
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-opacity hover:opacity-80"
              style={{
                backgroundColor: showReport ? "rgba(255,255,255,0.06)" : "transparent",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {reportLoading
                ? <Loader2 size={12} className="animate-spin" style={{ color: "rgba(255,255,255,0.40)" }} />
                : <BarChart2 size={12} style={{ color: "rgba(255,255,255,0.40)" }} />
              }
            </button>

            {/* Health indicator */}
            <button
              onClick={() => setShowHealth((v) => !v)}
              title="System health"
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-opacity hover:opacity-80"
              style={{
                backgroundColor: showHealth ? "rgba(255,255,255,0.06)" : "transparent",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {healthLoading ? (
                <Loader2 size={12} className="animate-spin" style={{ color: "rgba(255,255,255,0.40)" }} />
              ) : (
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor:
                      healthResult?.status === "critical" ? "#ef4444" :
                      healthResult?.status === "warning"  ? "#f59e0b" :
                      healthResult?.status === "ok"       ? "#22c55e" :
                      "rgba(255,255,255,0.25)",
                    boxShadow:
                      healthResult?.status === "critical" ? "0 0 6px #ef4444" :
                      healthResult?.status === "warning"  ? "0 0 6px #f59e0b" :
                      healthResult?.status === "ok"       ? "0 0 6px #22c55e" :
                      "none",
                  }}
                />
              )}
              <Activity size={11} style={{ color: "rgba(255,255,255,0.40)" }} />
            </button>

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

          {/* Reports panel */}
          {showReport && (
            <div
              className="flex-shrink-0 border-b px-5 py-3"
              style={{ backgroundColor: "#0d1117", borderColor: "rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BarChart2 size={13} style={{ color: "#a855f7" }} />
                  <span className="text-xs font-semibold text-white">This Week's Report</span>
                  {report && (
                    <span className="text-xs" style={{ color: "rgba(255,255,255,0.30)" }}>
                      {new Date(report.weekStart).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      {" – "}
                      {new Date(report.weekEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void fetchReport()}
                    disabled={reportLoading}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-opacity hover:opacity-80 disabled:opacity-40"
                    style={{ color: "rgba(255,255,255,0.40)", border: "1px solid rgba(255,255,255,0.10)" }}
                  >
                    <RefreshCw size={10} className={reportLoading ? "animate-spin" : ""} />
                    Refresh
                  </button>
                  <button onClick={() => setShowReport(false)} style={{ color: "rgba(255,255,255,0.30)" }}>
                    <X size={13} />
                  </button>
                </div>
              </div>

              {reportLoading && !report && (
                <div className="flex items-center gap-2 py-2" style={{ color: "rgba(255,255,255,0.35)" }}>
                  <Loader2 size={13} className="animate-spin" />
                  <span className="text-xs">Generating report…</span>
                </div>
              )}

              {report && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
                    {[
                      { label: "New users",    value: report.newUsers,                     color: "#3b5bfc", icon: "👥" },
                      { label: "New agents",   value: report.newAgents,                    color: "#06b6d4", icon: "🤖" },
                      { label: "Messages",     value: report.totalMessages,                color: "#10b981", icon: "💬" },
                      { label: "Revenue",      value: `₦${report.revenueNaira.toLocaleString("en-NG", { minimumFractionDigits: 0 })}`, color: "#f59e0b", icon: "💰" },
                      { label: "Bugs detected", value: report.bugsDetected,               color: report.bugsDetected > 0 ? "#ef4444" : "#22c55e", icon: "🐛" },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="flex flex-col gap-0.5 px-3 py-2 rounded-lg"
                        style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                      >
                        <span className="text-xs" style={{ color: "rgba(255,255,255,0.40)" }}>{stat.icon} {stat.label}</span>
                        <span className="text-sm font-bold" style={{ color: stat.color }}>{stat.value}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => void sendReportToTelegram()}
                    disabled={reportSending || reportSent}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: reportSent ? "rgba(34,197,94,0.12)" : "rgba(168,85,247,0.15)",
                      color: reportSent ? "#22c55e" : "#a855f7",
                      border: reportSent ? "1px solid rgba(34,197,94,0.25)" : "1px solid rgba(168,85,247,0.30)",
                    }}
                  >
                    {reportSending
                      ? <><Loader2 size={11} className="animate-spin" /> Sending…</>
                      : reportSent
                        ? <><CheckCircle2 size={11} /> Sent to Telegram</>
                        : <>📨 Send Report to Telegram</>
                    }
                  </button>
                </>
              )}
            </div>
          )}

          {/* Health panel */}
          {showHealth && (
            <div
              className="flex-shrink-0 border-b px-5 py-3"
              style={{ backgroundColor: "#0d1117", borderColor: "rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor:
                        healthResult?.status === "critical" ? "#ef4444" :
                        healthResult?.status === "warning"  ? "#f59e0b" :
                        healthResult?.status === "ok"       ? "#22c55e" :
                        "rgba(255,255,255,0.25)",
                    }}
                  />
                  <span className="text-xs font-semibold text-white">
                    {healthResult?.status === "critical" ? "Critical errors detected" :
                     healthResult?.status === "warning"  ? "Warnings detected" :
                     healthResult?.status === "ok"       ? "All systems healthy" :
                     "Health unknown"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {healthResult && (
                    <span className="text-xs" style={{ color: "rgba(255,255,255,0.30)" }}>
                      {new Date(healthResult.lastChecked).toLocaleTimeString()}
                    </span>
                  )}
                  <button
                    onClick={() => void fetchHealth()}
                    disabled={healthLoading}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-opacity hover:opacity-80 disabled:opacity-40"
                    style={{ color: "rgba(255,255,255,0.40)", border: "1px solid rgba(255,255,255,0.10)" }}
                  >
                    <RefreshCw size={10} className={healthLoading ? "animate-spin" : ""} />
                    Refresh
                  </button>
                  <button onClick={() => setShowHealth(false)} style={{ color: "rgba(255,255,255,0.30)" }}>
                    <X size={13} />
                  </button>
                </div>
              </div>

              {healthResult && (
                <div className="flex flex-wrap gap-2">
                  <div
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                    style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <AlertCircle size={10} style={{ color: "rgba(255,255,255,0.40)" }} />
                    <span style={{ color: "rgba(255,255,255,0.55)" }}>
                      {healthResult.errorCount} error event{healthResult.errorCount !== 1 ? "s" : ""} in last 30 min
                    </span>
                  </div>
                  {healthResult.errors.slice(0, 4).map((e) => (
                    <div
                      key={e.action}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                      style={{
                        backgroundColor: healthResult.status === "critical"
                          ? "rgba(239,68,68,0.10)" : "rgba(245,158,11,0.10)",
                        border: healthResult.status === "critical"
                          ? "1px solid rgba(239,68,68,0.20)" : "1px solid rgba(245,158,11,0.20)",
                        color: healthResult.status === "critical" ? "#ef4444" : "#f59e0b",
                      }}
                    >
                      {e.action} <span style={{ opacity: 0.7 }}>×{e.count}</span>
                    </div>
                  ))}
                  {healthResult.warnings.map((w, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                      style={{ backgroundColor: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      {w}
                    </div>
                  ))}
                </div>
              )}

              {!healthResult && !healthLoading && (
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.30)" }}>
                  No health data yet — refreshing…
                </p>
              )}
            </div>
          )}

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
                      Ask anything about the codebase. Load files from the explorer for direct access, then Apply Changes to commit them to GitHub.
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

              {messages.map((msg, i) => (
                <MessageBubble
                  key={i}
                  msg={msg}
                  knownFiles={knownFilePaths}
                  onApply={(state) => { setApplyModal(state); setApplyError(""); }}
                />
              ))}
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

        {/* ── Right sidebar (file explorer + deploy panel) ── */}
        <RightSidebar
          files={repoFiles}
          loadedFiles={loadedFiles}
          loading={filesLoading}
          githubConfigured={githubReady}
          onToggleFile={toggleFile}
          onPreviewFile={openPreview}
          currentBranch={currentBranch}
          sessionChanges={sessionChanges}
          deployStatus={deployStatus}
          deployUrl={deployUrl}
          onDeploy={() => void deployBranch()}
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

      {/* ── Apply Change modal ── */}
      {applyModal && (
        <ApplyModal
          state={applyModal}
          currentBranch={currentBranch}
          onClose={() => { setApplyModal(null); setApplyError(""); }}
          onApply={applyChange}
          loading={applyLoading}
          error={applyError}
        />
      )}
    </AdminLayout>
  );
}
