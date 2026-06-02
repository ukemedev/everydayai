import { logger } from "./logger.js";

export interface Task {
  id: string;
  type: string;
  payload: unknown;
  status: "pending" | "running" | "done" | "failed";
  createdAt: string;
  updatedAt: string;
  result?: unknown;
  error?: string;
}

const queues: Map<string, Task[]> = new Map();

export function createQueue(name: string): Task[] {
  if (!queues.has(name)) queues.set(name, []);
  return queues.get(name)!;
}

export function getQueue(name: string): Task[] {
  return queues.get(name) ?? [];
}

export async function processQueue(
  name: string,
  handler: (task: Task) => Promise<unknown>,
): Promise<void> {
  const queue = queues.get(name) ?? [];
  const pending = queue.filter((t) => t.status === "pending");
  for (const task of pending) {
    task.status = "running";
    task.updatedAt = new Date().toISOString();
    try {
      task.result = await handler(task);
      task.status = "done";
    } catch (err) {
      task.status = "failed";
      task.error = err instanceof Error ? err.message : String(err);
      logger.warn({ taskId: task.id, err }, "devbotTaskQueue: task failed");
    }
    task.updatedAt = new Date().toISOString();
  }
}
