import { createSign } from "crypto";
import { logger } from "./logger.js";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface DriveResult {
  success: boolean;
  summary?: string;
  fileId?: string;
  fileUrl?: string;
  error?: string;
}

function base64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getServiceAccountToken(sa: ServiceAccount, scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header  = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope,
    aud: sa.token_uri ?? "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const toSign = `${header}.${payload}`;
  const sign = createSign("RSA-SHA256");
  sign.update(toSign);
  const sig = base64url(sign.sign(sa.private_key));
  const jwt = `${toSign}.${sig}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json() as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error(`Token exchange failed: ${data.error ?? "unknown"}`);
  return data.access_token;
}

export async function createDriveFile(
  serviceKeyJson: string,
  folderId: string,
  fileName: string,
  content: string,
  mimeType = "text/plain"
): Promise<DriveResult> {
  try {
    const sa: ServiceAccount = JSON.parse(serviceKeyJson);
    const token = await getServiceAccountToken(
      sa,
      "https://www.googleapis.com/auth/drive.file"
    );

    const boundary = "------EverydayAIDriveBoundary";
    const metadata = JSON.stringify({
      name:    fileName,
      parents: [folderId],
    });
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      "",
      metadata,
      `--${boundary}`,
      `Content-Type: ${mimeType}`,
      "",
      content,
      `--${boundary}--`,
    ].join("\r\n");

    const res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );

    const data = await res.json() as {
      id?: string;
      name?: string;
      webViewLink?: string;
      error?: { message?: string };
    };

    if (!res.ok || data.error) {
      const msg = data.error?.message ?? `HTTP ${res.status}`;
      logger.warn({ folderId, fileName, msg }, "Google Drive file creation failed");
      return { success: false, error: msg };
    }

    const summary = `File "${data.name}" created in Drive (ID: ${data.id})`;
    logger.info({ fileId: data.id, fileName }, "Google Drive file created");
    return {
      success: true,
      summary,
      fileId:  data.id,
      fileUrl: data.webViewLink,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "createDriveFile threw");
    return { success: false, error: msg };
  }
}
