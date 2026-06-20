import { Queue, type ConnectionOptions } from "bullmq";

const connection: ConnectionOptions = {
  url: process.env.REDIS_URL!,
};

if (!process.env.REDIS_URL) {
  console.warn("[queue] REDIS_URL not set – message queue will fail");
}

export const messageQueue = new Queue("incoming-messages", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export interface IncomingMessageJob {
  agentId: string;
  conversationId: string;
  channel: "telegram" | "whatsapp" | "messenger" | "instagram" | "web_widget" | "test";
  message: string;
  timestamp: string;
  /** Required when channel === 'test' – the agent owner's user ID */
  ownerUserId?: string;
}

export async function enqueueMessage(job: IncomingMessageJob) {
  return messageQueue.add("process-message", job);
}
