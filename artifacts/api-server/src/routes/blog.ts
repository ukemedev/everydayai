import { Router } from "express";
import type { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { sanitizeText } from "../lib/sanitize.js";

const router = Router();

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function requireAdmin(req: Request, res: Response) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing token" });
    return null;
  }
  const token = auth.slice(7);
  const sb = getServiceClient();
  if (!sb) {
    res.status(500).json({ error: "Service not configured" });
    return null;
  }
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: "Invalid token" });
    return null;
  }
  const { data: profile } = await sb
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) {
    res.status(403).json({ error: "Not an admin" });
    return null;
  }
  return { sb, user };
}

// ─── GET /api/admin/blog ──────────────────────────────────────────────────────

router.get("/admin/blog", async (req: Request, res: Response) => {
  const result = await requireAdmin(req, res);
  if (!result) return;
  const { sb } = result;

  const { data, error } = await sb
    .from("blog_posts")
    .select("id, title, slug, category, excerpt, author, cover_image, published, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    req.log.error({ err: error }, "failed to fetch blog posts");
    res.status(500).json({ error: "Failed to fetch blog posts" });
    return;
  }

  req.log.info({ count: data?.length ?? 0 }, "admin blog posts fetched");
  res.json({ posts: data ?? [] });
});

// ─── POST /api/admin/blog ─────────────────────────────────────────────────────

router.post("/admin/blog", async (req: Request, res: Response) => {
  const result = await requireAdmin(req, res);
  if (!result) return;
  const { sb } = result;

  const { title, slug, category, excerpt, content, cover_image, author, published } = req.body as {
    title: string;
    slug: string;
    category?: string;
    excerpt?: string;
    content: string;
    cover_image?: string;
    author?: string;
    published?: boolean;
  };

  if (!title?.trim() || !slug?.trim() || !content?.trim()) {
    res.status(400).json({ error: "title, slug, and content are required" });
    return;
  }

  if (title.trim().length > 200) {
    res.status(400).json({ error: "title must be 200 characters or fewer" });
    return;
  }

  const safeSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
  if (!safeSlug) {
    res.status(400).json({ error: "slug contains no valid characters" });
    return;
  }

  const { data, error } = await sb
    .from("blog_posts")
    .insert({
      title:       sanitizeText(title.trim()),
      slug:        safeSlug,
      category:    category ? sanitizeText(category) : "General",
      excerpt:     excerpt  ? sanitizeText(excerpt)  : "",
      content:     sanitizeText(content.trim()),
      cover_image: cover_image ?? "",
      author:      author  ? sanitizeText(author)  : "EverydayAI Team",
      published:   published ?? false,
    })
    .select()
    .single();

  if (error) {
    req.log.error({ err: error }, "failed to create blog post");
    res.status(500).json({ error: "Failed to create post" });
    return;
  }

  req.log.info({ id: data.id }, "blog post created");
  res.status(201).json({ post: data });
});

// ─── PATCH /api/admin/blog/:id ────────────────────────────────────────────────

router.patch("/admin/blog/:id", async (req: Request, res: Response) => {
  const result = await requireAdmin(req, res);
  if (!result) return;
  const { sb } = result;
  const { id } = req.params;

  const allowed = ["title", "slug", "category", "excerpt", "content", "cover_image", "author", "published"] as const;
  type AllowedKey = typeof allowed[number];
  const updates: Partial<Record<AllowedKey, unknown>> = {};
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }
  (updates as Record<string, unknown>).updated_at = new Date().toISOString();

  const { data, error } = await sb
    .from("blog_posts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    req.log.error({ err: error, id }, "failed to update blog post");
    res.status(500).json({ error: "Failed to update post" });
    return;
  }

  req.log.info({ id }, "blog post updated");
  res.json({ post: data });
});

// ─── DELETE /api/admin/blog/:id ───────────────────────────────────────────────

router.delete("/admin/blog/:id", async (req: Request, res: Response) => {
  const result = await requireAdmin(req, res);
  if (!result) return;
  const { sb } = result;
  const { id } = req.params;

  const { error } = await sb
    .from("blog_posts")
    .delete()
    .eq("id", id);

  if (error) {
    req.log.error({ err: error, id }, "failed to delete blog post");
    res.status(500).json({ error: "Failed to delete post" });
    return;
  }

  req.log.info({ id }, "blog post deleted");
  res.json({ success: true });
});

export default router;
