import { describe, it, expect } from "vitest";
import { loadDataset } from "../src/dataset.js";

describe("dataset", () => {
  const dataset = loadDataset();

  it("loads the default dataset without errors", () => {
    expect(dataset.categories.length).toBeGreaterThan(0);
    expect(dataset.products.length).toBeGreaterThan(0);
    expect(dataset.vendors.length).toBeGreaterThan(0);
    expect(dataset.warehouses.length).toBeGreaterThan(0);
  });

  it("has valid referential integrity", () => {
    const categoryIds = new Set(dataset.categories.map((c) => c.id));
    const vendorIds = new Set(dataset.vendors.map((v) => v.id));
    const warehouseIds = new Set(dataset.warehouses.map((w) => w.id));

    for (const product of dataset.products) {
      expect(categoryIds.has(product.categoryId)).toBe(true);
      for (const variant of product.variants) {
        for (const offer of variant.offers) {
          expect(vendorIds.has(offer.vendorId)).toBe(true);
          expect(warehouseIds.has(offer.warehouseId)).toBe(true);
        }
      }
    }

    for (const voucher of dataset.vouchers) {
      if (voucher.categoryId) {
        expect(categoryIds.has(voucher.categoryId)).toBe(true);
      }
    }
  });

  it("each product has at least one variant with at least one offer", () => {
    for (const product of dataset.products) {
      expect(product.variants.length).toBeGreaterThan(0);
      for (const variant of product.variants) {
        expect(variant.offers.length).toBeGreaterThan(0);
      }
    }
  });

  it("warehouse packageTax is set for Austrian warehouses only", () => {
    for (const w of dataset.warehouses) {
      if (w.country === "AT") {
        expect(w.packageTax).toBe(300);
      } else {
        expect(
          w.packageTax === undefined || w.packageTax === 0,
        ).toBe(true);
      }
    }
  });
});
