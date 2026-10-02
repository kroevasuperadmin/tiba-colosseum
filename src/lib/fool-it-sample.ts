/** Sample payer record for the /try sandbox. Test network only. Not a live invoice. */
export const SANDBOX_WORK_ORDER_ID = "WO-TRY-FOOL-1";
export const SANDBOX_AMOUNT_USDC = "1.00";
export const SANDBOX_AMOUNT_MICROS = "1000000";
export const SANDBOX_PAYEE_NAME = "Sandbox payee";
export const SANDBOX_RECIPIENT_REF = "tiba-sandbox-fool-payee";
export const SANDBOX_AGENT_ID = "agent-sandbox-fool";
export const SANDBOX_RECIPIENT_ID = "recipient-sandbox-fool";
export const SANDBOX_WORK_ORDER_ROW_ID = "work-order-sandbox-fool";
export const SANDBOX_BRIEF = "One finished piece of work. The payer already recorded it as done.";
export const SANDBOX_WRONG_AMOUNT_USDC = "9.00";
export const SANDBOX_WRONG_WORK_ORDER_ID = "WO-FAKE-999";

export const SANDBOX_PAYER_RECORD = {
  approved_amount_micros: SANDBOX_AMOUNT_MICROS,
  delivery_status: "verified_complete",
  delivery_timestamp: "2026-09-01T12:00:00.000Z",
  note: "Sandbox record for the try-to-fool check. Test network only."
};

/** The bill text both the visitor and the artifact check see. The work order number is stated
 *  on its own labelled line, not folded into a sentence: a live run on 26 Sep found the reading
 *  model sometimes missed an edited work order number when it sat mid-sentence, leaving the
 *  receipt showing a blank invoice. Repeating the label ("Work order:") in front of it, on its
 *  own line, is the more extraction-friendly shape. */
export function sandboxBillText(workOrderId: string, amountUsdc: string): string {
  return `Delivery note.\nWork order: ${workOrderId}\nAmount due: ${amountUsdc} USDC\nStatus: delivered`;
}

export type StoredExample = {
  outcome: "stored_refused" | "stored_would_pay";
  bill: { workOrderId: string; amount: string };
  record: { workOrderId: string; amount: string };
  note: string;
};

/**
 * Fallback for when the reading service is down. A plain comparison of the typed bill with the
 * sample record, done on the spot. It is NOT the two checks and it makes no receipt. The note says
 * so, so nobody mistakes it for a live decision.
 */
export function storedFoolItExample(workOrderId: string, amountUsdc: string): StoredExample {
  const id = workOrderId.trim();
  const amount = amountUsdc.trim();
  const bill = { workOrderId: id, amount: `${amount} USDC` };
  const record = { workOrderId: SANDBOX_WORK_ORDER_ID, amount: `${SANDBOX_AMOUNT_USDC} USDC` };
  const matches = id === SANDBOX_WORK_ORDER_ID && Number(amount) === Number(SANDBOX_AMOUNT_USDC);
  const note =
    "Stored example. The reading service is not answering, so the two checks did not run. This is a plain comparison on this page, with no receipt and nothing sent.";
  return { outcome: matches ? "stored_would_pay" : "stored_refused", bill, record, note };
}
