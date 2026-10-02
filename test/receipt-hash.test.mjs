import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { Keypair } from "@solana/web3.js";
import { canonicalReceiptText, receiptHash, receiptAnchorMemo, hashFromAnchorMemo } from "../src/lib/receipt-hash.ts";
import { anchorEnabled, anchorReceiptHash, buildReceiptAnchorTransaction } from "../src/lib/rails/anchor.ts";

const base = {
  token: "tok-1",
  decisionClass: "RED",
  status: "refused",
  reasonCode: "QUORUM_SPLIT_WORK_ORDER",
  amountMicros: 9000000n,
  chain: "sandbox",
  digest: null,
  createdAt: new Date("2026-10-02T01:02:03.000Z"),
  billSha256: "ab".repeat(32),
  adjudications: [
    { channel: "payer_record", model: "m2", promptSha: "p2", responseSha: "r2", tupleJson: { b: 1, a: 2 }, ok: true },
    { channel: "artifact", model: "m1", promptSha: "p1", responseSha: "r1", tupleJson: { work_order_id: "WO-FAKE-999" }, ok: true }
  ]
};

test("the hash is the SHA-256 of the printed canonical text, so anyone can rebuild it", () => {
  const text = canonicalReceiptText(base);
  assert.equal(receiptHash(base), createHash("sha256").update(text).digest("hex"));
  assert.ok(text.indexOf('"artifact"') < text.indexOf('"payer_record"'), "checks are sorted by channel");
  assert.ok(text.includes('"read":{"a":2,"b":1}'), "keys are sorted");
});

test("changing any shown fact changes the hash", () => {
  const h = receiptHash(base);
  assert.notEqual(h, receiptHash({ ...base, amountMicros: 1000000n }));
  assert.notEqual(h, receiptHash({ ...base, reasonCode: "OTHER" }));
  assert.notEqual(h, receiptHash({ ...base, decisionClass: "PAID" }));
  assert.notEqual(h, receiptHash({ ...base, adjudications: base.adjudications.slice(1) }));
  assert.equal(h, receiptHash({ ...base, adjudications: [...base.adjudications].reverse() }));
});

test("memo round trip and a foreign memo is ignored", () => {
  const h = receiptHash(base);
  assert.equal(hashFromAnchorMemo(receiptAnchorMemo(h)), h);
  assert.equal(hashFromAnchorMemo("Tiba payout abc"), null);
  assert.throws(() => receiptAnchorMemo("nothex"));
});

test("anchor is off unless RECEIPT_ANCHOR=devnet and does nothing then", async () => {
  const saved = process.env.RECEIPT_ANCHOR;
  delete process.env.RECEIPT_ANCHOR;
  try {
    assert.equal(anchorEnabled(), false);
    assert.equal(await anchorReceiptHash(receiptHash(base)), null);
  } finally {
    if (saved !== undefined) process.env.RECEIPT_ANCHOR = saved;
  }
});

test("anchor with the setting on sends one memo-only transaction through a fake connection", async () => {
  const saved = process.env.RECEIPT_ANCHOR;
  process.env.RECEIPT_ANCHOR = "devnet";
  try {
    const keypair = Keypair.generate();
    const sent = [];
    const connection = {
      async getLatestBlockhash() { return { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 10 }; },
      async sendRawTransaction(raw) { sent.push(raw); return "fake-signature"; },
      async confirmTransaction() { return { value: { err: null } }; }
    };
    const hash = receiptHash(base);
    const result = await anchorReceiptHash(hash, { connection, keypair });
    assert.equal(result.signature, "fake-signature");
    assert.equal(sent.length, 1);
    const tx = buildReceiptAnchorTransaction(hash, keypair.publicKey);
    assert.equal(tx.instructions.length, 1);
    assert.equal(tx.instructions[0].data.toString("utf8"), `tiba-receipt-v1:${hash}`);
  } finally {
    if (saved === undefined) delete process.env.RECEIPT_ANCHOR; else process.env.RECEIPT_ANCHOR = saved;
  }
});
