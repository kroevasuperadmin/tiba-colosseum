import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertReplayBelongsTo, IDEMPOTENCY_KEY_IN_USE } from "../src/lib/payout-guards.ts";

const engineSource = readFileSync(new URL("../src/lib/payout-intent.ts", import.meta.url), "utf8");
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

test("Telegram payment keys are random, not built from the clock", () => {
  assert.doesNotMatch(telegram, /tg-\$\{Date\.now\(\)\}/);
  assert.match(telegram, /idempotency_key: `tg-\$\{randomUUID\(\)\}`/);
});
