import assert from "node:assert/strict";
import test from "node:test";
import { migrateDatasourceUrl } from "../src/lib/migrate-url.ts";

test("migrations prefer DIRECT_URL and fall back to DATABASE_URL", () => {
  assert.equal(
    migrateDatasourceUrl({
      DIRECT_URL: "postgresql://user:pass@localhost:5432/tiba",
      DATABASE_URL: "postgresql://user:pass@localhost:6543/tiba"
    }),
    "postgresql://user:pass@localhost:5432/tiba"
  );
  assert.equal(
    migrateDatasourceUrl({ DATABASE_URL: "postgresql://user:pass@localhost:6543/tiba" }),
    "postgresql://user:pass@localhost:6543/tiba"
  );
  assert.equal(migrateDatasourceUrl({ DIRECT_URL: "  ", DATABASE_URL: "postgresql://user:pass@localhost:5432/tiba" }), "postgresql://user:pass@localhost:5432/tiba");
  assert.equal(migrateDatasourceUrl({}), "file:./dev.db");
});
