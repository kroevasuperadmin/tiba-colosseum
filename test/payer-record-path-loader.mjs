// Resolves the @/ alias for this test, and points the payment engine at the in-memory ledger.
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = path.resolve(import.meta.dirname, "..");
const fakeDb = pathToFileURL(path.join(projectRoot, "test/payer-record-fake-db.mjs")).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@/lib/db" || specifier.endsWith("/src/lib/db.ts")) {
    return nextResolve(fakeDb, context);
  }
  if (specifier.startsWith("@/")) {
    const base = path.join(projectRoot, "src", specifier.slice(2));
    const direct = `${base}.ts`;
    const resolved = existsSync(direct) ? direct : path.join(base, "index.ts");
    return nextResolve(pathToFileURL(resolved).href, context);
  }
  return nextResolve(specifier, context);
}
