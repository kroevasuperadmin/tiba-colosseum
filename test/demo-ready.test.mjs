import assert from "node:assert/strict";
import test from "node:test";
import { friendlyStartError } from "../src/lib/start-errors.ts";

test("raw codes never reach a visitor", () => {
  for (const code of ["RATE_LIMITED", "NAME_REQUIRED", "INVALID_SOLANA_ADDRESS", "SOLANA_ADDRESS_REQUIRED", "UNKNOWN", undefined]) {
    const text = friendlyStartError(code, 3526);
    assert.doesNotMatch(text, /[A-Z]{3,}_[A-Z_]+/);
    assert.doesNotMatch(text, /—/);
  }
});

test("rate limit message says how long and offers the no-wallet page", () => {
  const text = friendlyStartError("RATE_LIMITED", 3526);
  assert.match(text, /about 59 minutes/);
  assert.match(text, /Try it/);
  assert.match(friendlyStartError("RATE_LIMITED", 60), /1 minute,/);
});

import { isSimulatedDigest } from "../src/lib/receipt-network.ts";

test("a simulated payment never links to a block explorer", () => {
  assert.equal(isSimulatedDigest("mock-testnet-abc123"), true);
  assert.equal(isSimulatedDigest("5NbsG6hTWC8mjBpp1qZNJtAqBiDTJ4fXBgjG5jZkoHG5"), false);
  assert.equal(isSimulatedDigest(null), false);
});
