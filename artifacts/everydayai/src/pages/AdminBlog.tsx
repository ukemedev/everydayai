import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/lib/supabase";
import { Plus, Pencil, Trash2, ArrowLeft } from "lucide-react";

const CATEGORIES = ["General", "AI News", "Tutorial", "Tips"];

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  content: string;
  cover_image: string;
  author: string;
  published: boolean;
  created_at: string;
  updated_at: string;
}

interface PostForm {
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  content: string;
  cover_image: string;
  author: string;
  published: boolean;
}

const emptyForm = (): PostForm => ({
  title:       "",
  slug:        "",
  category:    "General",
  excerpt:     "",
  content:     "",
  cover_image: "",
  author:      "EverydayAI Team",
  published:   false,
});

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function StatusBadge({ published }: { published: boolean }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={
        published
          ? { backgroundColor: "rgba(16,185,129,0.12)", color: "#10b981" }
          : { backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.50)" }
      }
    >
      {published ? "Published" : "Draft"}
    </span>
  );
}

// ─── Editor ──────────────────────────────────────────────────────────────────

interface EditorProps {
  initial?: BlogPost;
  onSave: (form: PostForm) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

function Editor({ initial, onSave, onCancel, saving }: EditorProps) {
  const [form, setForm] = useState<PostForm>(
    initial
      ? {
          title:       initial.title,
          slug:        initial.slug,
          category:    initial.category,
          excerpt:     initial.excerpt,
          content:     initial.content,
          cover_image: initial.cover_image,
          author:      initial.author,
          published:   initial.published,
        }
      : emptyForm()
  );

  function set<K extends keyof PostForm>(key: K, val: PostForm[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleTitleChange(t: string) {
    setForm((f) => ({ ...f, title: t, slug: f.slug || slugify(t) }));
  }

  const inputCls = "w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none transition-colors";
  const inputStyle = {
    backgroundColor: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
  };
  const labelCls = "block text-xs font-semibold mb-1.5";
  const labelStyle = { color: "rgba(255,255,255,0.50)" };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 text-sm transition-colors"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          <ArrowLeft size={15} />
          Back
        </button>
        <span className="text-white font-semibold text-lg">
          {initial ? "Edit Post" : "New Post"}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Title */}
        <div className="md:col-span-2">
          <label className={labelCls} style={labelStyle}>Title</label>
          <input
            className={inputCls}
            style={inputStyle}
            placeholder="Post title"
            value={form.title}
            onChange={(e) => handleTitleChange(e.target.value)}
          />
        </div>

        {/* Slug */}
        <div>
          <label className={labelCls} style={labelStyle}>Slug</label>
          <input
            className={inputCls}
            style={inputStyle}
            placeholder="post-slug"
            value={form.slug}
            onChange={(e) => set("slug", slugify(e.target.value))}
          />
        </div>

        {/* Category */}
        <div>
          <label className={labelCls} style={labelStyle}>Category</label>
          <select
            className={inputCls}
            style={{ ...inputStyle, appearance: "none" }}
            value={form.category}
            onChange={(e) => set("category", e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c} style={{ backgroundColor: "#0d1117" }}>{c}</option>
            ))}
          </select>
        </div>

        {/* Author */}
        <div>
          <label className={labelCls} style={labelStyle}>Author</label>
          <input
            className={inputCls}
            style={inputStyle}
            placeholder="Author name"
            value={form.author}
            onChange={(e) => set("author", e.target.value)}
          />
        </div>

        {/* Cover Image URL */}
        <div>
          <label className={labelCls} style={labelStyle}>Cover Image URL</label>
          <input
            className={inputCls}
            style={inputStyle}
            placeholder="https://..."
            value={form.cover_image}
            onChange={(e) => set("cover_image", e.target.value)}
          />
        </div>

        {/* Excerpt */}
        <div className="md:col-span-2">
          <label className={labelCls} style={labelStyle}>Excerpt</label>
          <textarea
            className={inputCls}
            style={{ ...inputStyle, resize: "vertical", minHeight: "72px" }}
            placeholder="Short description shown in the blog listing..."
            value={form.excerpt}
            onChange={(e) => set("excerpt", e.target.value)}
          />
        </div>

        {/* Content */}
        <div className="md:col-span-2">
          <label className={labelCls} style={labelStyle}>Content</label>
          <textarea
            className={inputCls}
            style={{ ...inputStyle, resize: "vertical", minHeight: "220px" }}
            placeholder="Full article content..."
            value={form.content}
            onChange={(e) => set("content", e.target.value)}
          />
        </div>
      </div>

      {/* Published toggle + actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
        {/* Toggle */}
        <button
          type="button"
          onClick={() => set("published", !form.published)}
          className="flex items-center gap-3 text-sm"
        >
          <span
            className="relative inline-flex w-10 h-5 rounded-full transition-colors duration-200"
            style={{ backgroundColor: form.published ? "#3b5bfc" : "rgba(255,255,255,0.15)" }}
          >
            <span
              className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200"
              style={{ transform: form.published ? "translateX(20px)" : "translateX(0)" }}
            />
          </span>
          <span style={{ color: form.published ? "#fff" : "rgba(255,255,255,0.45)" }}>
            {form.published ? "Published" : "Draft"}
          </span>
        </button>

