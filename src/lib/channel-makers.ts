/**
 * Which company read a channel, and whether a fallback left both checks on one company.
 * Test networks only. These helpers never move money.
 */

export const SAME_MAKER_REASON = "SAME_MAKER";

export type RequiredChannelBand = "payer_record" | "both" | "human";

export type SameMakerHold =
  | { hold: false }
  | { hold: true; status: "held"; decisionClass: "AMBER"; reasonCode: typeof SAME_MAKER_REASON };

/** The model id on the channel result is the one that answered. Adjudications store this. */
export function modelAnsweredWith(result: { model: string }): string {
  return result.model;
}

function makerKey(model: string): string {
  if (model.startsWith("openai/")) return "openai";
  if (model.startsWith("qwen/")) return "alibaba";
  return model;
}

function makerPhrase(model: string | null | undefined): string | null {
  if (!model) return null;
  if (model.startsWith("openai/")) return "OpenAI's model";
  if (model.startsWith("qwen/")) return "Alibaba's model";
  return null;
}

/**
 * In the two-check band, a fallback that leaves both answers from the same maker
 * means the checks were not independent. Hold for a person. Under $50 only the
 * payer's record is required; that band is left alone.
 */
export function sameMakerHold(input: {
  requiredChannels: RequiredChannelBand;
  artifactModel: string | null | undefined;
  payerModel: string | null | undefined;
  artifactAnswered: boolean;
  payerAnswered: boolean;
  artifactPrimary: string;
  payerPrimary: string;
}): SameMakerHold {
  if (input.requiredChannels !== "both") return { hold: false };
  if (!input.artifactAnswered || !input.payerAnswered) return { hold: false };
  if (!input.artifactModel || !input.payerModel) return { hold: false };
  if (makerKey(input.artifactModel) !== makerKey(input.payerModel)) return { hold: false };
  const fellBack =
    input.artifactModel !== input.artifactPrimary || input.payerModel !== input.payerPrimary;
  if (!fellBack) return { hold: false };
  return { hold: true, status: "held", decisionClass: "AMBER", reasonCode: SAME_MAKER_REASON };
}

/** Plain sentences for the receipt. Empty when neither channel has a known maker. */
export function receiptMakerSentences(input: {
  artifactModel?: string | null;
  payerModel?: string | null;
}): string {
  const parts: string[] = [];
  const bill = makerPhrase(input.artifactModel);
  const record = makerPhrase(input.payerModel);
  if (bill) parts.push(`The bill was read by ${bill}.`);
  if (record) parts.push(`Your record was read by ${record}.`);
  return parts.join(" ");
}
