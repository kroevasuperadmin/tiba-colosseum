import assert from "node:assert/strict";
import { register } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { resetLedger, storedAdjudications, useRecipient, useWorkOrder } from "./payer-record-fake-db.mjs";

register(pathToFileURL(path.join(import.meta.dirname, "payer-record-db-error-loader.mjs")).href, {
  parentURL: import.meta.url
});

const { processPayoutIntent } = await import("../src/lib/payout-intent.ts");

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

test("a database error in check 2 is stored on the adjudication, not dropped", async () => {
  const previousRail = process.env.RAIL;
  const previousKey = process.env.GROQ_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.RAIL = "solana";
  process.env.GROQ_API_KEY = "test-key";
  resetLedger();
  useRecipient(RECIPIENT);
  useWorkOrder({
    id: "wo-r2",
    ref: "WO-R2",
    recipientId: RECIPIENT.id,
    ceilingMicros: 1_000_000n,
    briefText: "One open invoice.",
    payerRecord: {
      approved_amount_micros: 1000000,
      delivery_status: "verified_complete",
      source: "operator-upload"
    },
    requiredChannels: "both",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    status: "open",
    dischargedByIntentId: null
  });

  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (!href.includes("groq.com")) {
      return { ok: false, status: 503, headers: { get: () => null }, json: async () => ({}) };
    }
    const content = JSON.stringify({
      work_order_id: "WO-R2",
      amount_micros: "1300000",
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
    const held = await processPayoutIntent(AGENT, {
      idempotency_key: "wo-r2-pool",
      artifact: "Work order: WO-R2\nAmount due: 1.30 USDC",
      recipient_ref: "sol-self-0911"
    });
    assert.equal(held.status, "held");
    assert.equal(held.reasonCode, "MISSING_REQUIRED_CHANNEL");
    assert.equal(held.digest, null);

    const payer = storedAdjudications().find((row) => row.channel === "payer_record");
    assert.equal(payer.model, "rules");
    assert.equal(payer.ok, false);
    assert.equal(payer.tupleJson.work_order_id, undefined);
    assert.equal(payer.tupleJson.amount_micros, undefined);
    assert.equal(payer.tupleJson.error, "max clients reached in session mode, pool_size 15");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousKey;
    if (previousRail === undefined) delete process.env.RAIL;
    else process.env.RAIL = previousRail;
  }
});
