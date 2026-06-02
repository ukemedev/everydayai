import { baseTemplate, btnPrimary } from "./base.js";

export interface WelcomeEmailData {
  firstName: string;
  email:     string;
}

export function welcomeEmailHtml({ firstName }: WelcomeEmailData): string {
  const name = firstName.trim() || "there";

  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0a0f1e;letter-spacing:-0.4px;">
      Welcome to EverydayAI, ${name}! 🦉
    </h1>
    <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.65;">
      You've joined thousands of Nigerian businesses using AI to handle customer conversations — 24/7, without hiring extra staff.
    </p>

    <div style="background-color:#f8faff;border-left:3px solid #3b5bfc;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;font-weight:600;color:#1e3a8a;">Here's what you can do right now:</p>
    </div>

    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:8px;">
      <tr>
        <td style="width:32px;vertical-align:top;padding-top:2px;">
          <div style="width:24px;height:24px;background-color:#eff2ff;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;color:#3b5bfc;">1</div>
        </td>
        <td style="padding-left:12px;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">Create your first AI agent</p>
          <p style="margin:4px 0 16px;font-size:13px;color:#6b7280;">Give it a name, personality, and instructions in minutes.</p>
        </td>
      </tr>
      <tr>
        <td style="width:32px;vertical-align:top;padding-top:2px;">
          <div style="width:24px;height:24px;background-color:#eff2ff;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;color:#3b5bfc;">2</div>
        </td>
        <td style="padding-left:12px;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">Connect to WhatsApp or Telegram</p>
          <p style="margin:4px 0 16px;font-size:13px;color:#6b7280;">Your agent can handle customer messages on any channel.</p>
        </td>
      </tr>
      <tr>
        <td style="width:32px;vertical-align:top;padding-top:2px;">
          <div style="width:24px;height:24px;background-color:#eff2ff;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;color:#3b5bfc;">3</div>
        </td>
        <td style="padding-left:12px;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">Watch it work</p>
          <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Your AI employee never sleeps, never takes a break.</p>
        </td>
      </tr>
    </table>

    ${btnPrimary("Open Your Dashboard →", `${process.env.APP_URL ?? "https://everydayai.com"}/dashboard`)}

    <p style="margin:28px 0 0;font-size:13px;color:#9ca3af;line-height:1.6;">
      Questions? Reply to this email or reach us at
      <a href="mailto:hello@everydayai.com" style="color:#3b5bfc;text-decoration:none;">hello@everydayai.com</a>.
    </p>
  `;

  return baseTemplate(content);
}

export function welcomeEmailSubject(): string {
  return "Welcome to EverydayAI 🦉 — let's build your first agent";
}
