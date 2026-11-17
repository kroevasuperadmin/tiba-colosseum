import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { buildRefusalWall, type RefusalWall } from "@/lib/refusal-wall";

// Columns the receipt page already uses for a public link. No agent, recipient
// address, payer record, delivery note, or key material is selected.
const PUBLIC_RECEIPT_SELECT = {
  publicToken: true,
  decisionClass: true,
  reasonCode: true,
  amountMicros: true,
  chain: true,
  createdAt: true,
  adjudications: {
    select: {
      channel: true,
      tupleJson: true
    }
  }
} as const;

async function loadRefusalWall(): Promise<RefusalWall> {
  const intents = await prisma.payoutIntent.findMany({
    orderBy: { createdAt: "desc" },
    select: PUBLIC_RECEIPT_SELECT
  });

  return buildRefusalWall(
    intents.map((intent) => ({
      publicToken: intent.publicToken,
      decisionClass: intent.decisionClass,
      reasonCode: intent.reasonCode,
      amountMicros: intent.amountMicros.toString(),
      chain: intent.chain,
      createdAt: intent.createdAt.toISOString(),
      adjudications: intent.adjudications.map((row) => ({
        channel: row.channel,
        tupleJson: row.tupleJson
      }))
    }))
  );
}

// Server-rendered page data, reused for 60 seconds. The page itself sets the same window.
export const getRefusalWall = unstable_cache(loadRefusalWall, ["public-refusal-wall"], {
  revalidate: 60
});
