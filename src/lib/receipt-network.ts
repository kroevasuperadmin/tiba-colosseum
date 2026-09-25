// Payout records pre-dating the Solana rail either explicitly say "sui" or have
// no chain value. This is receipt display only: neither value can reach a rail.
export function receiptNetwork(chain: string | null): string {
  if (chain === "solana") return "Solana devnet";
  if (chain === "tempo") return "Tempo testnet";
  if (chain === "zcash") return "Zcash testnet";
  if (chain === "mock") return "Simulated, no transfer";
  if (chain === "sui" || chain === null) return "Sui testnet";
  return "Test network";
}

/** Shielded Zcash receipts do not make the memo public. The auditor gets the key on request. */
export function receiptViewingKeyNote(chain: string | null): string | null {
  if (chain === "zcash") return "viewing key available on request";
  return null;
}
