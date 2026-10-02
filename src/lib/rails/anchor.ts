// Optional receipt anchor: one tiny Solana devnet transaction whose memo carries a receipt hash.
// OFF unless RECEIPT_ANCHOR=devnet. It moves no tokens. It only proves the hash existed by the
// time that transaction was confirmed. Devnet only, same guard as the payout rail.
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { receiptAnchorMemo } from "../receipt-hash.ts";
import { PayoutRailError } from "./index.ts";
import { solanaExplorerTxUrl, solanaPayerKeypair, solanaRpcEndpoints } from "./solana.ts";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export function anchorEnabled(): boolean {
  return (process.env.RECEIPT_ANCHOR ?? "").trim().toLowerCase() === "devnet";
}

/** Pure. One memo instruction signed by the payer, nothing else. */
export function buildReceiptAnchorTransaction(hash: string, payer: PublicKey): Transaction {
  const tx = new Transaction();
  tx.add(new TransactionInstruction({
    keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(receiptAnchorMemo(hash), "utf-8")
  }));
  return tx;
}

export interface AnchorDeps {
  connection?: Pick<Connection, "getLatestBlockhash" | "sendRawTransaction" | "confirmTransaction">;
  keypair?: Keypair;
}

/** Returns null when the setting is off. Throws a PayoutRailError when it is on and cannot finish. */
export async function anchorReceiptHash(hash: string, deps: AnchorDeps = {}): Promise<{ signature: string; explorerUrl: string } | null> {
  if (!anchorEnabled()) return null;
  const keypair = deps.keypair ?? solanaPayerKeypair();
  const connection = deps.connection ?? new Connection(solanaRpcEndpoints().primary, "confirmed");
  try {
    const tx = buildReceiptAnchorTransaction(hash, keypair.publicKey);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = keypair.publicKey;
    tx.sign(keypair);
    const signature = await connection.sendRawTransaction(tx.serialize());
    const done = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    if (done.value.err) throw new Error("anchor transaction failed on chain");
    return { signature, explorerUrl: solanaExplorerTxUrl(signature) };
  } catch (error) {
    throw new PayoutRailError("SOLANA_EXECUTION_FAILED", "Receipt anchor could not be confirmed.", { cause: error });
  }
}
