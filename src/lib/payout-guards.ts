/**
 * Deterministic guards the payment path runs before any model check or debit. Pure, so the
 * tests can load them directly; the engine (payout-intent.ts) wires them to the database.
 */

export const IDEMPOTENCY_KEY_IN_USE = "IDEMPOTENCY_KEY_IN_USE";

/**
 * The idempotency key column is unique across the deployment, so a replay lookup can find
 * another workspace's intent. Only the workspace that created the intent may see it again;
 * anyone else is told the key is taken and nothing of the stored intent is returned.
 */
export function assertReplayBelongsTo(existing: { agentId: string }, agent: { id: string }): void {
  if (existing.agentId !== agent.id) throw new Error(IDEMPOTENCY_KEY_IN_USE);
}
