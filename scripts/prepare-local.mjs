import { Miniflare } from "miniflare";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
// Match the local-only placeholder in vite.config.ts. No production ID is used.
const mf = new Miniflare({
  modules: true,
  script:
    "export default {fetch(){return new Response('local migration helper')}}",
  compatibilityDate: "2026-01-01",
  d1Databases: { DB: "00000000-0000-4000-8000-000000000000" },
  d1Persist: resolve(".wrangler/state/v3/d1"),
});
try {
  const db = await mf.getD1Database("DB");
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS ministock_local_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
    )
    .run();
  for (const file of (await readdir("drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (
      await db
        .prepare("SELECT name FROM ministock_local_migrations WHERE name=?")
        .bind(file)
        .first()
    )
      continue;
    const sql = await readFile("drizzle/" + file, "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => db.prepare(s));
    await db.batch([
      ...statements,
      db
        .prepare("INSERT INTO ministock_local_migrations VALUES(?,?)")
        .bind(file, new Date().toISOString()),
    ]);
    console.log("Applied local schema:", file);
  }
  console.log("Local database ready. Run npm run dev.");
} finally {
  await mf.dispose();
}
