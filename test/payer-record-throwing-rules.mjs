/** Stand-in for check 2 when the database refuses another connection. */
export function readPayerRecordByRules() {
  throw new Error("max clients reached in session mode, pool_size 15");
}
