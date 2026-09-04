import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
  check,
  foreignKey,
} from "drizzle-orm/sqlite-core";
export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
});
export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    requestId: text("request_id").notNull(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    reorderPoint: integer("reorder_point").notNull(),
    initialQuantity: integer("initial_quantity").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("uq_products_workspace_sku").on(t.workspaceId, t.sku),
    uniqueIndex("uq_products_workspace_request").on(t.workspaceId, t.requestId),
    uniqueIndex("uq_products_workspace_id").on(t.workspaceId, t.id),
    check(
      "ck_products_threshold",
      sql`${t.reorderPoint} BETWEEN 0 AND 999999 AND typeof(${t.reorderPoint}) = 'integer'`,
    ),
    check(
      "ck_products_initial",
      sql`${t.initialQuantity} BETWEEN 0 AND 999999 AND typeof(${t.initialQuantity}) = 'integer'`,
    ),
  ],
);
export const movements = sqliteTable(
  "movements",
  {
    sequence: integer("sequence").primaryKey({ autoIncrement: true }),
    id: text("id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    productId: text("product_id").notNull(),
    requestId: text("request_id").notNull(),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("uq_movements_workspace_request").on(
      t.workspaceId,
      t.requestId,
    ),
    index("idx_movements_workspace_product").on(t.workspaceId, t.productId),
    foreignKey({
      columns: [t.workspaceId, t.productId],
      foreignColumns: [products.workspaceId, products.id],
    }),
    check(
      "ck_movements_delta",
      sql`${t.delta} != 0 AND abs(${t.delta}) <= 999999 AND typeof(${t.delta}) = 'integer'`,
    ),
    check("ck_movements_reason", sql`length(${t.reason}) BETWEEN 2 AND 200`),
  ],
);
