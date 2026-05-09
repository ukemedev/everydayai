import { createHmac } from "node:crypto";
import { Router } from "express";
import type { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { logAudit } from "../lib/auditLog.js";

const router = Router();

// ─── Plan config ──────────────────────────────────────────────────────────────

const PLAN_AMOUNTS: Record<string, number> = {
  starter:  800000,   // ₦8,000 in kobo
  pro:      2400000,  // ₦24,000 in kobo
  business: 5600000,  // ₦56,000 in kobo
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function getPaystackKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY not configured");
  return key;
}

async function paystackPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.paystack.co${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getPaystackKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<{ status: boolean; message: string; data: Record<string, unknown> }>;
}

// ─── POST /api/payments/paystack/initialize ────────────────────────────────

router.post("/payments/paystack/initialize", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  // Verify user
  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { plan } = req.body as { plan?: string };
  if (!plan || !PLAN_AMOUNTS[plan]) {
    res.status(400).json({ error: "Invalid plan. Must be starter, pro, or business." });
    return;
  }

  const amount    = PLAN_AMOUNTS[plan];
  const email     = user.email;
  if (!email) { res.status(400).json({ error: "User email not found" }); return; }

  const reference = `everydayai_${plan}_${user.id}_${Date.now()}`;

  try {
    const result = await paystackPost("/transaction/initialize", {
      email,
      amount,
      reference,
      metadata: { user_id: user.id, plan, custom_fields: [] },
      callback_url: `${process.env.VITE_APP_URL ?? ""}/dashboard`,
    });

    if (!result.status) {
      req.log.error({ result }, "Paystack initialize failed");
      res.status(502).json({ error: result.message ?? "Payment initialization failed" });
      return;
    }

    const authorizationUrl = result.data.authorization_url as string;
    req.log.info({ userId: user.id, plan, reference }, "Paystack transaction initialized");
    res.json({ authorizationUrl, reference });
  } catch (err) {
    req.log.error({ err }, "Paystack initialize error");
    res.status(502).json({ error: "Failed to initialize payment" });
  }
});

// ─── POST /api/payments/paystack/webhook ──────────────────────────────────

router.post("/payments/paystack/webhook", async (req: Request, res: Response) => {
  // Verify signature
  const signature = req.headers["x-paystack-signature"] as string | undefined;
  if (!signature) { res.status(400).json({ error: "Missing signature" }); return; }

  let secretKey: string;
  try { secretKey = getPaystackKey(); }
  catch { res.status(503).json({ error: "Service unavailable" }); return; }

  const rawBody = JSON.stringify(req.body);
  const hash = createHmac("sha512", secretKey).update(rawBody).digest("hex");
  if (hash !== signature) {
    req.log.warn({ signature, hash }, "Paystack webhook signature mismatch");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  const event = req.body as {
    event: string;
    data: {
      reference: string;
      amount: number;
      customer: { email: string };
      metadata?: { user_id?: string; plan?: string };
    };
  };

  // Acknowledge immediately (Paystack expects a 200 fast)
  res.status(200).json({ received: true });

  if (event.event !== "charge.success") return;

  const { reference, amount, customer, metadata } = event.data;
  const plan   = metadata?.plan;
  const userId = metadata?.user_id;

  if (!plan || !reference) {
    req.log.warn({ reference, plan }, "Paystack webhook missing plan/reference");
    return;
  }

  const sb = getServiceClient();
  if (!sb) return;

  try {
    // Resolve user_id: prefer metadata, fall back to email lookup
    let resolvedUserId = userId;
    if (!resolvedUserId) {
      const { data: users } = await sb
        .from("profiles")
        .select("id")
        .eq("email", customer.email)
        .limit(1);
      resolvedUserId = users?.[0]?.id as string | undefined;
    }

    if (!resolvedUserId) {
      req.log.error({ email: customer.email }, "Paystack webhook: user not found");
      return;
    }

    // Update plan
    await sb.from("profiles").update({ plan }).eq("id", resolvedUserId);

    // Store payment record
    await sb.from("payments").insert({
      user_id:   resolvedUserId,
      reference,
      plan,
      amount,
      status:    "success",
    });

    req.log.info({ userId: resolvedUserId, plan, reference }, "Plan upgraded via Paystack webhook");

    void logAudit({
      user_id:     resolvedUserId,
      action:      "payment_received",
      resource:    "payment",
      metadata:    { plan, amount: amount / 100, reference },
      req,
    });
  } catch (err) {
    req.log.error({ err, reference }, "Paystack webhook processing error");
  }
});

export default router;
