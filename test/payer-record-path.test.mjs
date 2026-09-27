import assert from "node:assert/strict";
import { register } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { resetLedger, storedAdjudications, useRecipient, useWorkOrder } from "./payer-record-fake-db.mjs";

register(pathToFileURL(path.join(import.meta.dirname, "payer-record-path-loader.mjs")).href, {
  parentURL: import.meta.url
});

const { processPayoutIntent } = await import("../src/lib/payout-intent.ts");

const LIVE_RECORD = {
  approved_amount_micros: 1000000,
  delivery_status: "verified_complete",
  source: "operator-upload"
};

const RECIPIENT = {
  id: "rec-sol-self",
  ref: "sol-self-0911",
  agentId: "agent-1",
  active: true,
  solanaAddress: "So11111111111111111111111111111111111111112",
  displayName: "Treasury self-pay test",
  kycStatus: "unverified",
  kycExpiresAt: null
};

const AGENT = {
  id: "agent-1",
  requireRecipientKyc: false,
  rail: "mock",
  ceilingMicros: 100_000_000n,
  hourCapMicros: 100_000_000n,
  dayCapMicros: 100_000_000n,
  hourCountCap: 100,
  dayCountCap: 100,
  killSwitch: false
};

function workOrder() {
  return {
    id: "wo-r2",
    ref: "WO-R2",
    recipientId: RECIPIENT.id,
    ceilingMicros: 1_000_000n,
    briefText: "One open invoice.",
    // Raw text of a jsonb string. One JSON.parse still leaves a string, which the
    // first rules deploy treated as no record and held every both-check payment.
    payerRecord: JSON.stringify(JSON.stringify(LIVE_RECORD)),
    requiredChannels: "both",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    status: "open",
    dischargedByIntentId: null
  };
}

function bill(usdc) {
  return `Work order: WO-R2\nDelivered: accepted.\nAmount due: ${usdc} USDC`;
}

test("processPayoutIntent refuses 1.30 and agrees on 1.00 for the one open WO-R2 record", async () => {
  const previousRail = process.env.RAIL;
  const previousKey = process.env.GROQ_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.RAIL = "solana";
  process.env.GROQ_API_KEY = "test-key";
  resetLedger();
  useRecipient(RECIPIENT);
  useWorkOrder(workOrder());

  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (!href.includes("groq.com")) {
      return { ok: false, status: 503, headers: { get: () => null }, json: async () => ({}) };
    }
    const body = JSON.parse(init.body);
    const user = body.messages.find((message) => message.role === "user");
    const artifact = JSON.parse(user.content).artifact_text_and_links;
    const usdc = artifact.match(/Amount due: ([0-9.]+) USDC/)[1];
    const micros = String(Math.round(Number(usdc) * 1_000_000));
    const content = JSON.stringify({
      work_order_id: "WO-R2",
      amount_micros: micros,
      delivery_timestamp: "2026-09-27T16:40:00.000Z",
      evidence: "delivery note"
    });
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 3, completion_tokens: 2 }
      })
    };
  };

  try {
    const over = await processPayoutIntent(AGENT, {
      idempotency_key: "wo-r2-130",
      artifact: bill("1.30"),
      recipient_ref: "sol-self-0911"
    });
    assert.equal(over.status, "refused");
    assert.equal(over.decisionClass, "RED");
    assert.equal(over.reasonCode, "QUORUM_SPLIT:amount_micros");

    const payer = storedAdjudications().find((row) => row.channel === "payer_record");
    assert.equal(payer.model, "rules");
    assert.equal(payer.ok, true);
    assert.equal(payer.tupleJson.work_order_id, "WO-R2");
    assert.equal(payer.tupleJson.amount_micros, "1000000");
    assert.equal(payer.tupleJson.error, undefined);

    const agreed = await processPayoutIntent(AGENT, {
      idempotency_key: "wo-r2-100",
      artifact: bill("1.00"),
      recipient_ref: "sol-self-0911"
    });
    assert.equal(agreed.status, "settled");
    assert.equal(agreed.decisionClass, "PAID");
    assert.equal(agreed.amountMicros, "1000000");
    assert.match(agreed.digest ?? "", /^mock-testnet-/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousKey;
    if (previousRail === undefined) delete process.env.RAIL;
    else process.env.RAIL = previousRail;
  }
});
