import { readFileSync } from "node:fs";
import { z } from "zod";
import type {
  Category,
  Product,
  Variant,
  Offer,
  Vendor,
  Warehouse,
  Voucher,
  Dataset,
  StockLevel,
} from "./types.js";

const deliveryDaysSchema = z.object({
  min: z.number().int().min(0),
  max: z.number().int().min(0),
});

const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
});

const vendorSchema = z.object({
  id: z.string(),
  name: z.string(),
  rating: z.number().min(1).max(5),
});

const warehouseSchema = z.object({
  id: z.string(),
  name: z.string(),
  country: z.string(),
  packageTax: z.number().int().nonnegative().optional(),
});

const voucherSchema = z.object({
  code: z.string(),
  type: z.enum(["percent", "fixed"]),
  value: z.number(),
  minOrderValue: z.number().optional(),
  validUntil: z.string().optional(),
  categoryId: z.string().optional(),
  description: z.string(),
});

const offerSchema = z.object({
  id: z.string(),
  vendorId: z.string(),
  warehouseId: z.string(),
  price: z.number().int(),
  currency: z.literal("EUR"),
  shippingCost: z.number().int(),
  freeShippingThreshold: z.number().int().optional(),
  deliveryDays: deliveryDaysSchema,
  stock: z.enum(["NO", "LITTLE", "ALOT"]),
});

const variantSchema = z.object({
  id: z.string(),
  sku: z.string(),
  name: z.string(),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  offers: z.array(offerSchema),
});

const productSchema = z.object({
  id: z.string(),
  categoryId: z.string(),
  name: z.string(),
  description: z.string(),
  brand: z.string().optional(),
  tags: z.array(z.string()),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  variants: z.array(variantSchema),
});

const datasetSchema = z.object({
  categories: z.array(categorySchema),
  products: z.array(productSchema),
  vendors: z.array(vendorSchema),
  warehouses: z.array(warehouseSchema),
  vouchers: z.array(voucherSchema),
});

export { datasetSchema };

let cachedDataset: Dataset | null = null;
let categoryById: Map<string, Category> = new Map();
let productById: Map<string, Product> = new Map();
let vendorById: Map<string, Vendor> = new Map();
let warehouseById: Map<string, Warehouse> = new Map();
let offerById: Map<string, Offer & { variantId: string; productId: string }> = new Map();
let voucherByCode: Map<string, Voucher> = new Map();

function buildIndexes(data: Dataset): void {
  categoryById = new Map(data.categories.map((c) => [c.id, c]));
  productById = new Map(data.products.map((p) => [p.id, p]));
  vendorById = new Map(data.vendors.map((v) => [v.id, v]));
  warehouseById = new Map(data.warehouses.map((w) => [w.id, w]));
  voucherByCode = new Map(data.vouchers.map((v) => [v.code, v]));

  offerById = new Map();
  for (const product of data.products) {
    for (const variant of product.variants) {
      for (const offer of variant.offers) {
        offerById.set(offer.id, {
          ...offer,
          variantId: variant.id,
          productId: product.id,
        });
      }
    }
  }
}

export function loadDataset(path?: string): Dataset {
  const resolvedPath = path ?? process.env.DATASET_PATH ?? "data/dataset.json";
  const raw = readFileSync(resolvedPath, "utf-8");
  const parsed: unknown = JSON.parse(raw);
  const result = datasetSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Dataset validation failed: ${result.error.message}`,
    );
  }
  const data = result.data as Dataset;
  buildIndexes(data);
  cachedDataset = data;
  return data;
}

export function getDataset(): Dataset {
  if (!cachedDataset) {
    return loadDataset();
  }
  return cachedDataset;
}

export function getCategoryById(): ReadonlyMap<string, Category> {
  if (!cachedDataset) loadDataset();
  return categoryById;
}

export function getProductById(): ReadonlyMap<string, Product> {
  if (!cachedDataset) loadDataset();
  return productById;
}

export function getVendorById(): ReadonlyMap<string, Vendor> {
  if (!cachedDataset) loadDataset();
  return vendorById;
}

export function getWarehouseById(): ReadonlyMap<string, Warehouse> {
  if (!cachedDataset) loadDataset();
  return warehouseById;
}

export function getOfferById(): ReadonlyMap<
  string,
  Offer & { variantId: string; productId: string }
> {
  if (!cachedDataset) loadDataset();
  return offerById;
}

export function getVoucherByCode(): ReadonlyMap<string, Voucher> {
  if (!cachedDataset) loadDataset();
  return voucherByCode;
}
