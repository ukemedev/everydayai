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

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatRouter);
router.use(toolsRouter);
router.use(googleRouter);
router.use(automationsRouter);
router.use(telegramRouter);
router.use(adminRouter);
router.use(blogRouter);
router.use(agentsRouter);

export default router;
