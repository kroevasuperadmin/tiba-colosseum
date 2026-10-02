// Receipt fingerprint. Pure and deterministic: the same fields always give the same text and the
// same SHA-256, here on the server and in the visitor's browser (Web Crypto). Nothing here signs
// anything. It lets a person who saved the hash earlier, or read it from a devnet memo, notice if
// the page they see now was changed afterwards.
import { createHash } from "node:crypto";

export const RECEIPT_HASH_VERSION = "tiba-receipt-v1";
export const RECEIPT_MEMO_PREFIX = "tiba-receipt-v1:";

export interface ReceiptHashInput {
  token: string;
  decisionClass: string;
  status: string;
  reasonCode: string | null;
  amountMicros: bigint | number | string;
  chain: string | null;
  digest: string | null;
  createdAt: Date | string;
  billSha256: string | null;
  adjudications: Array<{
    channel: string;
    model: string;
    promptSha: string;
    responseSha: string | null;
    tupleJson: unknown;
    ok: boolean;
  }>;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, inner]) => [key, sortKeys(inner)])
    );
  }
  return value;
}

/** The exact text that is hashed. Keys sorted, no spaces, so any tool can rebuild it. */
export function canonicalReceiptText(input: ReceiptHashInput): string {
  const created = input.createdAt instanceof Date ? input.createdAt.toISOString() : new Date(input.createdAt).toISOString();
  const body = {
    version: RECEIPT_HASH_VERSION,
    token: input.token,
    decision: input.decisionClass,
    status: input.status,
    reason: input.reasonCode,
    amount_micros: String(input.amountMicros),
    chain: input.chain,
    transaction: input.digest,
    created_at: created,
    bill_sha256: input.billSha256,
    checks: [...input.adjudications]
      .sort((a, b) => (a.channel < b.channel ? -1 : a.channel > b.channel ? 1 : 0))
      .map((row) => ({
        channel: row.channel,
        model: row.model,
        prompt_sha256: row.promptSha,
        response_sha256: row.responseSha,
        read: row.tupleJson ?? null,
        ok: row.ok
      }))
  };
  return JSON.stringify(sortKeys(body));
}

export function receiptHash(input: ReceiptHashInput): string {
  return createHash("sha256").update(canonicalReceiptText(input), "utf8").digest("hex");
}

/** What goes in the memo of the optional devnet anchor transaction. Short, fixed shape. */
export function receiptAnchorMemo(hash: string): string {
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error("receipt hash must be 64 lowercase hex characters");
  return `${RECEIPT_MEMO_PREFIX}${hash}`;
}

/** Read a hash back out of a memo, or null if the memo is not one of ours. */
export function hashFromAnchorMemo(memo: string): string | null {
  const text = memo.trim();
  if (!text.startsWith(RECEIPT_MEMO_PREFIX)) return null;
  const hash = text.slice(RECEIPT_MEMO_PREFIX.length);
  return /^[0-9a-f]{64}$/.test(hash) ? hash : null;
}
