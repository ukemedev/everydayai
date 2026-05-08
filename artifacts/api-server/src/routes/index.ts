import { Router, type IRouter } from "express";
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
import {
  generalLimiter,
  chatLimiter,
  authLimiter,
  analyzeLimiter,
} from "../middleware/rateLimiter";

const router: IRouter = Router();

// ── Global limiter ────────────────────────────────────────────────────────────
router.use(generalLimiter);

// ── Route-specific limiters (applied before the routers below) ────────────────
router.post("/chat", chatLimiter);
router.post("/tools/analyze", analyzeLimiter);
router.post("/automations/analyze", analyzeLimiter);
router.use("/admin", authLimiter);

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

export default router;
