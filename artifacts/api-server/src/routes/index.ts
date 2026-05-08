import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import toolsRouter from "./tools";
import googleRouter from "./google";
import automationsRouter from "./automations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatRouter);
router.use(toolsRouter);
router.use(googleRouter);
router.use(automationsRouter);

export default router;
