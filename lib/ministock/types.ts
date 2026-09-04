export type SqlValue = string | number | null;
export interface Statement {
  bind(...args: SqlValue[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown[]>;
}
export type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  reorderPoint: number;
  stock: number;
  createdAt: string;
};
export type Movement = {
  id: string;
  sequence: number;
  productId: string;
  sku: string;
  productName: string;
  delta: number;
  reason: string;
  createdAt: string;
};
export type Snapshot = {
  products: Product[];
  movements: Movement[];
  asOf: string;
  limits: { products: number; movements: number };
};
