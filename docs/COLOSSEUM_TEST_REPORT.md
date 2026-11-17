# Colosseum test-network check

Checked on 25 September 2026 from a Cursor cloud machine, on branch `colosseum-all` (`9b21052`). Nothing was merged and nothing was deployed. No real money. No private key or seed phrase was committed.

The app was built and served against a throwaway Postgres database on this machine (`tiba_throwaway`). The public site was not used.

## Payments

### Tempo — passed

One payment of 0.01 pathUSD on Tempo Moderato (chain id 42431). The Moderato faucet funded a new treasury, then `scripts/tempo-smoke.mjs` sent the payment. The receipt status on the Moderato RPC is success.

- Transaction: https://explore.testnet.tempo.xyz/tx/0x0c7b5304c079a4ae970b23db6b802e6a3d2870e390276d86ef314225b1ba90f4
- Recipient: `0xBEf5925f5c6C60d527b931E9269B35B50419FF98`
- Token: pathUSD `0x20c0000000000000000000000000000000000000`

### Zcash — passed

One shielded payment of 100000 zatoshis (0.001 TAZ) on Zcash testnet, with memo `Tiba payout WO-ZCASH-SPIKE-1`. `scripts/zcash/spike.mjs` sent it through `zingo-cli` and `https://testnet.zec.rocks:443`. A view-only wallet read the memo back. The viewing key is not written here.

- Transaction: https://testnet.cipherscan.app/tx/f6d1cd9a3c13b259b4bb5b935caca187d51dfbfc34a04793e0f6b9658c358511
- Faucet funding (0.1 TAZ, not the payout): https://testnet.cipherscan.app/tx/eaf07b44829c8e7d97249d564c87126f6c22d6fdd7d11363dfb73bc7e0711720

`fauzec.com` accepted a claim and left it pending (`submission_ambiguous`). It did not fund the wallet. The other testnet faucet listed by ZecHub, `zcashfaucet.jinolabs.xyz`, did. That drip is the funding transaction above. The spike script then sent the 0.001 TAZ payment.

The script also rewrote `scripts/zcash/PAYMENT.md` and included a viewing key. That file was restored, so the new key is not in git. Wallet files stayed in `~/.tiba-zcash-spike`, outside the repository.

### Solana — failed

`scripts/solana-smoke.mjs` was not able to send a devnet USDC payment.

- `https://api.devnet.solana.com` refused the SOL airdrop (`Internal error`, and at one point said the faucet was used up or rate limited).
- `https://solana-devnet.g.alchemy.com/v2/demo` returned one airdrop signature, then HTTP 429 on later calls. That signature was not confirmed afterwards, and it is not a Tiba payout.
- Circle's devnet USDC faucet (`faucet.circle.com`) rejected the request: reCAPTCHA verification failed. No devnet USDC was received.
- The proof-of-work faucets on devnet were empty or paid too little to cover a transfer, except one faucet that needs a public key starting with `AAAAA`. That grind was not finished.

There is no Solana transaction link for a Tiba payout.

## Pages

Headless Chromium opened the local app (desktop 1280px and mobile 390px).

The homepage is one page. It does not change per chain. Its paid example looks up one fixed intent id. On this throwaway database that row is the Tempo payment, so the example card shows Tempo and links to that receipt. The Zcash receipt was opened by its own link.

| Page | Result |
| --- | --- |
| Homepage | Passed. Title “Tiba — a wallet for AI agents”, test-network line, and a paid example that links to the Tempo receipt. |
| Tempo receipt `/r/tempo-smoke-receipt` | Passed. Says Paid, “Paid on Tempo testnet.”, 0.01 USDC, and the Tempo transaction link. Reached by clicking “Open receipt” on the homepage. |
| Zcash receipt `/r/zcash-smoke-receipt` | Passed. Says Paid, “Paid on Zcash testnet.”, the Zcash transaction link, and “viewing key available on request”. |
| Solana receipt | Not checked. There was no Solana payment to show. |

The receipt pages label the amount USDC even for Tempo and Zcash. Tempo was 0.01 pathUSD. Zcash was 0.001 TAZ, shown as 0.001 USDC.

The “Why” line on a paid receipt says both checks agreed. The table under it says the two checks were not run. That is because these rows were inserted so the pages could show the real test payments. The smoke scripts do not go through the two-check pipeline.

No browser page errors. The server log did report an Auth.js `UntrustedHost` warning for `/api/auth/session`. The pages still loaded.

## What was not checked

- A Solana devnet payout, and the Solana receipt page.
- Sign-in, creating a wallet, the fund page, or sending a payment from inside the app.
- The two-check reader path.
- Mainnet, real funds, a deploy, or a merge.
- The unit tests. GitHub on `colosseum-all` was already green; this run did not repeat them.
- This machine has Node 22.14. The repo asks for Node 24, and CI uses Node 25. The smoke scripts needed Node’s type-stripping flag here.
