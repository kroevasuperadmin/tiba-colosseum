// Same alias hook as the payment-path test, but check 2 throws a pool error.
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = path.resolve(import.meta.dirname, "..");
const fakeDb = pathToFileURL(path.join(projectRoot, "test/payer-record-fake-db.mjs")).href;
const throwingRules = pathToFileURL(path.join(projectRoot, "test/payer-record-throwing-rules.mjs")).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith("payer-record-rules.ts") || specifier.endsWith("payer-record-rules.mjs")) {
    return nextResolve(throwingRules, context);
  }
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
