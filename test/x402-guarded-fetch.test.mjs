import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertX402UrlAllowed, guardedX402Fetch, X402_URL_NOT_ALLOWED } from "../src/lib/x402/guarded-fetch.ts";

const routeSource = readFileSync(new URL("../src/app/api/v1/x402/route.ts", import.meta.url), "utf8");

/** A resolver with a fixed answer sheet; unknown names resolve to a public address. */
function resolver(table) {
  return async (hostname) => {
    if (hostname in table) {
      const answers = table[hostname];
      if (answers instanceof Error) throw answers;
      return answers.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
    }
    return [{ address: "93.184.216.34", family: 4 }];
  };
}

function spyFetch() {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response("ok", { status: 200 });
  };
  return { calls, impl };
}

test("only https is fetched: http, file, ftp and malformed addresses are refused before any request", async () => {
  const { calls, impl } = spyFetch();
  const fetchGuarded = guardedX402Fetch(impl, resolver({}));
  for (const url of [
    "http://api.example.com/premium",
    "ftp://api.example.com/premium",
    "file:///etc/passwd",
    "not a url",
    "https://user:pw@api.example.com/premium"
  ]) {
    await assert.rejects(fetchGuarded(url), { message: X402_URL_NOT_ALLOWED }, url);
  }
  assert.equal(calls.length, 0);
});

test("loopback, private, link-local (cloud metadata) and IPv6-internal targets are refused", async () => {
  const { calls, impl } = spyFetch();
  const lookup = resolver({
    "internal.example.com": ["10.0.0.5"],
    "rebound.example.com": ["93.184.216.34", "192.168.1.1"],
    "meta.example.com": ["169.254.169.254"],
    "six.example.com": ["fd00::1"],
    "mapped.example.com": ["::ffff:127.0.0.1"],
    "nowhere.example.com": [],
    "broken.example.com": new Error("ENOTFOUND")
  });
  const fetchGuarded = guardedX402Fetch(impl, lookup);
  for (const url of [
    "https://127.0.0.1/premium",
    "https://127.1.2.3:8443/premium",
    "https://0.0.0.0/premium",
    "https://10.1.2.3/premium",
    "https://172.16.9.9/premium",
    "https://192.168.0.1/premium",
    "https://169.254.169.254/latest/meta-data/",
    "https://100.64.0.1/premium",
    "https://[::1]/premium",
    "https://[fe80::1]/premium",
    "https://[::ffff:10.0.0.1]/premium",
    "https://internal.example.com/premium",
    "https://rebound.example.com/premium",
    "https://meta.example.com/premium",
    "https://six.example.com/premium",
    "https://mapped.example.com/premium",
    "https://nowhere.example.com/premium",
    "https://broken.example.com/premium"
  ]) {
    await assert.rejects(fetchGuarded(url), { message: X402_URL_NOT_ALLOWED }, url);
  }
  assert.equal(calls.length, 0, "no request left the server");
});

test("a public https seller is fetched with redirects disabled and a timeout, and the caller's method, headers and body kept", async () => {
  const { calls, impl } = spyFetch();
  const fetchGuarded = guardedX402Fetch(impl, resolver({ "api.example.com": ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"] }));
  const response = await fetchGuarded("https://api.example.com/premium?x=1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.example.com/premium?x=1");
  assert.equal(calls[0].init.redirect, "manual", "a public host must not bounce us to an internal one");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.body, "{}");
  assert.ok(calls[0].init.signal instanceof AbortSignal);

  const literal = await assertX402UrlAllowed("https://93.184.216.34/premium", resolver({}));
  assert.equal(literal.hostname, "93.184.216.34");
});

test("the x402 route hands the buyer the guarded fetch, not the global one", () => {
  const start = routeSource.indexOf("payX402Resource(");
  const deps = routeSource.slice(start);
  assert.match(deps, /fetch: guardedX402Fetch\(\)/);
  assert.doesNotMatch(deps, /^\s*fetch,\s*$/m, "the bare global fetch must not be passed");
});
