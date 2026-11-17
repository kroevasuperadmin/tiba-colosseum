import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { openDatabaseAdapter, connectionPort, usesTransactionPooler } from "../src/lib/db-pool.ts";

const SESSION_URL = "postgresql://user:pass@localhost:5432/tiba";
const TRANSACTION_URL = "postgresql://user:pass@pooler.supabase.com:6543/postgres?sslmode=require";

function capture(env) {
  let received;
  class FakeAdapter {
    constructor(config, options) {
      received = { config, options };
    }
  }
  openDatabaseAdapter(FakeAdapter, env);
  return received;
}

test("the adapter is given a pool of 1 that drops idle connections", () => {
  const received = capture({ DATABASE_URL: SESSION_URL });
  assert.equal(received.config.connectionString, SESSION_URL);
  assert.equal(received.config.max, 1);
  assert.equal(received.config.idleTimeoutMillis, 5000);
  assert.equal(received.config.connectionTimeoutMillis, 10000);
  assert.equal(received.options.statementNameGenerator, undefined);
});

test("DB_POOL_MAX overrides the pool max", () => {
  const received = capture({ DATABASE_URL: SESSION_URL, DB_POOL_MAX: "4" });
  assert.equal(received.config.max, 4);
});

test("a blank or unusable DB_POOL_MAX stays at 1", () => {
  assert.equal(capture({ DATABASE_URL: SESSION_URL, DB_POOL_MAX: "" }).config.max, 1);
  assert.equal(capture({ DATABASE_URL: SESSION_URL, DB_POOL_MAX: "0" }).config.max, 1);
  assert.equal(capture({ DATABASE_URL: SESSION_URL, DB_POOL_MAX: "nope" }).config.max, 1);
});

test("port 6543 is the transaction pooler and does not cache prepared statements", () => {
  assert.equal(connectionPort(TRANSACTION_URL), 6543);
  assert.equal(connectionPort(SESSION_URL), 5432);
  assert.equal(connectionPort("postgresql://user:pass@localhost/tiba"), 5432);
  assert.equal(usesTransactionPooler(TRANSACTION_URL), true);
  const received = capture({ DATABASE_URL: TRANSACTION_URL });
  assert.equal(received.config.max, 1);
  assert.equal("statementNameGenerator" in received.options, false);
  assert.deepEqual(received.options, {});
});

test("one module evaluation stores the client so a second one does not build another pool", () => {
  const source = fs.readFileSync("src/lib/db.ts", "utf8");
  const create = source.indexOf("function createPrisma");
  const open = source.indexOf("openDatabaseAdapter(PrismaPg)");
  const reuse = source.indexOf("globalForPrisma.prisma ?? createPrisma()");
  const store = source.indexOf("globalForPrisma.prisma = prisma");
  assert.ok(create !== -1 && open > create && open < reuse, "the pool is built inside the factory");
  assert.ok(reuse !== -1 && store > reuse, "the client is stored on the global singleton");
  assert.equal(source.includes('if (process.env.NODE_ENV !== "production")'), false);
});

test("app SQL does not keep session state the transaction pooler would drop", () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) files.push(full);
    }
  };
  walk("src");
  const offenders = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    if (/pg_advisory_lock\s*\(/.test(text)) offenders.push(`${file}: session advisory lock`);
    if (/\$executeRaw(?:Unsafe)?\s*`\s*SET\s+(?!TRANSACTION\b)/.test(text)) {
      offenders.push(`${file}: SET without LOCAL`);
    }
  }
  assert.deepEqual(offenders, []);

  const intent = fs.readFileSync("src/lib/payout-intent.ts", "utf8");
  const lock = intent.indexOf("SELECT pg_advisory_xact_lock");
  const tx = intent.lastIndexOf("prisma.$transaction", lock);
  assert.ok(lock !== -1 && tx !== -1 && lock > tx, "pg_advisory_xact_lock stays inside its transaction");
});
