import type { PoolConfig } from "pg";

/** Supavisor transaction mode. The server session ends when the transaction ends. */
export const TRANSACTION_POOLER_PORT = 6543;

const DEFAULT_POOL_MAX = 1;
const POOL_IDLE_TIMEOUT_MILLIS = 5_000;
const POOL_CONNECTION_TIMEOUT_MILLIS = 10_000;

/**
 * How many connections this process may hold. Unset, blank, or not a positive
 * integer means 1, so a bad value cannot fall through to the driver's default of 10.
 */
export function poolMax(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_POOL_MAX;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_POOL_MAX;
  return parsed;
}

/** Port from a postgres URL. A missing port is the Postgres default, 5432. */
export function connectionPort(connectionString: string): number | null {
  try {
    const url = new URL(connectionString);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return null;
    if (url.port === "") return 5432;
    const port = Number(url.port);
    return Number.isInteger(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}

export function usesTransactionPooler(connectionString: string): boolean {
  return connectionPort(connectionString) === TRANSACTION_POOLER_PORT;
}

export function prismaPoolConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  return {
    connectionString,
    max: poolMax(env.DB_POOL_MAX),
    idleTimeoutMillis: POOL_IDLE_TIMEOUT_MILLIS,
    connectionTimeoutMillis: POOL_CONNECTION_TIMEOUT_MILLIS
  };
}

/**
 * Second argument to PrismaPg.
 *
 * Prepared statements are not named on any entrance. Naming them would cache
 * the statement on the server session. Supavisor's transaction pooler (port
 * 6543) drops that session at the end of the transaction, so the next request
 * can land on a different session where the name does not exist. The adapter
 * caches a statement only when `statementNameGenerator` is set; this object
 * never sets it.
 */
export function prismaPgOptions(connectionString: string): Record<string, never> {
  if (usesTransactionPooler(connectionString)) return {};
  return {};
}

export function openDatabaseAdapter<T>(
  Adapter: new (config: PoolConfig, options: Record<string, never>) => T,
  env: NodeJS.ProcessEnv = process.env
): T {
  const config = prismaPoolConfig(env);
  const connectionString = config.connectionString;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const options = prismaPgOptions(connectionString);
  if (usesTransactionPooler(connectionString) && "statementNameGenerator" in options) {
    throw new Error("transaction pooler cannot cache prepared statements");
  }
  return new Adapter(config, options);
}
