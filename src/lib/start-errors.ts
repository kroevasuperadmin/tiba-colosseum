/** Plain words for the codes /api/v1/workspaces sends back, so a visitor never reads a raw code. */
export function friendlyStartError(code: string | undefined, retryAfterSeconds?: number): string {
  switch (code) {
    case "RATE_LIMITED": {
      const minutes = retryAfterSeconds && retryAfterSeconds > 0 ? Math.ceil(retryAfterSeconds / 60) : null;
      return `Too many wallets were created from this network just now. ${minutes ? `Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}, or ` : "Try again later, or "}use the Try it page, which needs no wallet.`;
    }
    case "NAME_REQUIRED":
      return "Give the workspace a name first.";
    case "INVALID_SOLANA_ADDRESS":
      return "That does not look like a Solana address. Check it, or leave it blank.";
    case "SOLANA_ADDRESS_REQUIRED":
      return "Paste a Solana test network address to receive payments. This site has no default address set.";
    default:
      return "Something went wrong and no wallet was made. Try again.";
  }
}
