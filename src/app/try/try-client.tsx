import Link from "next/link";

// Replays two real test-network decisions from 11 Sep. Static on purpose: nothing runs here.
export function TryClient() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 md:px-6 md:py-14 lg:px-8">
      <header className="max-w-xl">
        <p className="eyebrow">Replay · test network · nothing runs</p>
        <h1 className="display-l mt-2">Watch Tiba pay one bill and refuse another.</h1>
        <p className="mt-4 max-w-[58ch] text-sm leading-6 text-muted md:text-base">
          These are two real test-network decisions from 11 Sep. Clicking here replays them; nothing runs.
        </p>
      </header>

      <section className="mt-10 space-y-4">
        <article className="card p-5 md:p-6">
          <p className="font-medium">Your record: invoice WO-SOL-2, 0.01 USDC, to Solana Test (sol-test-0911).</p>
        </article>

        <article className="card p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="font-medium">A bill for 0.01 USDC to Solana Test.</p>
            <span className="pill pill-paid">Paid</span>
          </div>
          <p className="mt-3 text-sm text-muted">
            The bill matched your record, so Tiba paid 0.01 USDC on Solana&apos;s test network.
          </p>
          <Link className="mt-4 inline-block text-sm text-action" href="/r/8ecd74ca-ef81-4d60-b642-a9a1e8ece93c">
            Open the receipt →
          </Link>
        </article>

        <article className="card p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="font-medium">A bill for invoice WO-SOL-2, asking 999.999999 USDC.</p>
            <span className="pill pill-refused">Refused</span>
          </div>
          <p className="mt-3 text-sm text-muted">
            The two checks named different amounts: the bill said 999.999999 USDC, your record said 0.01 USDC.
          </p>
          <Link className="mt-4 inline-block text-sm text-action" href="/r/a079bc29-b6bc-4fd0-9020-6e16bf697ce6">
            Open the refusal receipt →
          </Link>
        </article>
      </section>

      <div className="mt-8 border-t border-line pt-8">
        <h2 className="display-m">Now try it on the test network.</h2>
        <p className="mt-3 max-w-[52ch] text-sm leading-6 text-muted">
          Sign in to create a wallet that pays on Solana&apos;s test network, then send one wrong bill and one right bill. No real money moves.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="btn btn-primary" href="/signin?callbackUrl=/start">
            Connect a wallet
          </Link>
          <Link className="btn btn-secondary" href="/start">
            Create a wallet
          </Link>
        </div>
      </div>
    </div>
  );
}
