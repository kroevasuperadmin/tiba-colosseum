/**
 * Check 2, with no model and no database call. processPayoutIntent has already
 * loaded this recipient's open work orders and placed them on the message.
 * This function only reads that message. It must not import the database client
 * or open a connection: a second query is what exhausted the live pool.
 * Solana devnet test amounts only. This does not move money.
 *
 * Exactly one payer record whose delivery_status is "verified_complete" becomes
 * the tuple. Zero or several returns no tuple, so the payment is held and nothing
 * is guessed. A throw is not dropped: the message is stored as { error } so the
 * receipt can say why check 2 had no answer.
 */

export const PAYER_RECORD_RULES_MODEL = "rules" as const;

export type ScopedWorkOrder = {
  ref?: string;
  id?: string;
  ceilingMicros?: bigint | string | number;
  ceiling_micros?: bigint | string | number;
  payerRecord?: unknown;
  payer_record?: unknown;
};

export type PayerRecordTuple = {
  ref: string;
  /** Digits from payer_record.approved_amount_micros, or the ceiling when that field is absent. */
  approved_amount_micros: string;
  received_at: string;
};

export type PayerRecordRulesResult = {
  ok: boolean;
  model: typeof PAYER_RECORD_RULES_MODEL;
  latencyMs: number;
  content?: string;
};

type PayerMessage = { role: string; content: string };

function digitString(value: unknown): string | null {
  if (typeof value === "bigint" && value >= 0n) return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  return null;
}

/**
 * jsonb can arrive as an object, as JSON text, or as quoted JSON text (a jsonb
 * string column's raw form). Parse until the value is an object. A non-JSON
 * string is not a record.
 */
function asRecord(value: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 4) return null;
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/^\uFEFF/, "");
    if (!trimmed) return null;
    try {
      return asRecord(JSON.parse(trimmed) as unknown, depth + 1);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function rawRecord(order: ScopedWorkOrder): unknown {
  return order.payerRecord !== undefined ? order.payerRecord : order.payer_record;
}

function recordOf(order: ScopedWorkOrder): Record<string, unknown> | null {
  return asRecord(rawRecord(order));
}

function statusOf(record: Record<string, unknown>): unknown {
  return "delivery_status" in record ? record.delivery_status : record.deliveryStatus;
}

function statusText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isVerifiedComplete(order: ScopedWorkOrder): boolean {
  const record = recordOf(order);
  if (!record) return false;
  return statusText(statusOf(record)) === "verified_complete";
}

function refOf(order: ScopedWorkOrder): string | null {
  if (typeof order.ref === "string" && order.ref.length > 0) return order.ref;
  if (typeof order.id === "string" && order.id.length > 0) return order.id;
  return null;
}

function amountOf(order: ScopedWorkOrder): string | null {
  const record = recordOf(order);
  const approved = record
    ? digitString(record.approved_amount_micros) ?? digitString(record.approvedAmountMicros)
    : null;
  if (approved !== null) return approved;
  return digitString(order.ceilingMicros) ?? digitString(order.ceiling_micros);
}

export function selectPayerRecordTuple(
  openWorkOrders: readonly ScopedWorkOrder[],
  receivedAt: string
): PayerRecordTuple | null {
  const matches = openWorkOrders.filter(isVerifiedComplete);
  if (matches.length !== 1) return null;
  const only = matches[0];
  const ref = refOf(only);
  const approvedAmountMicros = amountOf(only);
  if (!ref || approvedAmountMicros === null) return null;
  return {
    ref,
    approved_amount_micros: approvedAmountMicros,
    received_at: receivedAt
  };
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  const text = String(error).trim();
  return text || "Check 2 failed.";
}

/** Stored on the adjudication as tuple JSON. Not a decision tuple, so nothing is paid from it. */
function failureResult(error: string): PayerRecordRulesResult {
  return {
    ok: false,
    model: PAYER_RECORD_RULES_MODEL,
    latencyMs: 0,
    content: JSON.stringify({ error })
  };
}

function describeOrder(order: ScopedWorkOrder): string {
  const raw = rawRecord(order);
  const kind = raw === null ? "null" : Array.isArray(raw) ? "array" : typeof raw;
  const record = recordOf(order);
  if (!record) return `payer_record ${kind}`;
  const status = statusText(statusOf(record));
  if (!status) return `payer_record ${kind}, delivery_status missing`;
  if (status.length > 40 || /[\r\n]/.test(status)) return `payer_record ${kind}, delivery_status not verified_complete`;
  return `payer_record ${kind}, delivery_status ${status}`;
}

function explainMiss(orders: readonly ScopedWorkOrder[]): string {
  const verified = orders.filter(isVerifiedComplete).length;
  if (verified > 1) return `Check 2 saw ${verified} verified_complete records and did not guess.`;
  if (orders.length === 0) return "Check 2 saw no open work orders.";
  if (verified === 1) return "Check 2 saw one verified_complete record but could not read its ref or amount.";
  const seen = orders.slice(0, 3).map(describeOrder).join("; ");
  return `Check 2 saw ${orders.length} open order${orders.length === 1 ? "" : "s"} and no single verified_complete record (${seen}).`;
}

function answer(tuple: PayerRecordTuple): PayerRecordRulesResult {
  return {
    ok: true,
    model: PAYER_RECORD_RULES_MODEL,
    latencyMs: 0,
    content: JSON.stringify({
      work_order_id: tuple.ref,
      amount_micros: tuple.approved_amount_micros,
      delivery_timestamp: tuple.received_at,
      record_basis: "verified_complete"
    })
  };
}

/**
 * The shape processPayoutIntent already sends as the payer-record user message.
 * Anything that throws is returned as { error }, never as an empty result.
 */
export function readPayerRecordByRules(messages: readonly PayerMessage[]): PayerRecordRulesResult {
  try {
    const user = [...messages].reverse().find((message) => message.role === "user");
    let orders: ScopedWorkOrder[] = [];
    let receivedAt = "";
    if (user) {
      const parsed = JSON.parse(user.content) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const body = parsed as Record<string, unknown>;
        if (Array.isArray(body.open_work_orders)) {
          orders = body.open_work_orders.filter(
            (row): row is ScopedWorkOrder => Boolean(row) && typeof row === "object" && !Array.isArray(row)
          );
        }
        const meta = body.delivery_event_metadata;
        if (meta && typeof meta === "object" && !Array.isArray(meta)) {
          const received = (meta as Record<string, unknown>).received_at;
          if (typeof received === "string") receivedAt = received;
        }
      }
    }
    const tuple = selectPayerRecordTuple(orders, receivedAt);
    if (!tuple) return failureResult(explainMiss(orders));
    return answer(tuple);
  } catch (error) {
    return failureResult(errorText(error));
  }
}
