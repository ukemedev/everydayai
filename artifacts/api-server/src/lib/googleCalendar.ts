import { createSign } from "crypto";
import { logger } from "./logger.js";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface CalendarEventInput {
  summary: string;
  startTime: string;
  endTime: string;
  description?: string;
  attendeeEmail?: string;
  timeZone?: string;
}

interface CalendarResult {
  success: boolean;
  summary?: string;
  eventId?: string;
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

export async function createCalendarEvent(
  serviceKeyJson: string,
  calendarId: string,
  input: CalendarEventInput
): Promise<CalendarResult> {
  try {
    const sa: ServiceAccount = JSON.parse(serviceKeyJson);
    const token = await getServiceAccountToken(
      sa,
      "https://www.googleapis.com/auth/calendar"
    );

    const tz = input.timeZone ?? "Africa/Lagos";
    const body: Record<string, unknown> = {
      summary:     input.summary,
      description: input.description ?? "",
      start: { dateTime: input.startTime, timeZone: tz },
      end:   { dateTime: input.endTime,   timeZone: tz },
    };
    if (input.attendeeEmail) {
      body.attendees = [{ email: input.attendeeEmail }];
    }

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json() as { id?: string; summary?: string; error?: { message?: string } };

    if (!res.ok || data.error) {
      const msg = data.error?.message ?? `HTTP ${res.status}`;
      logger.warn({ calendarId, msg }, "Google Calendar event creation failed");
      return { success: false, error: msg };
    }

    const summary = `Booked "${data.summary}" (ID: ${data.id})`;
    logger.info({ calendarId, eventId: data.id }, "Google Calendar event created");
    return { success: true, summary, eventId: data.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "createCalendarEvent threw");
    return { success: false, error: msg };
  }
}
