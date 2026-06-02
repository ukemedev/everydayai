const FILE_ENDPOINT_MAP: Record<string, string> = {
  "routes/chat.ts": "/api/chat",
  "routes/agents.ts": "/api/agents",
  "routes/keys.ts": "/api/keys",
  "routes/documents.ts": "/api/documents",
  "routes/billing.ts": "/api/billing",
  "routes/admin.ts": "/api/admin",
  "routes/blog.ts": "/api/blog",
  "routes/google.ts": "/api/google",
  "routes/telegram.ts": "/api/telegram",
  "routes/whatsapp.ts": "/api/whatsapp",
  "routes/templates.ts": "/api/templates",
  "routes/tools.ts": "/api/tools",
  "routes/onboarding.ts": "/api/onboarding",
  "routes/conversations.ts": "/api/conversations",
};

export function getEndpointForFile(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/");
  for (const [key, endpoint] of Object.entries(FILE_ENDPOINT_MAP)) {
    if (normalized.endsWith(key)) return endpoint;
  }
  return null;
}
