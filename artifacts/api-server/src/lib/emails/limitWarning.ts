import { baseTemplate, btnPrimary, divider } from "./base.js";

export interface LimitWarningEmailData {
  firstName:   string;
  email:       string;
  plan:        string;
  current:     number;
  limit:       number;
  percentUsed: number;
}

export interface LimitReachedEmailData {
  firstName: string;
  email:     string;
  plan:      string;
  limit:     number;
}

const NEXT_PLAN: Record<string, { name: string; messages: string; price: string }> = {
  free:    { name: "Starter", messages: "2,000",  price: "₦15,000/month" },
  starter: { name: "Pro",     messages: "10,000", price: "₦39,000/month" },
  pro:     { name: "Business", messages: "Unlimited", price: "₦89,000/month" },
};

export function limitWarningEmailHtml(data: LimitWarningEmailData): string {
  const name    = data.firstName.trim() || "there";
  const next    = NEXT_PLAN[data.plan.toLowerCase()];
  const pct     = Math.round(data.percentUsed);
  const remaining = Math.max(0, data.limit - data.current);

  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0a0f1e;letter-spacing:-0.4px;">
      You've used ${pct}% of your messages ⚠️
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.65;">
      Hi ${name}, your AI agents have handled <strong>${data.current.toLocaleString("en-NG")}</strong> of your
      <strong>${data.limit.toLocaleString("en-NG")}</strong> monthly messages.
      You have <strong>${remaining.toLocaleString("en-NG")} messages</strong> remaining this month.
    </p>

    <!-- Progress bar -->
    <div style="background-color:#f3f4f6;border-radius:99px;height:8px;margin-bottom:24px;overflow:hidden;">
      <div style="background-color:#f59e0b;height:8px;border-radius:99px;width:${pct}%;"></div>
    </div>

    ${next ? `
    <div style="background-color:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#92400e;">Upgrade before you run out</p>
      <p style="margin:0;font-size:13px;color:#78350f;line-height:1.6;">
        ${next.name} gives you <strong>${next.messages} messages</strong> for just <strong>${next.price}</strong>.
        Upgrade now and your agents keep running without interruption.
      </p>
    </div>
    ${btnPrimary(`Upgrade to ${next.name} →`, `${process.env.APP_URL ?? "https://everydayai.com"}/billing`)}
    ` : `
    <p style="font-size:14px;color:#6b7280;">Contact us to discuss enterprise options for higher volumes.</p>
    `}

    ${divider()}
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
      Your counter resets monthly. Questions? 
      <a href="mailto:hello@everydayai.com" style="color:#3b5bfc;text-decoration:none;">hello@everydayai.com</a>
    </p>
  `;

  return baseTemplate(content);
}

export function limitWarningEmailSubject(pct: number): string {
  return `⚠️ You've used ${Math.round(pct)}% of your monthly messages — EverydayAI`;
}

export function limitReachedEmailHtml(data: LimitReachedEmailData): string {
  const name = data.firstName.trim() || "there";
  const next = NEXT_PLAN[data.plan.toLowerCase()];

  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#dc2626;letter-spacing:-0.4px;">
      Monthly message limit reached 🔴
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.65;">
      Hi ${name}, your agents have used all <strong>${data.limit.toLocaleString("en-NG")} messages</strong> for this month.
      Until you upgrade or your counter resets, your agents will respond with a limit message to customers.
    </p>

    <div style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#991b1b;">What's happening right now</p>
      <p style="margin:0;font-size:13px;color:#7f1d1d;line-height:1.6;">
        Customers messaging your agents will see: <em>"Thank you for chatting! Our agent has reached its limit for now. Please contact us directly or try again later."</em>
      </p>
    </div>

    ${next ? `
    <div style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#14532d;">Upgrade to restore your agents immediately</p>
      <p style="margin:0;font-size:13px;color:#166534;line-height:1.6;">
        ${next.name} plan — <strong>${next.messages} messages</strong> for <strong>${next.price}</strong>.
        Agents are restored the moment your payment goes through.
      </p>
    </div>
    ${btnPrimary(`Upgrade to ${next.name} — restore agents now →`, `${process.env.APP_URL ?? "https://everydayai.com"}/billing`)}
    ` : `
    <p style="font-size:14px;color:#6b7280;">Contact us to unlock higher volumes for your business.</p>
    `}

    ${divider()}
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
      Your counter resets monthly. Need help?
      <a href="mailto:hello@everydayai.com" style="color:#3b5bfc;text-decoration:none;">hello@everydayai.com</a>
    </p>
  `;

  return baseTemplate(content);
}

export function limitReachedEmailSubject(): string {
  return "🔴 Your agents are paused — monthly limit reached";
}
