import type { Product } from "./types.ts";
function cell(value: string | number) {
  let s = String(value);
  if (/^[\s]*[=+\-@\t\r\n]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function inventoryCsv(products: Product[]) {
  return [
    ["Ürün kodu", "Ürün adı", "Kategori", "Stok", "Düşük stok sınırı"],
    ...products.map((p) => [
      p.sku,
      p.name,
      p.category,
      p.stock,
      p.reorderPoint,
    ]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}
