import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import type { Database, Statement, SqlValue } from "../lib/ministock/types.ts";
export function testDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync(new URL("../drizzle/", import.meta.url))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(
      readFileSync(new URL("../drizzle/" + file, import.meta.url), "utf8"),
    );
  class SqlStatement implements Statement {
    sql: string;
    args: SqlValue[];
    constructor(sql: string, args: SqlValue[] = []) {
      this.sql = sql;
      this.args = args;
    }
    bind(...args: SqlValue[]) {
      return new SqlStatement(this.sql, args);
    }
    async first<T>() {
      return (sqlite.prepare(this.sql).get(...this.args) ?? null) as T | null;
    }
    async all<T>() {
      return { results: sqlite.prepare(this.sql).all(...this.args) as T[] };
    }
    async run() {
      return {
        meta: {
          changes: Number(sqlite.prepare(this.sql).run(...this.args).changes),
        },
      };
    }
    execute() {
      const statement = sqlite.prepare(this.sql);
      if (statement.columns().length)
        return { results: statement.all(...this.args) };
      return {
        results: [],
        meta: { changes: Number(statement.run(...this.args).changes) },
      };
    }
  }
  const db: Database = {
    prepare: (sql) => new SqlStatement(sql),
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((s) => (s as SqlStatement).execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return { db, sqlite };
}
