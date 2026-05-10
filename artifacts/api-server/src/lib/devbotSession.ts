import { searchMemory, getLessons } from "./devbotMemory.js";

export async function buildContext(
  sessionId: string,
  currentMessage: string,
): Promise<string> {
  const [memories, lessons] = await Promise.all([
    searchMemory(currentMessage),
    getLessons(),
  ]);

  if (memories.length === 0 && lessons.length === 0) return "";

  const parts: string[] = [];

  if (memories.length > 0) {
    const memLines = memories.map((m) => {
      const date = new Date(m.created_at).toISOString().slice(0, 10);
      return `[${date}] ${m.role}: ${m.content}`;
    });
    parts.push("RELEVANT MEMORY:\n" + memLines.join("\n"));
  }

  if (lessons.length > 0) {
    const lessonLines = lessons.map((l) => `- ${l.lesson}`);
    parts.push("LESSONS LEARNED:\n" + lessonLines.join("\n"));
  }

  return parts.join("\n\n");
}
