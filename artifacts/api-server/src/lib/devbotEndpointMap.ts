export interface EndpointTarget {
  endpoint: string;
  method: string;
}

const FILE_ENDPOINT_MAP: Array<{ pattern: string; target: EndpointTarget }> = [
  { pattern: "routes/devbot.ts",       target: { endpoint: "/api/devbot/health",  method: "GET" } },
  { pattern: "routes/auth.ts",         target: { endpoint: "/api/auth/status",    method: "GET" } },
  { pattern: "routes/agents.ts",       target: { endpoint: "/api/agents",         method: "GET" } },
  { pattern: "routes/settings.ts",     target: { endpoint: "/api/settings",       method: "GET" } },
  { pattern: "routes/automations.ts",  target: { endpoint: "/api/automations",    method: "GET" } },
  { pattern: "routes/blog.ts",         target: { endpoint: "/api/blog/posts",     method: "GET" } },
];

export function getEndpointForFile(filePath: string): EndpointTarget | null {
  for (const { pattern, target } of FILE_ENDPOINT_MAP) {
    if (filePath.endsWith(pattern) || filePath.includes(pattern)) {
      return target;
    }
  }
  return null;
}
