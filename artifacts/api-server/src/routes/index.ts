import { Router, type IRouter, type RequestHandler } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import googleRouter from "./google";
import telegramRouter from "./telegram";
import adminRouter from "./admin";
import blogRouter from "./blog";
import templatesRouter from "./templates";
import agentsRouter from "./agents";
import paystackRouter from "./paystack";
import keysRouter from "./keys";
import billingRouter from "./billing";
import documentsRouter from "./documents";
import conversationsRouter from "./conversations";
import whatsappRouter from "./whatsapp";
import messengerRouter from "./messenger";
import instagramRouter from "./instagram";
import uploadRouter from "./upload";
import authEmailRouter from "./authEmail";
import onboardingRouter from "./onboarding";
import analyticsRouter from "./analytics";
import {
  generalLimiter,
  chatLimiter,
  authLimiter,
  uploadLimiter,
  webhookLimiter,
  publicPollingLimiter,
  publicAgentInfoLimiter,
  deployLimiter,
} from "../middlewares/rateLimiter";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

// ── Global rate limiter ───────────────────────────────────────────────────────
router.use(generalLimiter);

// ── Route-specific rate limiters ──────────────────────────────────────────────
router.post("/chat", chatLimiter);
router.use("/admin", authLimiter);
router.use("/auth/google", authLimiter);
router.use("/documents", uploadLimiter);
router.use("/upload", uploadLimiter);
router.use("/telegram/webhook", webhookLimiter);
router.use("/public/conversations/messages", publicPollingLimiter);
router.use("/public/agents", publicAgentInfoLimiter);

// ── JWT auth — applied before routers, only to protected paths ────────────────

// All google routes
router.use("/google", requireAuth as RequestHandler);

// Specific telegram routes (webhook is public — do not protect it)
router.use("/telegram/setup", requireAuth as RequestHandler, deployLimiter);
router.use("/telegram/deployment", requireAuth as RequestHandler, deployLimiter);

// WhatsApp setup/deployment routes (webhook is public — do not protect it)
router.use("/whatsapp/webhook", webhookLimiter);
router.use("/whatsapp/setup", requireAuth as RequestHandler, deployLimiter);
router.use("/whatsapp/deployment", requireAuth as RequestHandler, deployLimiter);

// Messenger setup/deployment routes (webhook is public — do not protect it)
router.use("/messenger/webhook", webhookLimiter);
router.use("/messenger/setup", requireAuth as RequestHandler, deployLimiter);
router.use("/messenger/deployment", requireAuth as RequestHandler, deployLimiter);

// Instagram setup/deployment routes (webhook is public — do not protect it)
router.use("/instagram/webhook", webhookLimiter);
router.use("/instagram/setup", requireAuth as RequestHandler, deployLimiter);
router.use("/instagram/deployment", requireAuth as RequestHandler, deployLimiter);

// All keys routes
router.use("/keys", requireAuth as RequestHandler);

// Billing route
router.use("/billing", requireAuth as RequestHandler);

// Conversations routes (public/conversations/* is intentionally excluded)
router.use("/conversations", requireAuth as RequestHandler);

// Documents upload route
router.use("/documents", requireAuth as RequestHandler);

// Onboarding routes
router.use("/onboarding", requireAuth as RequestHandler);

// Analytics route
router.use("/analytics", requireAuth as RequestHandler);

// ── Routers ───────────────────────────────────────────────────────────────────
router.use(healthRouter);
router.use(chatRouter);
router.use(googleRouter);
router.use(telegramRouter);
router.use(adminRouter);
router.use(blogRouter);
router.use(templatesRouter);
router.use(agentsRouter);
router.use(paystackRouter);
router.use(keysRouter);
router.use(billingRouter);
router.use(documentsRouter);
router.use(uploadRouter);
router.use(authEmailRouter);
router.use(onboardingRouter);
router.use(analyticsRouter);
router.use(conversationsRouter);
router.use(whatsappRouter);
router.use(messengerRouter);
router.use(instagramRouter);

export default router;
