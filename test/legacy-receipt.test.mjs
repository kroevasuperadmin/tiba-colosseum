import assert from "node:assert/strict";
import test from "node:test";
import { receiptNetwork } from "../src/lib/receipt-network.ts";

test("legacy receipt network is derived from the stored chain without enabling a legacy rail", () => {
  assert.equal(receiptNetwork("solana"), "Solana devnet");
  assert.equal(receiptNetwork("tempo"), "Tempo testnet");
  assert.equal(receiptNetwork("zcash"), "Zcash testnet");
  assert.equal(receiptNetwork("sui"), "Sui testnet");
  assert.equal(receiptNetwork(null), "No transfer attempted");
  assert.equal(receiptNetwork("mock"), "Simulated, no transfer");
  assert.equal(receiptNetwork("sandbox"), "Sandbox try, nothing sent");
});
