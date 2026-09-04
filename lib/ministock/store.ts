import type { Database, Product, Movement, Snapshot } from "./types.ts";
import {
  ApiError,
  MAX_STOCK,
  MAX_PRODUCTS,
  MAX_MOVEMENTS,
  sampleProducts,
} from "./domain.ts";
import type { ProductInput, MovementInput } from "./domain.ts";

type RawProduct = {
  id: string;
  request_id: string;
  sku: string;
  name: string;
  category: string;
  reorder_point: number;
  initial_quantity: number;
};
type RawMovement = {
  id: string;
  request_id: string;
  product_id: string;
  delta: number;
  reason: string;
};
const now = () => new Date().toISOString();
const selectProducts = `SELECT p.id,p.sku,p.name,p.category,p.reorder_point AS reorderPoint,p.created_at AS createdAt,COALESCE(SUM(m.delta),0) AS stock FROM products p LEFT JOIN movements m ON m.workspace_id=p.workspace_id AND m.product_id=p.id WHERE p.workspace_id=? GROUP BY p.id ORDER BY p.created_at,p.sku`;
const selectMovements = `SELECT m.id,m.sequence,m.product_id AS productId,p.sku,p.name AS productName,m.delta,m.reason,m.created_at AS createdAt FROM movements m JOIN products p ON p.id=m.product_id AND p.workspace_id=m.workspace_id WHERE m.workspace_id=? ORDER BY m.sequence DESC`;
export async function workspaceExists(db: Database, workspace: string) {
  return !!(await db
    .prepare("SELECT id FROM workspaces WHERE id=?")
    .bind(workspace)
    .first());
}
export async function initializeWorkspace(db: Database, workspace: string) {
  const date = now();
  const statements = [
    db
      .prepare("INSERT INTO workspaces(id,created_at) VALUES(?,?)")
      .bind(workspace, date),
  ];
  for (const p of sampleProducts) {
    const id = crypto.randomUUID();
    statements.push(
      db
        .prepare(
          "INSERT INTO products(id,workspace_id,request_id,sku,name,category,reorder_point,initial_quantity,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          workspace,
          crypto.randomUUID(),
          p.sku,
          p.name,
          p.category,
          p.reorderPoint,
          p.initialQuantity,
          date,
        ),
    );
    if (p.initialQuantity > 0)
      statements.push(
        db
          .prepare(
            "INSERT INTO movements(id,workspace_id,product_id,request_id,delta,reason,created_at) VALUES(?,?,?,?,?,?,?)",
          )
          .bind(
            crypto.randomUUID(),
            workspace,
            id,
            crypto.randomUUID(),
            p.initialQuantity,
            "Örnek veri · açılış stoku",
            date,
          ),
      );
  }
  await db.batch(statements);
}
export async function snapshot(
  db: Database,
  workspace: string,
): Promise<Snapshot> {
  // A batch provides one transactionally consistent inventory + ledger snapshot.
  const results = (await db.batch([
    db.prepare(selectProducts).bind(workspace),
    db.prepare(selectMovements).bind(workspace),
  ])) as [{ results: Product[] }, { results: Movement[] }];
  return {
    products: results[0].results,
    movements: results[1].results,
    asOf: now(),
    limits: { products: MAX_PRODUCTS, movements: MAX_MOVEMENTS },
  };
}
function sameProduct(p: RawProduct, input: ProductInput) {
  return (
    p.sku === input.sku &&
    p.name === input.name &&
    p.category === input.category &&
    p.reorder_point === input.reorderPoint &&
    p.initial_quantity === input.initialQuantity
  );
}
export async function createProduct(
  db: Database,
  workspace: string,
  input: ProductInput,
) {
  const prior = await db
    .prepare("SELECT * FROM products WHERE workspace_id=? AND request_id=?")
    .bind(workspace, input.requestId)
    .first<RawProduct>();
  if (prior) {
    if (!sameProduct(prior, input))
      throw new ApiError(
        409,
        "REQUEST_REUSED",
        "Bu işlem numarası farklı bir ürün için kullanılmış.",
      );
    return { id: prior.id, replayed: true };
  }
  const id = crypto.randomUUID(),
    date = now();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO products(id,workspace_id,request_id,sku,name,category,reorder_point,initial_quantity,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM products WHERE workspace_id=?) < ? AND (SELECT COUNT(*) FROM movements WHERE workspace_id=?) < ? ON CONFLICT(workspace_id,request_id) DO NOTHING`,
        )
        .bind(
          id,
          workspace,
          input.requestId,
          input.sku,
          input.name,
          input.category,
          input.reorderPoint,
          input.initialQuantity,
          date,
          workspace,
          MAX_PRODUCTS,
          workspace,
          MAX_MOVEMENTS,
        ),
      db
        .prepare(
          "INSERT INTO movements(id,workspace_id,product_id,request_id,delta,reason,created_at) SELECT ?,workspace_id,id,?,initial_quantity,?,? FROM products WHERE workspace_id=? AND id=? AND initial_quantity>0",
        )
        .bind(
          crypto.randomUUID(),
          input.requestId,
          "Açılış stoku",
          date,
          workspace,
          id,
        ),
    ]);
  } catch (error) {
    const duplicate = await db
      .prepare("SELECT id FROM products WHERE workspace_id=? AND sku=?")
      .bind(workspace, input.sku)
      .first();
    if (duplicate)
      throw new ApiError(
        409,
        "SKU_EXISTS",
        "Bu ürün kodu zaten kullanılıyor. Mevcut ürüne stok girişi yapabilirsin.",
      );
    throw error;
  }
  const created = await db
    .prepare("SELECT * FROM products WHERE workspace_id=? AND request_id=?")
    .bind(workspace, input.requestId)
    .first<RawProduct>();
  if (!created)
    throw new ApiError(
      409,
      "DEMO_LIMIT",
      "Demo alanı 100 ürün ve 1.000 hareket ile sınırlı.",
    );
  if (!sameProduct(created, input))
    throw new ApiError(
      409,
      "REQUEST_REUSED",
      "Bu işlem numarası farklı bir ürün için kullanılmış.",
    );
  return { id: created.id, replayed: created.id !== id };
}
export async function createMovement(
  db: Database,
  workspace: string,
  input: MovementInput,
) {
  const delta = input.direction === "out" ? -input.quantity : input.quantity;
  const prior = await db
    .prepare("SELECT * FROM movements WHERE workspace_id=? AND request_id=?")
    .bind(workspace, input.requestId)
    .first<RawMovement>();
  const respond = (m: RawMovement, replayed: boolean) => {
    if (
      m.product_id !== input.productId ||
      m.delta !== delta ||
      m.reason !== input.reason
    )
      throw new ApiError(
        409,
        "REQUEST_REUSED",
        "Bu işlem numarası farklı bir hareket için kullanılmış.",
      );
    return { id: m.id, replayed };
  };
  if (prior) return respond(prior, true);
  const product = await db
    .prepare("SELECT id FROM products WHERE workspace_id=? AND id=?")
    .bind(workspace, input.productId)
    .first();
  if (!product)
    throw new ApiError(
      404,
      "PRODUCT_NOT_FOUND",
      "Ürün bu çalışma alanında bulunamadı.",
    );
  const id = crypto.randomUUID();
  // The balance check and ledger insert are ONE write statement. Never pre-read
  // a balance in JavaScript and then write: concurrent withdrawals would race.
  await db
    .prepare(
      `INSERT INTO movements(id,workspace_id,product_id,request_id,delta,reason,created_at)
 SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM products WHERE workspace_id=? AND id=?)
 AND (SELECT COALESCE(SUM(delta),0) FROM movements WHERE workspace_id=? AND product_id=?) + ? BETWEEN 0 AND ?
 AND (SELECT COUNT(*) FROM movements WHERE workspace_id=?) < ?
 ON CONFLICT(workspace_id,request_id) DO NOTHING`,
    )
    .bind(
      id,
      workspace,
      input.productId,
      input.requestId,
      delta,
      input.reason,
      now(),
      workspace,
      input.productId,
      workspace,
      input.productId,
      delta,
      MAX_STOCK,
      workspace,
      MAX_MOVEMENTS,
    )
    .run();
  const saved = await db
    .prepare("SELECT * FROM movements WHERE workspace_id=? AND request_id=?")
    .bind(workspace, input.requestId)
    .first<RawMovement>();
  if (saved) return respond(saved, saved.id !== id);
  const count = await db
    .prepare("SELECT COUNT(*) AS n FROM movements WHERE workspace_id=?")
    .bind(workspace)
    .first<{ n: number }>();
  if (count && count.n >= MAX_MOVEMENTS)
    throw new ApiError(
      409,
      "DEMO_LIMIT",
      "Demo alanı 1.000 hareket ile sınırlı.",
    );
  throw new ApiError(
    409,
    "STOCK_LIMIT",
    delta < 0
      ? "Yetersiz stok. Mevcut stoktan fazla çıkış yapılamaz."
      : "Stok 999.999 adedi aşamaz.",
  );
}
