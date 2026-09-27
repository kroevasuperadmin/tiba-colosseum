import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertReplayBelongsTo, effectiveChannels, IDEMPOTENCY_KEY_IN_USE } from "../src/lib/payout-guards.ts";
import { reconcile } from "../src/lib/reconcile.ts";

const engineSource = readFileSync(new URL("../src/lib/payout-intent.ts", import.meta.url), "utf8");
const limitsPage = readFileSync(new URL("../src/app/policies/limits-client.tsx", import.meta.url), "utf8");
const intentsRoute = readFileSync(new URL("../src/app/api/v1/intents/route.ts", import.meta.url), "utf8");
const x402Route = readFileSync(new URL("../src/app/api/v1/x402/route.ts", import.meta.url), "utf8");
const telegram = readFileSync(new URL("../src/lib/telegram-agent.ts", import.meta.url), "utf8");

test("a replayed idempotency key is only answered for the workspace that used it", () => {
  const mine = { agentId: "ws-a", publicToken: "secret-receipt-token" };
  assert.doesNotThrow(() => assertReplayBelongsTo(mine, { id: "ws-a" }));
  assert.throws(() => assertReplayBelongsTo(mine, { id: "ws-b" }), { message: IDEMPOTENCY_KEY_IN_USE });
});

test("the engine checks ownership before it returns a stored intent, and the routes answer 409", () => {
  const lookup = engineSource.indexOf("findUnique({ where: { idempotencyKey: body.idempotency_key } })");
  const ownership = engineSource.indexOf("assertReplayBelongsTo(existing, agent)");
  const replay = engineSource.indexOf("return toPublicIntent(existing)");
  assert.ok(lookup > 0 && ownership > lookup && replay > ownership, "ownership must be checked between the lookup and the replay");
  for (const source of [intentsRoute, x402Route]) {
    const mapped = source.indexOf("IDEMPOTENCY_KEY_IN_USE }, { status: 409 }");
    assert.ok(mapped > 0, "route must map IDEMPOTENCY_KEY_IN_USE to 409");
  }
});

test("the amount rule cannot be turned off: a work order's stored choice only ever adds strictness", () => {
  // $100 stored as 'your own record only' still takes both checks.
  assert.equal(effectiveChannels("payer_record", 100_000_000n), "both");
  // $250.000001 stored as 'both' still goes to a person.
  assert.equal(effectiveChannels("both", 250_000_001n), "human");
  assert.equal(effectiveChannels("payer_record", 400_000_000n), "human");
  // Stricter is kept; the amount never loosens what the owner asked for.
  assert.equal(effectiveChannels("both", 1_000_000n), "both");
  assert.equal(effectiveChannels("human", 1_000_000n), "human");
  assert.equal(effectiveChannels("payer_record", 49_999_999n), "payer_record");
  assert.equal(effectiveChannels("both", 250_000_000n), "both", "$250 exactly is still two checks");

  // And what that means for the payment: a $400 bill that both checks agree on is held for a person.
  const tuple = { workOrderId: "WO-7", amountMicros: 400_000_000n, deliveryTimestamp: "2026-09-27T00:00:00Z" };
  assert.deepEqual(reconcile(effectiveChannels("both", tuple.amountMicros), { artifact: tuple, payer_record: tuple }), {
    ok: false, decisionClass: "AMBER", reasonCode: "HUMAN_REVIEW_REQUIRED"
  });
});

test("the engine applies the amount rule on the payment path, from the payer-record amount", () => {
  const stored = engineSource.indexOf("const storedChannels = channelPolicyWorkOrder");
  const applied = engineSource.indexOf("effectiveChannels(storedChannels, payerTuple.amountMicros)");
  const reconciled = engineSource.indexOf("reconcile(requiredChannels,");
  assert.ok(stored > 0 && applied > stored && reconciled > applied);
  assert.match(limitsPage, /Over \$250: a person decides, whatever the work order says\. This cannot be turned off\./);
  assert.match(limitsPage, /Under \$50: at least one check/);
});

test("Telegram payment keys are random, not built from the clock", () => {
  assert.doesNotMatch(telegram, /tg-\$\{Date\.now\(\)\}/);
  assert.match(telegram, /idempotency_key: `tg-\$\{randomUUID\(\)\}`/);
});
