import { baseTemplate, btnPrimary, divider } from "./base.js";

export interface PaymentEmailData {
  firstName: string;
  email:     string;
  plan:      string;
  amount:    number;
  reference: string;
}

const PLAN_DETAILS: Record<string, { label: string; agents: string; messages: string; channels: string }> = {
  starter: {
    label:    "Starter",
    agents:   "3 agents",
    messages: "2,000 messages / month",
    channels: "WhatsApp or Telegram (1 channel)",
  },
  pro: {
    label:    "Pro",
    agents:   "10 agents",
    messages: "10,000 messages / month",
    channels: "All 5 channels (WhatsApp, Telegram, Instagram, Messenger, Website)",
  },
  business: {
    label:    "Business",
    agents:   "Unlimited agents",
    messages: "Unlimited messages",
    channels: "All channels + priority support",
  },
};

function formatAmount(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

export function paymentEmailHtml(data: PaymentEmailData): string {
  const name    = data.firstName.trim() || "there";
  const details = PLAN_DETAILS[data.plan.toLowerCase()] ?? { label: data.plan, agents: "—", messages: "—", channels: "—" };

  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0a0f1e;letter-spacing:-0.4px;">
      Payment confirmed ✅
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.65;">
      Thanks ${name}! Your <strong>${details.label}</strong> plan is now active.
    </p>

    <!-- Receipt box -->
    <div style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px 24px;margin-bottom:24px;">
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="font-size:13px;color:#6b7280;padding-bottom:10px;">Plan</td>
          <td style="font-size:13px;font-weight:600;color:#111827;text-align:right;padding-bottom:10px;">${details.label}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#6b7280;padding-bottom:10px;">Amount paid</td>
          <td style="font-size:13px;font-weight:600;color:#111827;text-align:right;padding-bottom:10px;">${formatAmount(data.amount)}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#6b7280;padding-bottom:10px;">Reference</td>
          <td style="font-size:12px;font-family:monospace;color:#6b7280;text-align:right;padding-bottom:10px;">${data.reference}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#6b7280;">Billing</td>
          <td style="font-size:13px;color:#111827;text-align:right;">Monthly · renews in 30 days</td>
        </tr>
      </table>
    </div>

    <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#111827;">What's now unlocked:</p>
    <table cellpadding="0" cellspacing="0" width="100%">
      ${[details.agents, details.messages, details.channels].map((item) => `
      <tr>
        <td style="width:20px;font-size:16px;color:#10b981;vertical-align:top;padding:2px 0;">✓</td>
        <td style="font-size:14px;color:#374151;padding:2px 0 8px 8px;">${item}</td>
      </tr>`).join("")}
    </table>

    ${btnPrimary("Go to Dashboard →", `${process.env.APP_URL ?? "https://everydayai.com"}/dashboard`)}

    <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;line-height:1.6;">
      Need help? Reply to this email or message us at
      <a href="mailto:hello@everydayai.com" style="color:#3b5bfc;text-decoration:none;">hello@everydayai.com</a>.
    </p>
  `;

  return baseTemplate(content);
}

export function paymentEmailSubject(plan: string): string {
  const details = PLAN_DETAILS[plan.toLowerCase()];
  return `Your ${details?.label ?? plan} plan is active — EverydayAI`;
}
