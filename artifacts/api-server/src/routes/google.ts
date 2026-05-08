import { Router } from "express";
import type { Request, Response } from "express";
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger.js";

const router = Router();

const CALLBACK_URL = `https://${process.env.REPLIT_DEV_DOMAIN}/api/auth/google/callback`;

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
];

function getOAuth2Client() {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set");
  }
  return new google.auth.OAuth2(clientId, clientSecret, CALLBACK_URL);
}

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── GET /api/auth/google ─────────────────────────────────────────────────────
// Starts OAuth flow. Expects ?userId=<uuid> query param.

router.get("/auth/google", (req: Request, res: Response) => {
  const userId = (req.query.userId as string | undefined)?.trim();
  if (!userId) {
    res.status(400).send("Missing userId query parameter");
    return;
  }

  let oauth2Client: ReturnType<typeof getOAuth2Client>;
  try {
    oauth2Client = getOAuth2Client();
  } catch (err) {
    logger.error({ err }, "Google OAuth client init failed");
    res.status(500).send("Google OAuth not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
    return;
  }

  const state = Buffer.from(JSON.stringify({ userId, ts: Date.now() })).toString("base64url");

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });

  req.log.info({ userId }, "Google OAuth flow started");
  res.redirect(authUrl);
});

// ─── GET /api/auth/google/callback ───────────────────────────────────────────

router.get("/auth/google/callback", async (req: Request, res: Response) => {
  const code  = req.query.code  as string | undefined;
  const state = req.query.state as string | undefined;
  const error = req.query.error as string | undefined;

  if (error) {
    req.log.warn({ error }, "Google OAuth denied by user");
    res.redirect("/dashboard?error=google_denied");
    return;
  }

  if (!code || !state) {
    res.status(400).send("Missing code or state");
    return;
  }

  let userId: string;
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
    userId = parsed.userId;
    if (!userId) throw new Error("No userId in state");
  } catch {
    res.status(400).send("Invalid state parameter");
    return;
  }

  let oauth2Client: ReturnType<typeof getOAuth2Client>;
  try {
    oauth2Client = getOAuth2Client();
  } catch (err) {
    logger.error({ err }, "Google OAuth client init failed in callback");
    res.status(500).send("Google OAuth not configured");
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : null;

    const sb = getServiceClient();

    const { error: dbErr } = await sb
      .from("integrations")
      .upsert(
        {
          user_id:       userId,
          provider:      "google",
          access_token:  tokens.access_token  ?? null,
          refresh_token: tokens.refresh_token ?? null,
          expires_at:    expiresAt,
        },
        { onConflict: "user_id,provider" }
      );

    if (dbErr) {
      logger.error({ err: dbErr, userId }, "Failed to save Google tokens to integrations table");
      res.send(`<!DOCTYPE html><html><head><title>Error</title></head><body style="background:#0a0f1e;color:white;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;flex-direction:column;gap:16px;"><div style="font-size:48px;">❌</div><h2>Save Failed</h2><p style="color:#888;">Could not save tokens. Please try again.</p><script>setTimeout(()=>window.close(),3000);</script></body></html>`);
      return;
    }

    req.log.info({ userId }, "Google OAuth tokens saved successfully");
    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Google Connected</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: #0a0f1e;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      text-align: center;
      padding: 40px;
    }
    .icon {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: rgba(34,197,94,0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
    }
    h1 { font-size: 18px; font-weight: 700; }
    p  { font-size: 14px; color: rgba(255,255,255,0.45); }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h1>Google Connected!</h1>
    <p>This window will close automatically…</p>
  </div>
  <script>
    setTimeout(function() { window.close(); }, 1800);
  </script>
</body>
</html>`);
  } catch (err) {
    logger.error({ err, userId }, "Google OAuth token exchange failed");
    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Connection Failed</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: #0a0f1e;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      text-align: center;
      padding: 40px;
    }
    .icon {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: rgba(239,68,68,0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
    }
    h1 { font-size: 18px; font-weight: 700; }
    p  { font-size: 14px; color: rgba(255,255,255,0.45); }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✕</div>
    <h1>Connection Failed</h1>
    <p>Something went wrong. Please try again.</p>
  </div>
  <script>
    setTimeout(function() { window.close(); }, 3000);
  </script>
</body>
</html>`);
  }
});

export default router;
