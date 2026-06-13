// POST /api/auth/welcome          — sends welcome email after signup
// POST /api/auth/check-password   — validates password strength (pre-flight)

import { Router } from "express";
import type { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { sendEmail, isEmailConfigured } from "../lib/email.js";
import { welcomeEmailHtml, welcomeEmailSubject } from "../lib/emails/welcome.js";
import { checkPasswordStrength } from "../lib/passwordStrength.js";

const router = Router();

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// Track which users have already received the welcome email (in-memory guard
// against double-sends on fast double-clicks / re-renders).
const welcomeSent = new Set<string>();

router.post("/auth/welcome", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  const sb    = getServiceClient();
  if (!sb) { res.status(200).json({ ok: true, skipped: "no_service_client" }); return; }

  // Verify the JWT and get the user
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Idempotency guard
  if (welcomeSent.has(user.id)) {
    res.status(200).json({ ok: true, skipped: "already_sent" });
    return;
  }

  if (!isEmailConfigured()) {
    res.status(200).json({ ok: true, skipped: "email_not_configured" });
    return;
  }

  const email     = user.email ?? "";
  const fullName  = (user.user_metadata?.full_name as string | undefined) ?? "";
  const firstName = fullName.split(" ")[0] ?? fullName;

  if (!email) {
    res.status(200).json({ ok: true, skipped: "no_email" });
    return;
  }

  welcomeSent.add(user.id);

  const result = await sendEmail({
    to:      email,
    subject: welcomeEmailSubject(),
    html:    welcomeEmailHtml({ firstName: firstName || (email.split("@")[0] ?? "there"), email }),
  });

  if (!result.ok) {
    req.log.warn({ userId: user.id, error: result.error }, "Welcome email failed to send");
    welcomeSent.delete(user.id); // allow retry
  } else {
    req.log.info({ userId: user.id, emailId: result.id }, "Welcome email sent");
  }

  res.status(200).json({ ok: true, sent: result.ok });
});

// ─── POST /api/auth/check-password ───────────────────────────────────────────
// Pre-flight password strength check called by the frontend before signup
// or password-reset. No auth required — just validates the password.
//
// 200  { ok: true, score, suggestions, warning }  — score >= 3, acceptable
// 422  { error: "WEAK_PASSWORD", score, suggestions, warning }  — score < 3
// 400  { error: "MISSING_PASSWORD" }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/auth/check-password", async (req: Request, res: Response) => {
  const { password } = req.body as { password?: unknown };

  if (typeof password !== "string" || !password) {
    res.status(400).json({ error: "MISSING_PASSWORD" });
    return;
  }

  const result = checkPasswordStrength(password);

  if (!result.isAcceptable) {
    res.status(422).json({
      error:       "WEAK_PASSWORD",
      score:       result.score,
      suggestions: result.suggestions,
      warning:     result.warning,
    });
    return;
  }

  res.json({
    ok:          true,
    score:       result.score,
    suggestions: result.suggestions,
    warning:     result.warning,
  });
});

export default router;
