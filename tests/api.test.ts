import test from "node:test";
import assert from "node:assert/strict";
import { handleApi } from "../lib/ministock/api.ts";
import { stockStatus } from "../lib/ministock/domain.ts";
import { inventoryCsv } from "../lib/ministock/export.ts";
import type { Snapshot } from "../lib/ministock/types.ts";
import { testDatabase } from "./sqlite-adapter.ts";
async function setup() {
  const { db, sqlite } = testDatabase();
  const call = (
    path: string,
    payload?: unknown,
    cookie = "",
    headers: Record<string, string> = {},
  ) =>
    handleApi(
      new Request("https://ministock.example" + path, {
        method: payload === undefined ? "GET" : "POST",
        headers: {
          ...(payload === undefined
            ? {}
            : {
                "Content-Type": "application/json",
                "X-MiniStock-Request": "1",
                Origin: "https://ministock.example",
              }),
          ...(cookie ? { cookie } : {}),
          ...headers,
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      }),
      db,
    );
  const response = await call("/api/workspace", {});
  assert.equal(response.status, 201);
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const data = (await response.json()) as Snapshot;
  const read = async () =>
    (await (
      await call("/api/inventory", undefined, cookie)
    ).json()) as Snapshot;
  return { db, sqlite, call, cookie, data, read, response };
}
const move = (
  productId: string,
  quantity = 1,
  direction = "out",
  requestId = crypto.randomUUID(),
) => ({ productId, quantity, direction, reason: "Test hareketi", requestId });
const product = (extra = {}) => ({
  requestId: crypto.randomUUID(),
  sku: "TEST-01",
  name: "Test sensörü",
  category: "Elektronik",
  reorderPoint: 3,
  initialQuantity: 10,
  ...extra,
});
test("sample workspace contains 8 products, 181 units, 3 low and 1 empty", async (t) => {
  const s = await setup();
  t.after(() => s.sqlite.close());
  assert.equal(s.data.products.length, 8);
  assert.equal(
    s.data.products.reduce((n, p) => n + p.stock, 0),
    181,
  );
  assert.equal(
    s.data.products.filter((p) => p.stock <= p.reorderPoint).length,
    3,
  );
  assert.equal(s.data.products.filter((p) => p.stock === 0).length, 1);
  assert.equal(s.data.movements.length, 7);
  assert.match(
    s.response.headers.get("set-cookie")!,
    /HttpOnly; SameSite=Strict/,
  );
  assert.match(s.response.headers.get("set-cookie")!, /Secure/);
  assert.match(s.response.headers.get("cache-control")!, /no-store/);
});
test("existing cookie resumes the same persisted inventory without reseeding", async (t) => {
  const s = await setup();
  t.after(() => s.sqlite.close());
  await s.call(
    "/api/movements",
    move(s.data.products.find((p) => p.sku === "ELE-001")!.id, 2),
    s.cookie,
  );
  const again = await s.call("/api/workspace", {}, s.cookie);
  assert.equal(again.status, 200);
  const d = (await again.json()) as Snapshot;
  assert.equal(d.products.length, 8);
  assert.equal(d.movements.length, 8);
  assert.equal(d.products.find((p) => p.sku === "ELE-001")!.stock, 22);
  assert.equal(again.headers.get("set-cookie"), null);
});
test("zero or missing cookie cannot read another inventory", async (t) => {
  const s = await setup();
  t.after(() => s.sqlite.close());
  assert.equal((await s.call("/api/inventory")).status, 401);
  assert.equal(
    (
      await s.call(
        "/api/inventory",
        undefined,
        "ministock_session=" + "0".repeat(64),
      )
    ).status,
    401,
  );
});
test("separate visitors get separate products and cannot mutate each other", async (t) => {
  const s = await setup();
  t.after(() => s.sqlite.close());
  const other = await s.call("/api/workspace", {});
  const cookie = other.headers.get("set-cookie")!.split(";")[0];
  assert.notEqual(cookie, s.cookie);
  assert.equal(
    (
      await s.call(
        "/api/movements",
        move(s.data.products.find((p) => p.sku === "ELE-001")!.id),
        cookie,
      )
    ).status,
    404,
  );
  assert.equal(
    (await s.read()).products.find((p) => p.sku === "ELE-001")!.stock,
    24,
  );
});
test("incoming and outgoing movements update balance and retain audit reasons", async (t) => {
  const s = await setup();
  t.after(() => s.sqlite.close());
  const id = s.data.products.find((p) => p.sku === "ELE-001")!.id;
  assert.equal(
    (await s.call("/api/movements", move(id, 5, "in"), s.cookie)).status,
    201,
  );
  assert.equal(
    (await s.call("/api/movements", move(id, 3, "out"), s.cookie)).status,
    201,
  );
  const d = await s.read();
  assert.equal(d.products.find((p) => p.id === id)!.stock, 26);
  assert.equal(d.movements[0].delta, -3);
  assert.equal(d.movements[0].reason, "Test hareketi");
});
test("exact balance can be withdrawn; oversell is rejected without a ledger row", async (t) => {
  const s = await setup();
  t.after(() => s.sqlite.close());
  const id = s.data.products.find((p) => p.sku === "ELE-001")!.id;
  assert.equal(
    (await s.call("/api/movements", move(id, 25), s.cookie)).status,
    409,
  );
  assert.equal((await s.read()).movements.length, 7);
  assert.equal(
    (await s.call("/api/movements", move(id, 24), s.cookie)).status,
    201,
  );
  assert.equal(
    (await s.read()).products.find((p) => p.sku === "ELE-001")!.stock,
    0,
  );
  assert.equal(
    (await s.call("/api/movements", move(id), s.cookie)).status,
    409,
  );
});
test("overlapping withdrawals cannot make inventory negative", async (t) => {
  const s = await setup();
  t.after(() => s.sqlite.close());
  const id = s.data.products.find((p) => p.sku === "ELE-001")!.id;
  const results = await Promise.all([
    s.call("/api/movements", move(id, 20), s.cookie),
    s.call("/api/movements", move(id, 20), s.cookie),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(
    (await s.read()).products.find((p) => p.sku === "ELE-001")!.stock,
    4,
  );
});
test("duplicate request IDs apply a movement once even for overlapping requests", async (t) => {
  const s = await setup();
  t.after(() => s.sqlite.close());
  const input = move(s.data.products.find((p) => p.sku === "ELE-001")!.id, 3);
  const results = await Promise.all([
    s.call("/api/movements", input, s.cookie),
    s.call("/api/movements", input, s.cookie),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 201]);
  assert.equal(
    (await s.read()).products.find((p) => p.sku === "ELE-001")!.stock,
    21,
  );
  assert.equal((await s.read()).movements.length, 8);
});
test("a reused request ID with changed payload is rejected", async (t) => {
  const s = await setup();
  t.after(() => s.sqlite.close());
  const input = move(s.data.products.find((p) => p.sku === "ELE-001")!.id, 3);
  await s.call("/api/movements", input, s.cookie);
  assert.equal(
    (await s.call("/api/movements", { ...input, quantity: 4 }, s.cookie))
      .status,
    409,
  );
  assert.equal(
    (await s.read()).products.find((p) => p.sku === "ELE-001")!.stock,
    21,
  );
});
test("SKU is normalized and uniqueness is enforced in the workspace", async (t) => {
  const s = await setup();
  t.after(() => s.sqlite.close());
  assert.equal(
    (await s.call("/api/products", product({ sku: "new-01" }), s.cookie))
      .status,
    201,
  );
  assert.equal(
    (await s.call("/api/products", product({ sku: "NEW-01" }), s.cookie))
      .status,
    409,
  );
  const d = await s.read();
  assert.equal(d.products.length, 9);
  assert.equal(d.products.find((p) => p.sku === "NEW-01")!.stock, 10);
});
test("product retries do not repeat opening balance; changed intent is rejected", async (t) => {
  const s = await setup();
  t.after(() => s.sqlite.close());
  const input = product();
  const results = await Promise.all([
    s.call("/api/products", input, s.cookie),
    s.call("/api/products", input, s.cookie),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 201]);
  const d = await s.read();
  assert.equal(d.products.find((p) => p.sku === "TEST-01")!.stock, 10);
  assert.equal(d.movements.length, 8);
  assert.equal(
    (await s.call("/api/products", { ...input, name: "Başka" }, s.cookie))
      .status,
    409,
  );
});
test("failed opening movement rolls back its product insert", async (t) => {
  const s = await setup();
  t.after(() => s.sqlite.close());
  const input = move(s.data.products.find((p) => p.sku === "ELE-001")!.id);
  await s.call("/api/movements", input, s.cookie);
  const response = await s.call(
    "/api/products",
    product({ requestId: input.requestId }),
    s.cookie,
  );
  assert.equal(response.status, 503);
  assert.equal((await s.read()).products.length, 8);
});
test("invalid amounts and unknown payload fields never write data", async (t) => {
  const s = await setup();
  t.after(() => s.sqlite.close());
  for (const quantity of [0, -1, 1.5, 1000000, "2", null]) {
    assert.equal(
      (
        await s.call(
          "/api/movements",
          {
            ...move(s.data.products.find((p) => p.sku === "ELE-001")!.id),
            quantity,
          },
          s.cookie,
        )
      ).status,
      400,
    );
  }
  assert.equal(
    (await s.call("/api/products", product({ admin: true }), s.cookie)).status,
    400,
  );
  assert.equal((await s.read()).movements.length, 7);
});
test("maximum stock enforced for incoming movements", async (t) => {
  const s = await setup();
  t.after(() => s.sqlite.close());
  const id = s.data.products.find((p) => p.sku === "ELE-001")!.id;
  assert.equal(
    (await s.call("/api/movements", move(id, 999975, "in"), s.cookie)).status,
    201,
  );
  assert.equal(
    (await s.read()).products.find((p) => p.sku === "ELE-001")!.stock,
    999999,
  );
  assert.equal(
    (await s.call("/api/movements", move(id, 1, "in"), s.cookie)).status,
    409,
  );
});
test("low-stock includes equality; zero has a separate label", () => {
  assert.equal(stockStatus(5, 5), "low");
  assert.equal(stockStatus(6, 5), "ok");
  assert.equal(stockStatus(0, 0), "zero");
});
test("cross-origin writes and missing CSRF headers are rejected", async (t) => {
  const s = await setup();
  t.after(() => s.sqlite.close());
  const input = move(s.data.products.find((p) => p.sku === "ELE-001")!.id);
  assert.equal(
    (
      await s.call("/api/movements", input, s.cookie, {
        Origin: "https://other.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await s.call("/api/movements", input, s.cookie, {
        "X-MiniStock-Request": "",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await s.call("/api/movements", input, s.cookie, {
        "Content-Type": "text/plain",
      })
    ).status,
    415,
  );
  assert.equal((await s.read()).movements.length, 7);
});
test("oversized and malformed bodies are bounded without writes", async (t) => {
  const s = await setup();
  t.after(() => s.sqlite.close());
  const input = {
    ...move(s.data.products.find((p) => p.sku === "ELE-001")!.id),
    reason: "a".repeat(9000),
  };
  assert.equal((await s.call("/api/movements", input, s.cookie)).status, 413);
  const req = new Request("https://ministock.example/api/products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-MiniStock-Request": "1",
      cookie: s.cookie,
    },
    body: "{",
  });
  assert.equal((await handleApi(req, s.db)).status, 400);
});
test("SQL injection strings stay data; formula-like CSV cells are escaped", async (t) => {
  const s = await setup();
  t.after(() => s.sqlite.close());
  const name = '=HYPERLINK("x")';
  assert.equal(
    (await s.call("/api/products", product({ name }), s.cookie)).status,
    201,
  );
  const d = await s.read();
  assert.equal(d.products.length, 9);
  assert.match(inventoryCsv(d.products), /'=HYPERLINK/);
  const req = product({ sku: "X'); DROP TABLE products;--" });
  assert.equal((await s.call("/api/products", req, s.cookie)).status, 400);
  assert.equal((await s.read()).products.length, 9);
});
test("composite foreign key forbids cross-workspace ledger injection", async (t) => {
  const s = await setup();
  t.after(() => s.sqlite.close());
  assert.throws(
    () =>
      s.sqlite
        .prepare(
          "INSERT INTO movements(id,workspace_id,product_id,request_id,delta,reason,created_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          crypto.randomUUID(),
          "other",
          s.data.products.find((p) => p.sku === "ELE-001")!.id,
          crypto.randomUUID(),
          1,
          "test",
          new Date().toISOString(),
        ),
    /FOREIGN KEY/,
  );
});
test("storage failure returns a recoverable response without leaking SQL", async () => {
  const broken = {
    prepare() {
      throw new Error("secret SQL text");
    },
    async batch() {
      throw new Error("secret SQL text");
    },
  };
  const response = await handleApi(
    new Request("https://ministock.example/api/inventory", {
      headers: { cookie: "ministock_session=" + "a".repeat(64) },
    }),
    broken,
  );
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret SQL/);
});
