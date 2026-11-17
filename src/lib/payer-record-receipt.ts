import { createElement, type ReactNode } from "react";
import { formatLatency } from "./money.ts";
import { PAYER_RECORD_RULES_MODEL } from "./payer-record-rules.ts";

/** Shown on the receipt when check 2 was the rules function, not a model. */
export const CHECK_2_RULES_LABEL = "Check 2: rules, no AI";

export type PayerRecordCheckProps = {
  model: string | null;
  fallback?: string | null;
  requestId?: string | null;
  latencyMs?: number | null;
  /** Why check 2 stored no tuple. Null when it answered. */
  noAnswer?: string | null;
};

/** The error stored on a check-2 row that did not produce a tuple. */
export function payerRecordNoAnswer(tupleJson: unknown): string | null {
  if (!tupleJson || typeof tupleJson !== "object" || Array.isArray(tupleJson)) return null;
  const row = tupleJson as Record<string, unknown>;
  if (typeof row.work_order_id === "string" && typeof row.amount_micros === "string" && /^\d+$/.test(row.amount_micros)) {
    return null;
  }
  return typeof row.error === "string" && row.error.trim() ? row.error.trim() : null;
}

/** The detail cell for check 2 on the public receipt. */
export function PayerRecordCheckDetail(props: PayerRecordCheckProps): ReactNode {
  const reason = props.noAnswer
    ? createElement("div", null, "No answer: ", props.noAnswer)
    : null;

  if (props.model === PAYER_RECORD_RULES_MODEL) {
    return createElement(
      "div",
      { className: "text-sm" },
      createElement("div", null, CHECK_2_RULES_LABEL),
      reason
    );
  }

  return createElement(
    "div",
    { className: "text-sm" },
    createElement("div", { className: "break-all" }, "Model used: ", props.model),
    props.fallback
      ? createElement(
          "div",
          { style: { color: "var(--held)" } },
          "The reading service swapped in a different model for this reader: ",
          createElement("span", { className: "num break-all text-xs" }, props.fallback)
        )
      : null,
    createElement(
      "div",
      null,
      "Reference (request ID): ",
      createElement("span", { className: "num break-all text-xs" }, props.requestId ?? "missing")
    ),
    createElement(
      "div",
      null,
      "Took: ",
      createElement("span", { className: "num" }, formatLatency(props.latencyMs))
    ),
    reason
  );
}
