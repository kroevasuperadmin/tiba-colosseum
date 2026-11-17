/**
 * URL Prisma CLI uses for migrations. The app runtime reads DATABASE_URL itself
 * (see src/lib/db.ts). Prefer DIRECT_URL so migrate can use the session or
 * direct entrance while the app uses the transaction pooler.
 */
export function migrateDatasourceUrl(env: NodeJS.ProcessEnv = process.env): string {
  const direct = env.DIRECT_URL?.trim();
  if (direct) return direct;
  return env.DATABASE_URL ?? "file:./dev.db";
}
