import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { modelAnsweredWith } from "../src/lib/channel-makers.ts";
import { runGonka } from "../src/lib/gonka.ts";
import { PayerRecordCheckDetail, payerRecordNoAnswer } from "../src/lib/payer-record-receipt.ts";
import { readPayerRecordByRules, rulesInputSeen, selectPayerRecordTuple } from "../src/lib/payer-record-rules.ts";
import { reconcile } from "../src/lib/reconcile.ts";

const RECEIVED = "2026-09-27T13:06:00.000Z";

/** Production work_orders.payer_record for WO-R2, as read from the database. Amount is a string. */
const PRODUCTION_RECORD = {
  approved_amount_micros: "1000000",
  delivery_status: "verified_complete",
  source: "operator-upload"
};

function printSeen(label) {
  const seen = rulesInputSeen;
  console.log(
    `[${label}] orders=${seen.orderCount} payer_record type=${seen.payerRecordType} value=${seen.payerRecordJson} ` +
    `approved_amount_micros type=${seen.approvedAmountMicrosType} value=${seen.approvedAmountMicros} ` +
    `delivery_status type=${seen.deliveryStatusType} value=${seen.deliveryStatus} keys=${seen.keys.join(",")}`
  );
  return seen;
}

function order(ref, record, ceiling = "9000000") {
  return {
    id: ref,
    ceiling_micros: ceiling,
    brief_text: "Already scoped to this recipient.",
    payer_record: record
  };
}

function messages(orders, receivedAt = RECEIVED) {
  return [
    { role: "system", content: "ignored by the rules check" },
    {
      role: "user",
      content: JSON.stringify({
        open_work_orders: orders,
        delivery_event_metadata: { received_at: receivedAt, recipient_ref: "REC-1" }
      })
    }
  ];
}

