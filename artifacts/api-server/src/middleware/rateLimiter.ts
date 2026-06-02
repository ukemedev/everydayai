import rateLimit, { type Options } from "express-rate-limit";
import type { Request, Response } from "express";

function makeHandler(message: string): Options["handler"] {
  return (req: Request, res: Response) => {
    console.log("Rate limit hit:", req.ip, req.path);
    res.status(429).json({ error: message });
  };
}

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler("Too many requests. Please try again later."),
});

export const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler("Too many messages. Please wait a moment."),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler("Too many attempts. Please wait 15 minutes."),
});

export const analyzeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler("Too many requests. Please wait a moment."),
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler("Too many uploads. Please wait a moment."),
});

export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler("Too many requests."),
});

export const publicPollingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler("Too many requests. Please slow down."),
});

export const publicAgentInfoLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler("Too many requests. Please try again later."),
});

export const deployLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler("Too many deployment attempts. Please wait an hour."),
});
