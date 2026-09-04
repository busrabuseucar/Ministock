import { z } from "zod";
export const MAX_STOCK = 999999,
  MAX_PRODUCTS = 100,
  MAX_MOVEMENTS = 1000;
export const CATEGORIES = [
  "Elektronik",
  "Bağlantı",
  "Mekanik",
  "Diğer",
] as const;
const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      (v) => !/[\u0000-\u001f\u007f]/.test(v),
      "Kontrol karakteri kullanılamaz.",
    );
export const productInput = z
  .object({
    requestId: z.string().uuid(),
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .regex(
        /^[A-Z0-9][A-Z0-9_-]{1,31}$/,
        "Ürün kodu 2–32 harf, rakam, tire veya alt çizgi olmalı.",
      ),
    name: text(2, 80),
    category: z.enum(CATEGORIES),
    reorderPoint: z.number().int().min(0).max(MAX_STOCK),
    initialQuantity: z.number().int().min(0).max(MAX_STOCK),
  })
  .strict();
export const movementInput = z
  .object({
    requestId: z.string().uuid(),
    productId: z.string().uuid(),
    direction: z.enum(["in", "out"]),
    quantity: z.number().int().min(1).max(MAX_STOCK),
    reason: text(2, 200),
  })
  .strict();
export type ProductInput = z.infer<typeof productInput>;
export type MovementInput = z.infer<typeof movementInput>;
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function stockStatus(stock: number, threshold: number) {
  return stock === 0 ? "zero" : stock <= threshold ? "low" : "ok";
}
export const sampleProducts = [
  {
    sku: "ELE-001",
    name: "ESP32 geliştirme kartı",
    category: "Elektronik",
    reorderPoint: 10,
    initialQuantity: 24,
  },
  {
    sku: "ELE-002",
    name: "Ultrasonik mesafe sensörü",
    category: "Elektronik",
    reorderPoint: 10,
    initialQuantity: 6,
  },
  {
    sku: "ELE-003",
    name: "SG90 servo motor",
    category: "Elektronik",
    reorderPoint: 8,
    initialQuantity: 18,
  },
  {
    sku: "BAG-001",
    name: "Jumper kablo seti",
    category: "Bağlantı",
    reorderPoint: 15,
    initialQuantity: 42,
  },
  {
    sku: "BAG-002",
    name: "USB-C veri kablosu",
    category: "Bağlantı",
    reorderPoint: 5,
    initialQuantity: 0,
  },
  {
    sku: "ELE-004",
    name: "Breadboard — 830 pin",
    category: "Elektronik",
    reorderPoint: 10,
    initialQuantity: 32,
  },
  {
    sku: "MEK-001",
    name: "M3 vida seti",
    category: "Mekanik",
    reorderPoint: 10,
    initialQuantity: 55,
  },
  {
    sku: "ELE-005",
    name: "OLED ekran — 0,96 inç",
    category: "Elektronik",
    reorderPoint: 5,
    initialQuantity: 4,
  },
];
