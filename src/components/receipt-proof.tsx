"use client";

import { useState } from "react";

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Shows the receipt fingerprint and lets the visitor recompute it in their own browser from the
 * exact text shown, then compare it with a hash they saved earlier or read from a devnet memo.
 * It is a fingerprint, not a signature: it shows a later change, it does not prove who made it.
 */
export function ReceiptProof({ canonicalText, hash }: { canonicalText: string; hash: string }) {
  const [recomputed, setRecomputed] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState(false);

  async function recompute() {
    try {
      setError(false);
      setRecomputed(await sha256Hex(canonicalText));
    } catch {
      setError(true);
    }
  }

  const savedClean = saved.trim().toLowerCase().replace(/^tiba-receipt-v1:/, "");
  return (
    <section className="card p-5" id="receipt-fingerprint">
      <h2 className="title">Receipt fingerprint</h2>
      <p className="mt-2 text-sm text-muted">
        This is the SHA-256 of the text below. Save it. If this page changes later, the fingerprint changes.
        It is not a signature, and it does not prove the two readers were right.
      </p>
      <p className="num mt-3 break-all text-xs" data-testid="receipt-hash">{hash}</p>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm">Show the exact text that is hashed</summary>
        <pre className="num mt-2 max-w-full overflow-x-auto whitespace-pre-wrap break-all text-xs">{canonicalText}</pre>
      </details>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-ghost" onClick={recompute}>Recompute in my browser</button>
        {recomputed !== null ? (
          <span className="text-sm" role="status">
            {recomputed === hash ? "Recomputed here. It matches the fingerprint above." : "Recomputed here. It does NOT match."}
          </span>
        ) : null}
        {error ? <span className="text-sm">This browser could not compute it.</span> : null}
      </div>
      <label className="mt-4 block text-sm">
        Compare with a fingerprint you saved earlier
        <input
          className="num mt-1 block w-full rounded border border-line bg-transparent px-2 py-1 text-xs"
          value={saved}
          onChange={(event) => setSaved(event.target.value)}
          placeholder="paste 64 characters"
          spellCheck={false}
        />
      </label>
      {savedClean ? (
        <p className="mt-2 text-sm" role="status">
          {savedClean === hash ? "Same as the saved one." : "Different from the saved one."}
        </p>
      ) : null}
    </section>
  );
}