test("the rules module does not open a database connection", () => {
  const source = readFileSync(new URL("../src/lib/payer-record-rules.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /@\/lib\/db|@prisma\/client|\bprisma\b|DATABASE_URL/);
  const gonka = readFileSync(new URL("../src/lib/gonka.ts", import.meta.url), "utf8");
  const branch = gonka.slice(gonka.indexOf('request.channel === "payer_record"'), gonka.indexOf("const apiKey"));
  assert.doesNotMatch(branch, /@\/lib\/db|@prisma\/client|\bprisma\b/);
});

test("exactly one verified work order returns that record's tuple", async () => {
  const orders = [
    order("WO-PENDING", { delivery_status: "pending", approved_amount_micros: "1000000" }),
    order("WO-1", {
      delivery_status: "verified_complete",
      approved_amount_micros: "5000000"
    }, "9000000")
  ];

  assert.deepEqual(selectPayerRecordTuple(orders, RECEIVED), {
    ref: "WO-1",
    approved_amount_micros: "5000000",
    received_at: RECEIVED
  });

  const calls = [];
  const previous = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "test-key";
  try {
    const result = await runGonka({
      channel: "payer_record",
      messages: messages(orders),
      schema: { name: "unused", strict: true, schema: {} },
      fetcher: async () => {
        calls.push("called");
        throw new Error("check 2 must not call a model");
      }
    });
    assert.equal(calls.length, 0);
    assert.equal(result.ok, true);
    assert.equal(result.model, "rules");
    assert.equal(modelAnsweredWith(result), "rules");
    assert.deepEqual(JSON.parse(result.content), {
      work_order_id: "WO-1",
      amount_micros: "5000000",
      delivery_timestamp: RECEIVED,
      record_basis: "verified_complete"
    });
  } finally {
    if (previous === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previous;
  }
});

test("the production WO-R2 object arrives as an object with a string amount and returns that tuple", () => {
  const built = messages([{
    id: "WO-R2",
    ceiling_micros: "1000000",
    brief_text: "One open invoice.",
    payer_record: PRODUCTION_RECORD
  }]);
  const read = readPayerRecordByRules(built);
  const seen = printSeen("WO-R2 production row");
  assert.equal(seen.payerRecordType, "object");
  assert.equal(seen.approvedAmountMicrosType, "string");
  assert.equal(seen.approvedAmountMicros, "1000000");
  assert.equal(seen.deliveryStatusType, "string");
  assert.equal(seen.deliveryStatus, "verified_complete");
  assert.deepEqual(seen.keys, ["approved_amount_micros", "delivery_status", "source"]);
  assert.equal(read.ok, true);
  assert.deepEqual(JSON.parse(read.content), {
    work_order_id: "WO-R2",
    amount_micros: "1000000",
    delivery_timestamp: RECEIVED,
    record_basis: "verified_complete"
  });
});

test("a Prisma Json tag around that row used to return no tuple and now returns it", () => {
  const pgText = JSON.stringify(PRODUCTION_RECORD);
  const tagged = { $type: "Json", value: pgText };
  const read = readPayerRecordByRules(messages([{
    id: "WO-R2",
    ceiling_micros: "1000000",
    payer_record: tagged
  }]));
  const seen = printSeen("WO-R2 Prisma Json tag");
  assert.equal(seen.payerRecordType, "object");
  assert.deepEqual(seen.keys, ["$type", "value"]);
  assert.equal(seen.deliveryStatusType, "missing");
  assert.equal(seen.approvedAmountMicrosType, "missing");
  assert.equal(read.ok, true);
  assert.equal(JSON.parse(read.content).work_order_id, "WO-R2");
  assert.equal(JSON.parse(read.content).amount_micros, "1000000");
});

test("json text and a camelCase record still return the tuple", () => {
  const objectText = JSON.stringify(PRODUCTION_RECORD);
  const quotedColumnText = JSON.stringify(objectText);
  assert.equal(quotedColumnText[0], '"');
  assert.deepEqual(
    selectPayerRecordTuple(
      [{ id: "WO-R2", ceiling_micros: "1000000", payer_record: quotedColumnText }],
      RECEIVED
    ),
    { ref: "WO-R2", approved_amount_micros: "1000000", received_at: RECEIVED }
  );
  assert.deepEqual(
    selectPayerRecordTuple(
      [{ id: "WO-R2", ceiling_micros: "1000000", payer_record: objectText }],
      RECEIVED
    ).approved_amount_micros,
    "1000000"
  );

  const camel = selectPayerRecordTuple(
    [{
      ref: "WO-R2",
      ceilingMicros: 1_000_000n,
      payerRecord: { approvedAmountMicros: 1_000_000n, deliveryStatus: "verified_complete" }
    }],
    RECEIVED
  );
  assert.equal(camel.approved_amount_micros, "1000000");
});

test("a throw is stored as the error, not an empty result", () => {
  const read = readPayerRecordByRules([{
    role: "user",
    get content() {
      throw new Error("max clients reached in session mode, pool_size 15");
    }
  }]);
  assert.equal(read.ok, false);
  assert.equal(read.model, "rules");
  assert.equal(read.latencyMs, 0);
  const body = JSON.parse(read.content);
  assert.equal(body.error, "max clients reached in session mode, pool_size 15");
  assert.equal(body.work_order_id, undefined);
  assert.equal(body.amount_micros, undefined);
});

test("zero verified work orders name the miss and hold the payment", () => {
  const orders = [
    order("WO-A", { delivery_status: "pending", approved_amount_micros: "5000000" })
  ];
  assert.equal(selectPayerRecordTuple(orders, RECEIVED), null);
  const read = readPayerRecordByRules(messages(orders));
  assert.equal(read.ok, false);
  const reason = JSON.parse(read.content).error;
  assert.match(reason, /no single verified_complete record/);
  assert.match(reason, /payer_record object/);
  assert.match(reason, /delivery_status string pending/);
  assert.match(reason, /approved_amount_micros string/);
  const shown = payerRecordNoAnswer({ error: reason });
  assert.equal(shown, reason);
  const html = renderToStaticMarkup(PayerRecordCheckDetail({ model: "rules", noAnswer: shown }));
  assert.match(html, /No answer: Check 2 saw 1 open order/);
  assert.match(html, /delivery_status string pending/);
  const held = reconcile("both", {
    artifact: { workOrderId: "WO-1", amountMicros: 5_000_000n, deliveryTimestamp: RECEIVED }
  });
  assert.equal(held.reasonCode, "MISSING_REQUIRED_CHANNEL");
});

test("several verified work orders do not guess", () => {
  const orders = [
    order("WO-1", { delivery_status: "verified_complete", approved_amount_micros: "5000000" }),
    order("WO-2", { delivery_status: "verified_complete", approved_amount_micros: "5000000" })
  ];
  assert.equal(selectPayerRecordTuple(orders, RECEIVED), null);
  const read = readPayerRecordByRules(messages(orders));
  assert.match(JSON.parse(read.content).error, /2 verified_complete records and did not guess/);
});

test("the receipt says check 2 had no answer, and names the error", () => {
  const html = renderToStaticMarkup(PayerRecordCheckDetail({
    model: "rules",
    noAnswer: "max clients reached in session mode, pool_size 15"
  }));
  assert.match(html, /Check 2: rules, no AI/);
  assert.match(html, /No answer: max clients reached in session mode, pool_size 15/);
  assert.doesNotMatch(html, /Model used/);

  const answered = renderToStaticMarkup(PayerRecordCheckDetail({ model: "rules", noAnswer: null }));
  assert.match(answered, /Check 2: rules, no AI/);
  assert.doesNotMatch(answered, /No answer/);

  const ai = renderToStaticMarkup(PayerRecordCheckDetail({
    model: "openai/gpt-oss-120b",
    requestId: "req-1",
    latencyMs: 10
  }));
  assert.match(ai, /Model used: openai\/gpt-oss-120b/);
});

test("the bill check still calls a model", async () => {
  const previous = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "test-key";
  const seen = [];
  try {
    const result = await runGonka({
      channel: "artifact",
      messages: [{ role: "user", content: "{}" }],
      schema: {
        name: "artifact_decision",
        strict: true,
        schema: {
          type: "object",
          required: ["work_order_id", "amount_micros"],
          properties: {
            work_order_id: { type: "string" },
            amount_micros: { type: "string", pattern: "^[0-9]+$" }
          }
        }
      },
      fetcher: async (_url, init) => {
        seen.push(JSON.parse(init.body).model);
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({ work_order_id: "WO-1", amount_micros: "1000000" }) } }]
          })
        };
      }
    });
    assert.equal(result.model, "openai/gpt-oss-120b");
    assert.ok(seen.includes("openai/gpt-oss-120b"));
  } finally {
    if (previous === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previous;
  }
});
