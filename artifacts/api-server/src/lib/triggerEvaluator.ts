// ─── triggerEvaluator.ts ─────────────────────────────────────────
// Pure function: decides whether a tool trigger condition is met.
//
// THREE TRIGGER TYPES:
// → always         — fires on every conversation turn
// → keyword        — fires when customer message contains any keyword
// → data_collected — fires when combined text contains all required fields
//
// SEALED BEHAVIOUR:
// → Pure function — no side effects, no I/O, trivially testable
// → Unknown trigger type → false (safe default, never crashes)
// → Empty keywords list → false (not configured = don't fire)
// → Empty fields list   → false (not configured = don't fire)
// → Keyword matching is case-insensitive and trims whitespace
// ─────────────────────────────────────────────────────────────────

export type TriggerType = "always" | "keyword" | "data_collected";

export interface TriggerConfig {
  keywords?: string[];
  fields?: string[];
}

/**
 * Evaluate whether a tool trigger condition is satisfied.
 *
 * @param triggerType      - The trigger strategy for this tool
 * @param triggerConfig    - Configuration for the trigger (keywords / fields)
 * @param customerMessage  - The raw customer message for this turn
 * @param aiReply          - The AI's reply for this turn
 * @returns true if the tool should fire, false otherwise
 */
export function evaluateTrigger(
  triggerType: TriggerType,
  triggerConfig: TriggerConfig,
  customerMessage: string,
  aiReply: string,
): boolean {
  switch (triggerType) {
    case "always":
      return true;

    case "keyword": {
      const kws = triggerConfig.keywords ?? [];
      if (kws.length === 0) return false;
      const lowerMsg = customerMessage.toLowerCase();
      return kws.some((kw) => {
        const trimmed = kw.trim().toLowerCase();
        return trimmed.length > 0 && lowerMsg.includes(trimmed);
      });
    }

    case "data_collected": {
      const fields = triggerConfig.fields ?? [];
      if (fields.length === 0) return false;
      // Check the full context (customer message + AI reply) for each field name.
      // The AI reply typically confirms what was collected ("Got your name and email").
      const combined = (customerMessage + " " + aiReply).toLowerCase();
      return fields.every((f) => {
        const trimmed = f.trim().toLowerCase();
        return trimmed.length > 0 && combined.includes(trimmed);
      });
    }

    default:
      return false;
  }
}
