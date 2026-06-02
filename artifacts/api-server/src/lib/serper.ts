import { logger } from "./logger.js";

interface SerperResponse {
  organic?: Array<{ title?: string; snippet?: string; link?: string }>;
  answerBox?: { answer?: string; snippet?: string; title?: string };
  knowledgeGraph?: { description?: string; title?: string };
}

export async function searchWeb(
  apiKey: string,
  query: string,
  numResults = 5
): Promise<{ success: boolean; summary?: string; error?: string }> {
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: numResults }),
    });

    if (!res.ok) {
      const txt = await res.text();
      logger.error({ status: res.status, query }, "Serper API error");
      return { success: false, error: `Serper API returned ${res.status}: ${txt.slice(0, 200)}` };
    }

    const data = (await res.json()) as SerperResponse;
    const lines: string[] = [];

    if (data.answerBox?.answer) {
      lines.push(`Answer: ${data.answerBox.answer}`);
    } else if (data.answerBox?.snippet) {
      lines.push(`Answer: ${data.answerBox.snippet}`);
    }

    if (data.knowledgeGraph?.description) {
      lines.push(`Overview: ${data.knowledgeGraph.description}`);
    }

    for (const item of (data.organic ?? []).slice(0, numResults)) {
      if (item.title && item.snippet) {
        lines.push(`• ${item.title}: ${item.snippet}`);
      }
    }

    const summary = lines.length ? lines.join("\n") : "No results found for that query.";
    logger.info({ query, resultCount: data.organic?.length ?? 0 }, "Serper search complete");
    return { success: true, summary };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err, query }, "Serper search threw");
    return { success: false, error: msg };
  }
}
