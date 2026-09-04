import assert from "node:assert/strict";
import test from "node:test";

const productTitle = /<title>MiniStock/;

test("renders the MiniStock inventory shell and accessible entry actions", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, productTitle);
  assert.match(html, /lang="tr"/);
  assert.match(html, /Ürün ekle/);
  assert.match(html, /Stokların kontrol altında/);
  assert.doesNotMatch(html, /Starter Project/);
});

test("compiled Worker routes bootstrap, stock write and persisted read through the API", async () => {
  const { testDatabase } = await import("./sqlite-adapter.ts");
  const { db, sqlite } = testDatabase();
  try {
    const { default: worker } = await import("../dist/server/index.js");
    const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
    const ctx = { waitUntil() {}, passThroughOnException() {} };
    const call = (path, body, cookie = "") => worker.fetch(new Request("https://ministock.example" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", "X-MiniStock-Request": "1", cookie },
      body: body === undefined ? undefined : JSON.stringify(body)
    }), env, ctx);
    const opened = await call("/api/workspace", {});
    assert.equal(opened.status, 201);
    const cookie = opened.headers.get("set-cookie").split(";")[0];
    const initial = await opened.json();
    const product = initial.products.find(p => p.sku === "ELE-001");
    const input = { requestId: crypto.randomUUID(), productId: product.id, direction: "out", quantity: 14, reason: "Compiled Worker check" };
    assert.equal((await call("/api/movements", input, cookie)).status, 201);
    const current = await (await call("/api/inventory", undefined, cookie)).json();
    assert.equal(current.products.find(p => p.id === product.id).stock, 10);
    assert.equal(current.movements[0].reason, input.reason);
  } finally { sqlite.close(); }
});
