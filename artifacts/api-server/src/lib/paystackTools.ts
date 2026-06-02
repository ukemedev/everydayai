import { logger } from "./logger.js";

interface PaystackBalanceItem { currency: string; balance: number; }
interface PaystackTransaction {
  amount: number; currency: string; status: string;
  reference: string; created_at: string;
}
interface PaystackApiResponse { status?: boolean; data?: unknown; message?: string; }

export async function checkPaystackBalance(
  secretKey: string,
  action: string
): Promise<{ success: boolean; summary?: string; error?: string }> {
  try {
    const isTransactions = action === "recent_transactions";
    const url = isTransactions
      ? "https://api.paystack.co/transaction?perPage=5"
      : "https://api.paystack.co/balance";

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const txt = await res.text();
      logger.error({ status: res.status, action }, "Paystack API error");
      return { success: false, error: `Paystack API returned ${res.status}: ${txt.slice(0, 200)}` };
    }

    const data = (await res.json()) as PaystackApiResponse;

    if (!data.status) {
      return { success: false, error: data.message ?? "Paystack returned an error" };
    }

    let summary = "";

    if (isTransactions) {
      const txns = (data.data as PaystackTransaction[] | undefined) ?? [];
      if (txns.length === 0) {
        summary = "No recent transactions found.";
      } else {
        summary = txns
          .map((t) => {
            const amount = (t.amount / 100).toFixed(2);
            const date   = new Date(t.created_at).toLocaleDateString();
            return `• ${t.reference}: ${amount} ${t.currency} — ${t.status} (${date})`;
          })
          .join("\n");
        summary = `Last ${txns.length} transactions:\n${summary}`;
      }
    } else {
      const balances = (data.data as PaystackBalanceItem[] | undefined) ?? [];
      if (balances.length === 0) {
        summary = "No balance data available.";
      } else {
        summary =
          "Account balance: " +
          balances.map((b) => `${b.currency} ${(b.balance / 100).toFixed(2)}`).join(", ");
      }
    }

    logger.info({ action }, "Paystack check complete");
    return { success: true, summary };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err, action }, "Paystack check threw");
    return { success: false, error: msg };
  }
}
