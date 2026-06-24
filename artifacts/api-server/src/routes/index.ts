import { Router, type IRouter, type RequestHandler } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import testChatRouter from "./testChat";
import adminRouter from "./admin";
import agentsRouter from "./agents";
import toolsRouter from "./tools";
import keysRouter from "./keys";
import billingRouter from "./billing";
import documentsRouter from "./documents";
import conversationsRouter from "./conversations";
import whatsappRouter from "./whatsapp";
import publicMessagesRouter from "./publicMessages";
import uploadRouter from "./upload";
import authEmailRouter from "./authEmail";
import analyticsRouter from "./analytics";
import {
  generalLimiter,
  chatLimiter,
  authLimiter,
  uploadLimiter,
  makeWebhookLimiter,
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
router.use("/documents", uploadLimiter);
router.use("/upload", uploadLimiter);
router.use("/public/conversations/messages", publicPollingLimiter);
router.use("/public/agents", publicAgentInfoLimiter);

// ── JWT auth ──────────────────────────────────────────────────────────────────
router.use("/whatsapp/webhook", makeWebhookLimiter());
router.use("/whatsapp/setup", requireAuth as RequestHandler, deployLimiter);
router.use("/whatsapp/deployment", requireAuth as RequestHandler, deployLimiter);

router.use("/keys", requireAuth as RequestHandler);
router.use("/billing", requireAuth as RequestHandler);
router.use("/conversations", requireAuth as RequestHandler);
router.use("/documents", requireAuth as RequestHandler);
router.use("/analytics", requireAuth as RequestHandler);
router.use("/agents", requireAuth as RequestHandler);

// ── Routers ───────────────────────────────────────────────────────────────────
router.use(healthRouter);
router.use(chatRouter);
router.use(testChatRouter);
router.use(adminRouter);
router.use(agentsRouter);
router.use(toolsRouter);
router.use(keysRouter);
router.use(billingRouter);
router.use(documentsRouter);
router.use(uploadRouter);
router.use(authEmailRouter);
router.use(analyticsRouter);
router.use(conversationsRouter);
router.use(whatsappRouter);
router.use(publicMessagesRouter);

export default router;