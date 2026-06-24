import { Queue } from "bullmq";
import { producerConnection } from "./connection";
import type { DefaultJobOptions } from "bullmq";

const defaultJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
  removeOnComplete: {
    age: 24 * 3600,
    count: 1000,
  },
  removeOnFail: {
    age: 7 * 24 * 3600,
  },
};

export const aiCallQueue = producerConnection
  ? new Queue("ai-call", { connection: producerConnection, defaultJobOptions })
  : null;

export const agentDeployQueue = producerConnection
  ? new Queue("agent-deploy", { connection: producerConnection, defaultJobOptions })
  : null;

export const webhookQueue = producerConnection
  ? new Queue("webhook", {
      connection: producerConnection,
      defaultJobOptions: { ...defaultJobOptions, attempts: 5 },
    })
  : null;

export const emailQueue = producerConnection
  ? new Queue("email", { connection: producerConnection, defaultJobOptions })
  : null;