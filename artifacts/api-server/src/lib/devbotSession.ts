import { searchMemory, getLessons } from "./devbotMemory.js";

export interface SessionContext {
  recentMessages: Array<{ role: string; content: string }>;
  lessons: string[];
  timestamp: string;
}

export async function buildContext(
  query: string,
  history: Array<{ role: string; content: string }> = [],
): Promise<SessionContext> {
  const [related, lessons] = await Promise.all([
    searchMemory(query, 5),
    getLessons(),
  ]);

  const recentMessages = [
    ...related.map((m) => ({ role: m.role, content: m.content })),
    ...history.slice(-10),
  ];

  return {
    recentMessages,
    lessons: lessons.slice(-20).map((l) => l.content),
    timestamp: new Date().toISOString(),
  };
}
