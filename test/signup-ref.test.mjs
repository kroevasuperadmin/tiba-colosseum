import assert from "node:assert/strict";
import test from "node:test";
import { signupRefFrom } from "../src/lib/signup-ref.ts";

const TOKEN = "550e8400-e29b-41d4-a716-446655440000";

test("ref captured on signup", () => {
  assert.equal(signupRefFrom(TOKEN), TOKEN, "a receipt token is kept");
  assert.equal(signupRefFrom(`  ${TOKEN.toUpperCase()}  `), TOKEN, "the stored value is the token, trimmed");
  assert.equal(signupRefFrom(undefined), null, "a workspace opened with no ref stores nothing");
  assert.equal(signupRefFrom(""), null);
  assert.equal(signupRefFrom("not-a-receipt"), null, "a crafted ref is not stored");
  assert.equal(signupRefFrom("javascript:alert(1)"), null);
});
