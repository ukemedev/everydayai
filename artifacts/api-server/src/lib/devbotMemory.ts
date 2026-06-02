import { logger } from "./logger.js";

export interface MemoryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  agentId?: string;
}

export interface Lesson {
  id: string;
  content: string;
  timestamp: string;
  tags?: string[];
}

const messages: MemoryMessage[] = [];
const lessons: Lesson[] = [];

export async function saveMessage(msg: Omit<MemoryMessage, "id" | "timestamp">): Promise<void> {
  messages.push({
    ...msg,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  });
  logger.debug({ role: msg.role }, "devbotMemory: message saved");
}

export async function searchMemory(query: string, _limit = 10): Promise<MemoryMessage[]> {
  const q = query.toLowerCase();
  return messages
    .filter((m) => m.content.toLowerCase().includes(q))
    .slice(-_limit);
}

export async function getLessons(): Promise<Lesson[]> {
  return lessons;
}

export async function saveLesson(content: string, tags?: string[]): Promise<void> {
  lessons.push({
    id: crypto.randomUUID(),
    content,
    timestamp: new Date().toISOString(),
    tags,
  });
  logger.debug({ tags }, "devbotMemory: lesson saved");
}
