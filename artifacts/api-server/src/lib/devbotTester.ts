import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger.js";

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface TestResult {
  passed: boolean;
  status: number;
  preview: string;
}

export async function runTest(
  sessionId: string,
  fileChanged: string,
  endpoint: string,
  method: string = "GET",
  body?: Record<string, unknown>,
): Promise<TestResult> {
  const baseUrl = process.env.API_BASE_URL ?? "http://localhost:8080";
  const url = `${baseUrl}${endpoint}`;

  let httpStatus = 0;
  let responsePreview = "";
  let passed = false;

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    httpStatus = res.status;
    const text = await res.text();
    responsePreview = text.slice(0, 200);
    passed = httpStatus >= 200 && httpStatus < 300;
  } catch (err) {
    httpStatus = 0;
    responsePreview = err instanceof Error ? err.message : "Request failed";
    passed = false;
    logger.warn({ err, endpoint }, "devbotTester: request threw");
  }

  try {
    const sb = getServiceClient();
    const { error } = await sb.from("devbot_test_results").insert({
      session_id: sessionId,
      file_changed: fileChanged,
      endpoint_tested: endpoint,
      http_status: httpStatus,
      passed,
      response_preview: responsePreview,
    });
    if (error) logger.warn({ err: error }, "devbotTester: save to Supabase failed");
  } catch (err) {
    logger.warn({ err }, "devbotTester: save threw");
  }

  return { passed, status: httpStatus, preview: responsePreview };
}
