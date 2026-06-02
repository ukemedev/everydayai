import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.post("/devbot/capture-error", (req, res) => {
  const { pageUrl, errorMessage, errorStack, component, severity } = req.body as {
    pageUrl?: string;
    errorMessage?: string;
    errorStack?: string;
    component?: string;
    severity?: string;
  };
  req.log.error(
    { pageUrl, component, severity, errorStack },
    `[ClientError] ${errorMessage ?? "(no message)"}`,
  );
  res.status(200).json({ ok: true });
});

export default router;