        {/* Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.65)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.title.trim() || !form.slug.trim() || !form.content.trim()}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity"
            style={{
              backgroundColor: "#3b5bfc",
              opacity: saving || !form.title.trim() || !form.slug.trim() || !form.content.trim() ? 0.5 : 1,
            }}
          >
            {saving ? "Saving…" : "Save Post"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminBlog() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [view, setView] = useState<"list" | "new" | "edit">("list");
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/blog", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { posts: BlogPost[] };
      setPosts(data.posts);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  async function handleSave(form: PostForm) {
    setSaving(true);
    try {
      const token = await getToken();
      const url  = view === "edit" && editing ? `/api/admin/blog/${editing.id}` : "/api/admin/blog";
      const method = view === "edit" ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed");
      await fetchPosts();
      setView("list");
      setEditing(null);
    } catch {
      alert("Failed to save post. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this post? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      const token = await getToken();
      await fetch(`/api/admin/blog/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setPosts((p) => p.filter((x) => x.id !== id));
    } catch {
      alert("Failed to delete post.");
    } finally {
      setDeletingId(null);
    }
  }

  function openEdit(post: BlogPost) {
    setEditing(post);
    setView("edit");
  }

  function openNew() {
    setEditing(null);
    setView("new");
  }

  function cancel() {
    setView("list");
    setEditing(null);
  }

  return (
    <AdminLayout activeItemId="blog">
      <div className="flex-1 p-6 md:p-8">
        {/* Header */}
        {view === "list" && (
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-white">Blog</h1>
              <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.40)" }}>
                Manage posts published on EverydayAI
              </p>
            </div>
            <button
              onClick={openNew}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#3b5bfc" }}
            >
              <Plus size={15} />
              New Post
            </button>
          </div>
        )}

        {/* List view */}
        {view === "list" && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 rounded-full border-2 border-[#3b5bfc] border-t-transparent animate-spin" />
              </div>
            ) : error ? (
              <p className="text-sm py-10 text-center" style={{ color: "#f87171" }}>
                Could not load posts — check the API connection.
              </p>
            ) : posts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
                  No posts yet.
                </p>
                <button
                  onClick={openNew}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{ backgroundColor: "#3b5bfc" }}
                >
                  Write your first post
                </button>
              </div>
            ) : (
              <div
                className="overflow-x-auto rounded-xl"
                style={{ border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <table className="w-full text-sm min-w-[600px]">
                  <thead>
                    <tr
                      style={{
                        backgroundColor: "#131a2e",
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      {["Title", "Category", "Status", "Created", "Actions"].map((col) => (
                        <th
                          key={col}
                          className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                          style={{ color: "rgba(255,255,255,0.35)" }}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {posts.map((post, i) => (
                      <tr
                        key={post.id}
                        style={{
                          backgroundColor: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                        }}
                      >
                        {/* Title */}
                        <td className="px-4 py-3">
                          <span className="font-medium text-white truncate block max-w-[220px]" title={post.title}>
                            {post.title}
                          </span>
                          {post.excerpt && (
                            <span
                              className="text-xs truncate block max-w-[220px]"
                              style={{ color: "rgba(255,255,255,0.35)" }}
                              title={post.excerpt}
                            >
                              {post.excerpt}
                            </span>
                          )}
                        </td>

                        {/* Category */}
                        <td className="px-4 py-3">
                          <span
                            className="text-xs px-2 py-0.5 rounded font-medium"
                            style={{
                              backgroundColor: "rgba(59,91,252,0.12)",
                              color: "#3b5bfc",
                            }}
                          >
                            {post.category}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <StatusBadge published={post.published} />
                        </td>

                        {/* Created */}
                        <td
                          className="px-4 py-3 whitespace-nowrap"
                          style={{ color: "rgba(255,255,255,0.50)" }}
                        >
                          {formatDate(post.created_at)}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openEdit(post)}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                              style={{
                                backgroundColor: "rgba(255,255,255,0.06)",
                                color: "rgba(255,255,255,0.65)",
                              }}
                            >
                              <Pencil size={12} />
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(post.id)}
                              disabled={deletingId === post.id}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                              style={{
                                backgroundColor: "rgba(248,113,113,0.10)",
                                color: "#f87171",
                                opacity: deletingId === post.id ? 0.5 : 1,
                              }}
                            >
                              <Trash2 size={12} />
                              {deletingId === post.id ? "…" : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Editor view */}
        {(view === "new" || view === "edit") && (
          <Editor
            initial={editing ?? undefined}
            onSave={handleSave}
            onCancel={cancel}
            saving={saving}
          />
        )}
      </div>
    </AdminLayout>
  );
}
