/**
 * Check 2, with no model and no database call. processPayoutIntent has already
 * loaded this recipient's open work orders and placed them on the message.
 * This function only reads that message. It must not import the database client.
 * Solana devnet test amounts only. This does not move money.
 *
 * The production work order WO-R2 stores payer_record as a jsonb object
 * { approved_amount_micros: "1000000", delivery_status: "verified_complete", source: "operator-upload" }.
 * On the payment message that value is an object, the amount is the string "1000000",
 * and the status is the string "verified_complete". That input is one tuple.
 *
 * The live rules adjudication for that intent was ok false, latency 0, tuple null:
 * the previous no-match return, which stored no reason. An object shaped as
 * { $type: "Json", value } has no delivery_status of its own, and that return is
 * what the previous function produced for it. Unwrap that tag. Exactly one
 * verified_complete record becomes the tuple. Zero or several is not guessed.
 * A miss or a throw is stored as { error } naming the type, keys, and status
 * that arrived, so the receipt can say why check 2 had no answer.
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

/** What the last call received on the first open order, before any unwrap. Tests print this. */
export type RulesInputSeen = {
  orderCount: number;
  payerRecordType: string;
  payerRecordJson: string;
  approvedAmountMicrosType: string;
  approvedAmountMicros: string | null;
  deliveryStatusType: string;
  deliveryStatus: string | null;
  keys: string[];
};

export let rulesInputSeen: RulesInputSeen | null = null;

function valueKind(value: unknown): string {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function shownScalar(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return String(value);
  return null;
}

function see(orders: readonly ScopedWorkOrder[]): void {
  const order = orders[0];
  const raw = order ? rawRecord(order) : undefined;
  const rawObject = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  const amount = rawObject ? (rawObject.approved_amount_micros ?? rawObject.approvedAmountMicros) : undefined;
  const status = rawObject ? ("delivery_status" in rawObject ? rawObject.delivery_status : rawObject.deliveryStatus) : undefined;
  let payerRecordJson = "";
  try {
    payerRecordJson = raw === undefined ? "" : JSON.stringify(raw);
  } catch {
    payerRecordJson = Object.prototype.toString.call(raw);
  }
  if (payerRecordJson.length > 500) payerRecordJson = payerRecordJson.slice(0, 500);
  rulesInputSeen = {
    orderCount: orders.length,
    payerRecordType: order === undefined ? "missing" : valueKind(raw),
    payerRecordJson,
    approvedAmountMicrosType: valueKind(amount),
    approvedAmountMicros: shownScalar(amount),
    deliveryStatusType: valueKind(status),
    deliveryStatus: typeof status === "string" ? status : null,
    keys: rawObject ? Object.keys(rawObject) : []
  };
}

function digitString(value: unknown): string | null {
  if (typeof value === "bigint" && value >= 0n) return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  return null;
}

/**
 * A payer record arrives as an object, as JSON text, or still wrapped the way
 * Prisma tags a json column: { $type: "Json", value }. That wrapper is an object
 * with no delivery_status. The previous function treated it as no match and
 * stored nothing. Read the inner value. A non-JSON string is not a record.
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
  const record = value as Record<string, unknown>;
  if (record.$type === "Json" && "value" in record && Object.keys(record).every((key) => key === "$type" || key === "value")) {
    return asRecord(record.value, depth + 1);
  }
  return record;
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
  const kind = valueKind(raw);
  const record = recordOf(order);
  const source = record ?? (raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null);
  if (!source) return `payer_record ${kind}`;
  const keys = Object.keys(source).slice(0, 8).join(",");
  const amount = source.approved_amount_micros ?? source.approvedAmountMicros;
  const amountShown = shownScalar(amount);
  const status = "delivery_status" in source ? source.delivery_status : source.deliveryStatus;
  const statusShown = typeof status === "string" ? status.slice(0, 40) : null;
  return `payer_record ${kind}, keys ${keys}, approved_amount_micros ${valueKind(amount)}${amountShown !== null ? ` ${amountShown.slice(0, 24)}` : ""}, delivery_status ${valueKind(status)}${statusShown ? ` ${statusShown}` : ""}`;
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
    see(orders);
    const tuple = selectPayerRecordTuple(orders, receivedAt);
    if (!tuple) return failureResult(explainMiss(orders));
    return answer(tuple);
  } catch (error) {
    return failureResult(errorText(error));
  }
}
