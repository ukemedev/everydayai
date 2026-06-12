// ─── queues.ts ────────────────────────────────────────────────────
// All BullMQ queue definitions for EverydayAI
//
// WHY this exists:
// → Every AI call goes through a queue — never blocks Express server
// → Jobs retry automatically on failure with exponential backoff
// → Redis memory stays clean — completed/failed jobs auto-removed
// → One file = one source of truth for all queue names and config
//
// NOTE: Queues are null when Redis is unavailable (REDIS_URL not set).
// Check queue availability before adding jobs.
//
// QUEUES:
// → aiCallQueue       → all LLM API calls (OpenAI, Claude, Groq, Gemini)
// → agentDeployQueue  → deploying agents to WhatsApp/Instagram/website
// → webhookQueue      → outgoing webhooks to social platforms
// → emailQueue        → transactional emails
//
// HOW TO ADD A JOB FROM A ROUTE:
// → import { aiCallQueue } from "../queues/queues"
// → await aiCallQueue?.add("chat", { agentId, message, userId })
// ─────────────────────────────────────────────────────────────────

import { Queue } from "bullmq";
import { producerConnection } from "./connection";
import type { DefaultJobOptions } from "bullmq";

// ── Shared default job options ────────────────────────────────────
// Applied to every job in every queue unless overridden
const defaultJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1000, // 1s → 2s → 4s between retries
  },
  removeOnComplete: {
    age: 24 * 3600,  // keep completed jobs for 24 hours
    count: 1000,     // keep last 1000 completed jobs
  },
  removeOnFail: {
    age: 7 * 24 * 3600, // keep failed jobs for 7 days for debugging
  },
};

// ── aiCallQueue ───────────────────────────────────────────────────
// Every LLM API call goes here — never blocks the Express server
// Supports: OpenAI, Anthropic, Groq, Google Gemini
export const aiCallQueue = producerConnection
  ? new Queue("ai-call", {
      connection: producerConnection,
      defaultJobOptions,
    })
  : null;

// ── agentDeployQueue ──────────────────────────────────────────────
// Handles agent deployment to social media and websites
// Supports: WhatsApp, Instagram, Messenger, Telegram, Website widget
export const agentDeployQueue = producerConnection
  ? new Queue("agent-deploy", {
      connection: producerConnection,
      defaultJobOptions,
    })
  : null;

// ── webhookQueue ──────────────────────────────────────────────────
// Outgoing webhooks to social media platforms
// Higher retry count — webhook delivery must be reliable
export const webhookQueue = producerConnection
  ? new Queue("webhook", {
      connection: producerConnection,
      defaultJobOptions: {
        ...defaultJobOptions,
        attempts: 5, // webhooks get more retries — delivery is critical
      },
    })
  : null;

// ── emailQueue ────────────────────────────────────────────────────
// Transactional emails — welcome, alerts, notifications
export const emailQueue = producerConnection
  ? new Queue("email", {
      connection: producerConnection,
      defaultJobOptions,
    })
  : null;
