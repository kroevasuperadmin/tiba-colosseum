// Optional: write a receipt fingerprint into the memo of a tiny Solana DEVNET transaction.
// Usage: RECEIPT_ANCHOR=devnet SOLANA_NETWORK=devnet SOLANA_PRIVATE_KEY=<from your env> npm run anchor:receipt -- <64-hex hash from the receipt page>
// Moves no tokens. Test network only. Does nothing unless RECEIPT_ANCHOR=devnet.
const hash = process.argv[2];
if (!hash || !/^[0-9a-f]{64}$/.test(hash)) {
  console.error("Pass the 64-character fingerprint shown on the receipt page.");
  process.exit(1);
}
const { anchorReceiptHash, anchorEnabled } = await import("../src/lib/rails/anchor.ts");
if (!anchorEnabled()) {
  console.error("Anchoring is off. Set RECEIPT_ANCHOR=devnet to turn it on.");
  process.exit(1);
}
const result = await anchorReceiptHash(hash);
console.log(JSON.stringify({ hash, signature: result?.signature, explorer: result?.explorerUrl }, null, 2));
