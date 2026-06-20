import { Worker, type Job } from "bullmq";
import { processIncomingMessage } from "../lib/agentProcessor.js";
import type { IncomingMessageJob } from "../lib/queue.js";
import { logger } from "../lib/logger.js";

const connection = { url: process.env.REDIS_URL! };

const worker = new Worker<IncomingMessageJob>(
  "incoming-messages",
  async (job: Job<IncomingMessageJob>) => {
    logger.info(
      { jobId: job.id, channel: job.data.channel, agentId: job.data.agentId },
      "Worker picked up job"
    );
    await processIncomingMessage(job.data);
    logger.info({ jobId: job.id }, "Job completed");
  },
  {
    connection,
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 1000,
    },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  }
);

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Job permanently failed after retries");
});

logger.info("Agent worker started");
