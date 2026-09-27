import { requiredChannelsForAmount, type RequiredChannels } from "./reconcile.ts";

/**
 * Deterministic guards the payment path runs before any model check or debit. Pure, so the
 * tests can load them directly; the engine (payout-intent.ts) wires them to the database.
 */

export const IDEMPOTENCY_KEY_IN_USE = "IDEMPOTENCY_KEY_IN_USE";

const STRICTNESS: Record<RequiredChannels, number> = { payer_record: 0, both: 1, human: 2 };

/**
 * The checks a payment must pass: the stricter of what the work order stored and what the
 * amount demands (under $50 one check, $50 to $250 both, over $250 a person). A work order can
 * ask for more than its amount requires, never for less. Based on the payer-record amount,
 * because that is the amount that gets debited.
 */
export function effectiveChannels(stored: RequiredChannels, amountMicros: bigint): RequiredChannels {
  const byAmount = requiredChannelsForAmount(amountMicros);
  return STRICTNESS[byAmount] > STRICTNESS[stored] ? byAmount : stored;
}

/**
 * The idempotency key column is unique across the deployment, so a replay lookup can find
 * another workspace's intent. Only the workspace that created the intent may see it again;
 * anyone else is told the key is taken and nothing of the stored intent is returned.
 */
export function assertReplayBelongsTo(existing: { agentId: string }, agent: { id: string }): void {
  if (existing.agentId !== agent.id) throw new Error(IDEMPOTENCY_KEY_IN_USE);
}
