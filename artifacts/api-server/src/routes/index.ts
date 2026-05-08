import { Router, type IRouter, type RequestHandler } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import toolsRouter from "./tools";
import googleRouter from "./google";
import automationsRouter from "./automations";
import telegramRouter from "./telegram";
import adminRouter from "./admin";
import blogRouter from "./blog";
import agentsRouter from "./agents";
import paystackRouter from "./paystack";
import keysRouter from "./keys";
import {
  generalLimiter,
  chatLimiter,
  authLimiter,
  analyzeLimiter,
} from "../middleware/rateLimiter";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

// ── Global rate limiter ───────────────────────────────────────────────────────
router.use(generalLimiter);

// ── Route-specific rate limiters ──────────────────────────────────────────────
router.post("/chat", chatLimiter);
router.post("/tools/analyze", analyzeLimiter);
router.post("/automations/analyze", analyzeLimiter);
router.use("/admin", authLimiter);

// ── JWT auth — applied before routers, only to protected paths ────────────────

// All tools routes
router.use("/tools", requireAuth as RequestHandler);

// All google routes
router.use("/google", requireAuth as RequestHandler);

// Specific telegram routes (webhook is public — do not protect it)
router.use("/telegram/setup", requireAuth as RequestHandler);
router.use("/telegram/deployment", requireAuth as RequestHandler);

// All automations routes except POST /automations/analyze (public)
router.use("/automations", ((req, res, next) => {
  if (req.path === "/analyze") return next();
  return (requireAuth as RequestHandler)(req, res, next);
}) as RequestHandler);

// All keys routes
router.use("/keys", requireAuth as RequestHandler);

// ── Routers ───────────────────────────────────────────────────────────────────
router.use(healthRouter);
router.use(chatRouter);
router.use(toolsRouter);
router.use(googleRouter);
router.use(automationsRouter);
router.use(telegramRouter);
router.use(adminRouter);
router.use(blogRouter);
router.use(agentsRouter);
router.use(paystackRouter);
router.use(keysRouter);

export default router;
