import { Router, type IRouter, type RequestHandler } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import toolsRouter from "./tools";
import googleRouter from "./google";
import telegramRouter from "./telegram";
import adminRouter from "./admin";
import blogRouter from "./blog";
import agentsRouter from "./agents";
import paystackRouter from "./paystack";
import keysRouter from "./keys";
import billingRouter from "./billing";
import documentsRouter from "./documents";
import {
  generalLimiter,
  chatLimiter,
  authLimiter,
  uploadLimiter,
  webhookLimiter,
} from "../middleware/rateLimiter";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

// ── Global rate limiter ───────────────────────────────────────────────────────
router.use(generalLimiter);

// ── Route-specific rate limiters ──────────────────────────────────────────────
router.post("/chat", chatLimiter);
router.use("/admin", authLimiter);
router.use("/auth/google", authLimiter);
router.use("/documents", uploadLimiter);
router.use("/telegram/webhook", webhookLimiter);

// ── JWT auth — applied before routers, only to protected paths ────────────────

// All tools routes
router.use("/tools", requireAuth as RequestHandler);

// All google routes
router.use("/google", requireAuth as RequestHandler);

// Specific telegram routes (webhook is public — do not protect it)
router.use("/telegram/setup", requireAuth as RequestHandler);
router.use("/telegram/deployment", requireAuth as RequestHandler);

// All keys routes
router.use("/keys", requireAuth as RequestHandler);

// Billing route
router.use("/billing", requireAuth as RequestHandler);

// Documents upload route
router.use("/documents", requireAuth as RequestHandler);

// ── Routers ───────────────────────────────────────────────────────────────────
router.use(healthRouter);
router.use(chatRouter);
router.use(toolsRouter);
router.use(googleRouter);
router.use(telegramRouter);
router.use(adminRouter);
router.use(blogRouter);
router.use(agentsRouter);
router.use(paystackRouter);
router.use(keysRouter);
router.use(billingRouter);
router.use(documentsRouter);

export default router;
