export interface RepoFile {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

export interface SearchResult {
  path: string;
  matches: string[];
}

function getGithubHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function getRepo(): string {
  const repo = process.env.GITHUB_REPO;
  if (!repo) throw new Error("GITHUB_REPO env var is not set (expected format: owner/repo)");
  return repo;
}

// ── getRepoFiles ──────────────────────────────────────────────────────────────
// Returns the full recursive file tree of the repository.
// Skips binary/large files and common non-source directories.

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "coverage",
  ".pnpm-store", "public", "attached_assets", "screenshots",
]);

const SOURCE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "json", "yaml", "yml", "md", "toml", "env",
  "css", "html", "sql", "sh", "mts",
]);

function isSourceFile(path: string): boolean {
  const parts = path.split("/");
  for (const part of parts) {
    if (SKIP_DIRS.has(part)) return false;
  }
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return SOURCE_EXTENSIONS.has(ext);
}

export async function getRepoFiles(): Promise<RepoFile[]> {
  const repo = getRepo();
  const headers = getGithubHeaders();

  // Get default branch first
  const repoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
  if (!repoRes.ok) throw new Error(`GitHub API error fetching repo: ${repoRes.status}`);
  const repoData = await repoRes.json() as { default_branch: string };
  const branch = repoData.default_branch ?? "main";

  // Get full recursive tree
  const treeRes = await fetch(
    `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`,
    { headers }
  );
  if (!treeRes.ok) throw new Error(`GitHub API error fetching tree: ${treeRes.status}`);

  const treeData = await treeRes.json() as {
    tree: Array<{ path: string; type: string; size?: number }>;
    truncated: boolean;
  };

  const files: RepoFile[] = treeData.tree
    .filter((item) => item.type === "blob" && isSourceFile(item.path))
    .map((item) => ({
      path: item.path,
      type: "blob",
      size: item.size,
    }));

  return files;
}

// ── getFileContent ────────────────────────────────────────────────────────────
// Fetches a single file's content from GitHub and returns it as a string.
// Returns null if the file is too large or not found.

const MAX_FILE_SIZE = 150_000; // 150KB

export async function getFileContent(path: string): Promise<string | null> {
  const repo = getRepo();
  const headers = getGithubHeaders();

  const res = await fetch(
    `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`,
    { headers }
  );

  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`GitHub API error fetching ${path}: ${res.status}`);
  }

  const data = await res.json() as {
    type: string;
    size: number;
    content?: string;
    encoding?: string;
    download_url?: string;
  };

  if (data.type !== "file") return null;
  if (data.size > MAX_FILE_SIZE) return `[File too large to display: ${Math.round(data.size / 1024)}KB]`;

  if (data.encoding === "base64" && data.content) {
    return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
  }

  if (data.download_url) {
    const dlRes = await fetch(data.download_url, { headers });
    if (!dlRes.ok) return null;
    return dlRes.text();
  }

  return null;
}

// ── searchFiles ───────────────────────────────────────────────────────────────
// Searches file paths for a query string (fast path-based search).
// For up to 10 path matches, also searches file content for the query.

export async function searchFiles(query: string, files?: RepoFile[]): Promise<SearchResult[]> {
  const allFiles = files ?? await getRepoFiles();
  const q = query.toLowerCase();

  // First: path-based matches
  const pathMatches = allFiles.filter((f) => f.path.toLowerCase().includes(q));

  if (pathMatches.length === 0) return [];

  const results: SearchResult[] = [];

  // For a limited set, also check content
  const toSearch = pathMatches.slice(0, 12);

  await Promise.all(
    toSearch.map(async (file) => {
      const content = await getFileContent(file.path).catch(() => null);
      const matches: string[] = [];

      if (content) {
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(q)) {
            // Capture line with a little context
            const start = Math.max(0, i - 1);
            const end = Math.min(lines.length - 1, i + 1);
            const snippet = lines.slice(start, end + 1).join("\n").trim();
            if (snippet && !matches.includes(snippet)) {
              matches.push(snippet);
              if (matches.length >= 5) break;
            }
          }
        }
      } else {
        matches.push(`[matched by filename: ${file.path}]`);
      }

      results.push({ path: file.path, matches });
    })
  );

  return results.sort((a, b) => b.matches.length - a.matches.length);
}

// ── detectFilePaths ───────────────────────────────────────────────────────────
// Extracts likely file paths from a user message.

export function detectFilePaths(message: string, knownFiles: string[]): string[] {
  const found = new Set<string>();

  // Exact matches against known file list (case-insensitive)
  const msgLower = message.toLowerCase();
  for (const f of knownFiles) {
    const name = f.split("/").pop()?.toLowerCase() ?? "";
    if (name && msgLower.includes(name)) {
      found.add(f);
    }
  }

  // Explicit path patterns like src/routes/devbot.ts or artifacts/api-server/...
  const pathPattern = /(?:[\w-]+\/)+[\w.-]+\.(?:ts|tsx|js|jsx|json|md|yaml|yml|toml|css)/g;
  const explicitPaths = message.match(pathPattern) ?? [];
  for (const p of explicitPaths) {
    const match = knownFiles.find((f) => f.endsWith(p) || f === p);
    if (match) found.add(match);
  }

  return [...found].slice(0, 8);
}
