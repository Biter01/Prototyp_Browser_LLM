import type { StockLevel } from "../src/types.js";
import { describe, it, expect, beforeAll } from "vitest";
import { loadDataset } from "../src/dataset.js";
import { validateCart } from "../src/validate.js";

let dataset: ReturnType<typeof loadDataset>;

beforeAll(() => {
  dataset = loadDataset();
});

interface OfferInfo {
  offerId: string;
  warehouseId: string;
  vendorId: string;
  price: number;
  shippingCost: number;
  freeShippingThreshold?: number;
  stock: StockLevel;
  productId?: string;
}

function findOffer(
  predicate: (o: OfferInfo) => boolean,
): OfferInfo | null {
  for (const product of dataset.products) {
    for (const variant of product.variants) {
      for (const offer of variant.offers) {
        const info: OfferInfo = {
          offerId: offer.id,
          warehouseId: offer.warehouseId,
          vendorId: offer.vendorId,
          price: offer.price,
          shippingCost: offer.shippingCost,
          freeShippingThreshold: offer.freeShippingThreshold,
          stock: offer.stock,
          productId: product.id,
        };
        if (predicate(info)) return info;
      }
    }
  }
  return null;
}

function findOfferWithFreeShipping(): OfferInfo | null {
  return findOffer(
    (o) =>
      o.shippingCost > 0 &&
      o.freeShippingThreshold !== undefined &&
      o.stock !== "NO" &&
      o.freeShippingThreshold > 0,
  );
}

function findOfferUnderPrice(max: number): OfferInfo | null {
  return findOffer(
    (o) => o.price > 0 && o.price < max && o.stock !== "NO",
  );
}

function findOfferWithStockZero(): OfferInfo | null {
  return findOffer((o) => o.stock === "NO");
}

describe("validateCart", () => {
  it("happy path: valid items", () => {
    const offer = findOffer((o) => o.stock === "ALOT" && o.shippingCost === 0);
    expect(offer).not.toBeNull();
    const result = validateCart({
      items: [{ offerId: offer!.offerId, quantity: 2 }],
    }, dataset);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.shipments.length).toBeGreaterThan(0);
    expect(result.totals.items).toBeGreaterThan(0);
    expect(result.packageCount).toBeGreaterThan(0);
  });

  it("OFFER_NOT_FOUND: nonexistent offerId", () => {
    const result = validateCart({
      items: [{ offerId: "nonexistent-offer", quantity: 1 }],
    }, dataset);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].code).toBe("OFFER_NOT_FOUND");
    expect(result.issues[0].offerId).toBe("nonexistent-offer");
  });

  it("INVALID_QUANTITY: non-integer quantity", () => {
    const offer = findOffer((o) => o.stock !== "NO");
    expect(offer).not.toBeNull();
    const result = validateCart({
      items: [{ offerId: offer!.offerId, quantity: 1.5 }],
    }, dataset);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].code).toBe("INVALID_QUANTITY");
  });

  it("OUT_OF_STOCK: quantity exceeds stock", () => {
    const zeroOffer = findOfferWithStockZero();
    if (zeroOffer) {
      const result = validateCart({
        items: [{ offerId: zeroOffer.offerId, quantity: 1 }],
      }, dataset);
      expect(result.valid).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].code).toBe("OUT_OF_STOCK");
    } else {
      const offer = findOffer((o) => o.stock !== "NO");
      expect(offer).not.toBeNull();
      const result = validateCart({
        items: [{ offerId: offer!.offerId, quantity: 999999 }],
      }, dataset);
      expect(result.valid).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].code).toBe("OUT_OF_STOCK");
    }
  });

  it("shipment grouping: different vendors produce separate shipments", () => {
    const offer1 = findOffer((o) => {
      const wh = dataset.warehouses.find(
        (w) => w.id === o.warehouseId,
      );
      return o.stock !== "NO" && wh?.country === "DE";
    });
    const offer2 = offer1
      ? findOffer(
          (o) =>
            o.stock !== "NO" &&
            o.vendorId !== offer1.vendorId &&
            o.warehouseId !== offer1.warehouseId,
        )
      : null;
    expect(offer1).not.toBeNull();
    expect(offer2).not.toBeNull();
    const result = validateCart({
      items: [
        { offerId: offer1!.offerId, quantity: 1 },
        { offerId: offer2!.offerId, quantity: 1 },
      ],
    }, dataset);
    expect(result.shipments.length).toBeGreaterThanOrEqual(2);
  });

  it("free shipping threshold: shipping becomes 0 when threshold met", () => {
    const paid = findOfferWithFreeShipping();
    if (!paid) {
      return;
    }
    const qty = Math.ceil(
      paid.freeShippingThreshold! / paid.price,
    );
    const result = validateCart({
      items: [{ offerId: paid.offerId, quantity: qty }],
    }, dataset);
    const shipment = result.shipments.find(
      (s) => s.warehouseId === paid.warehouseId && s.vendorId === paid.vendorId,
    );
    expect(shipment).toBeDefined();
    expect(shipment!.itemsSubtotal).toBeGreaterThanOrEqual(
      paid.freeShippingThreshold!,
    );
    expect(shipment!.shippingCost).toBe(0);
  });

  it("delivery days: overall = max of shipment max, shipment = max of item max", () => {
    const offer = findOffer((o) => o.stock === "ALOT" && o.shippingCost === 0);
    expect(offer).not.toBeNull();
    const result = validateCart({
      items: [{ offerId: offer!.offerId, quantity: 1 }],
    }, dataset);
    expect(result.deliveryDays).not.toBeNull();
    for (const shipment of result.shipments) {
      expect(shipment.deliveryDays.min).toBeGreaterThanOrEqual(0);
      expect(shipment.deliveryDays.max).toBeGreaterThanOrEqual(
        shipment.deliveryDays.min,
      );
    }
    const maxMin = Math.max(
      ...result.shipments.map((s) => s.deliveryDays.min),
    );
    const maxMax = Math.max(
      ...result.shipments.map((s) => s.deliveryDays.max),
    );
    expect(result.deliveryDays!.min).toBe(maxMin);
    expect(result.deliveryDays!.max).toBe(maxMax);
  });

  it("package tax: AT warehouse → 300, non-AT → 0", () => {
    const atOffer = findOffer(
      (o) =>
        o.stock !== "NO" &&
        dataset.warehouses.find(
          (w) => w.id === o.warehouseId && w.country === "AT",
        ) !== undefined,
    );
    const nonAtOffer = findOffer(
      (o) =>
        o.stock !== "NO" &&
        dataset.warehouses.find(
          (w) => w.id === o.warehouseId && w.country !== "AT",
        ) !== undefined,
    );
    if (atOffer && nonAtOffer) {
      const result = validateCart({
        items: [
          { offerId: atOffer.offerId, quantity: 1 },
          { offerId: nonAtOffer.offerId, quantity: 1 },
        ],
      }, dataset);
      const atShipment = result.shipments.find(
        (s) => s.warehouseId === atOffer.warehouseId,
      );
      const nonAtShipment = result.shipments.find(
        (s) => s.warehouseId === nonAtOffer.warehouseId,
      );
      expect(atShipment).toBeDefined();
      expect(atShipment!.packageTax).toBe(300);
      if (nonAtShipment) {
        expect(nonAtShipment.packageTax).toBe(0);
      }
    }
  });

  it("voucher percent: applies percent discount correctly", () => {
    const offer = findOffer((o) => o.stock === "ALOT" && o.shippingCost === 0);
    expect(offer).not.toBeNull();
    const result = validateCart({
      items: [{ offerId: offer!.offerId, quantity: 1 }],
      voucherCode: "WELCOME10",
    }, dataset);
    expect(result.valid).toBe(true);
    const expectedDiscount = Math.round(
      (result.totals.items * 10) / 100,
    );
    expect(result.totals.discount).toBe(expectedDiscount);
  });

  it("voucher fixed: fixed discount capped at subtotal", () => {
    const cheap = findOfferUnderPrice(10000);
    expect(cheap).not.toBeNull();
    const result = validateCart({
      items: [{ offerId: cheap!.offerId, quantity: 1 }],
      voucherCode: "FLAT500",
    }, dataset);
    const expected = Math.min(500, result.totals.items);
    expect(result.totals.discount).toBe(expected);
  });

  it("voucher with categoryId: discount only applies to matching category items", () => {
    const campusCat = dataset.categories.find((c) =>
      c.name.includes("Campus Clothing"),
    );
    const otherCat = dataset.categories.find(
      (c) => !c.name.includes("Campus Clothing"),
    );
    expect(campusCat).not.toBeNull();
    expect(otherCat).not.toBeNull();
    const campusOffer = findOffer(
      (o) =>
        o.stock !== "NO" &&
        dataset.products.some(
          (p) =>
            p.id === o.productId &&
            p.categoryId === campusCat!.id,
        ),
    );
    const otherOffer = findOffer(
      (o) =>
        o.stock !== "NO" &&
        dataset.products.some(
          (p) =>
            p.id === o.productId &&
            p.categoryId === otherCat!.id,
        ),
    );
    if (campusOffer && otherOffer && campusOffer.offerId !== otherOffer.offerId) {
      const result = validateCart({
        items: [
          { offerId: campusOffer.offerId, quantity: 1 },
          { offerId: otherOffer.offerId, quantity: 1 },
        ],
        voucherCode: "STUDENT20",
      }, dataset);
      const campusProduct = dataset.products.find(
        (p) => p.id === campusOffer.productId,
      );
      let eligibleSubtotal = 0;
      if (campusProduct) {
        for (const shipment of result.shipments) {
          for (const si of shipment.items) {
            if (si.productId === campusProduct.id) {
              eligibleSubtotal += si.lineTotal;
            }
          }
        }
      }
      const expectedDiscount = Math.round(
        (eligibleSubtotal * 20) / 100,
      );
      expect(result.totals.discount).toBe(expectedDiscount);
    }
  });

  it("voucher expired: returns VOUCHER_EXPIRED issue", () => {
    const offer = findOffer((o) => o.stock !== "NO");
    expect(offer).not.toBeNull();
    const result = validateCart({
      items: [{ offerId: offer!.offerId, quantity: 1 }],
      voucherCode: "EXPIRED2024",
    }, dataset);
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((i) => i.code === "VOUCHER_EXPIRED"),
    ).toBe(true);
    expect(result.totals.discount).toBe(0);
  });

  it("voucher minOrderValue not met: returns VOUCHER_MIN_ORDER_NOT_MET", () => {
    const cheap = findOfferUnderPrice(5000);
    expect(cheap).not.toBeNull();
    const total = cheap!.price * 1;
    expect(total).toBeLessThan(5000);
    const result = validateCart({
      items: [{ offerId: cheap!.offerId, quantity: 1 }],
      voucherCode: "MINORDER3000",
    }, dataset);
    expect(result.valid).toBe(false);
    expect(
      result.issues.some(
        (i) => i.code === "VOUCHER_MIN_ORDER_NOT_MET",
      ),
    ).toBe(true);
    expect(result.totals.discount).toBe(0);
  });

  it("voucher not found: returns VOUCHER_NOT_FOUND issue", () => {
    const offer = findOffer((o) => o.stock !== "NO");
    expect(offer).not.toBeNull();
    const result = validateCart({
      items: [{ offerId: offer!.offerId, quantity: 1 }],
      voucherCode: "NONEXISTENT",
    }, dataset);
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((i) => i.code === "VOUCHER_NOT_FOUND"),
    ).toBe(true);
    expect(result.totals.discount).toBe(0);
  });

  it("discount capped: voucher discount never exceeds eligible subtotal", () => {
    const cheap = findOfferUnderPrice(10000);
    expect(cheap).not.toBeNull();
    const result = validateCart({
      items: [{ offerId: cheap!.offerId, quantity: 1 }],
      voucherCode: "FLAT500",
    }, dataset);
    expect(result.totals.discount).toBeLessThanOrEqual(
      result.totals.items,
    );
  });

  it("mixed valid/invalid items: valid in shipments, invalid in issues", () => {
    const offer = findOffer((o) => o.stock === "ALOT" && o.shippingCost === 0);
    const invalidOffer = findOffer((o) => o.stock !== "NO" && o.offerId !== offer?.offerId);
    expect(offer).not.toBeNull();
    expect(invalidOffer).not.toBeNull();
    const result = validateCart({
      items: [
        { offerId: offer!.offerId, quantity: 1 },
        { offerId: "nonexistent", quantity: 1 },
        { offerId: invalidOffer!.offerId, quantity: 1.5 },
      ],
    }, dataset);
    expect(result.valid).toBe(false);
    expect(result.shipments.length).toBeGreaterThan(0);
    const allShipmentOfferIds = result.shipments.flatMap((s) =>
      s.items.map((i) => i.offerId),
    );
    expect(allShipmentOfferIds).not.toContain("nonexistent");
    expect(allShipmentOfferIds).not.toContain(invalidOffer!.offerId);
    expect(
      result.issues.some((i) => i.code === "OFFER_NOT_FOUND"),
    ).toBe(true);
    expect(
      result.issues.some((i) => i.code === "INVALID_QUANTITY"),
    ).toBe(true);
  });

  it("empty cart: no items, no issues, no shipments", () => {
    const result = validateCart({ items: [] }, dataset);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.shipments).toHaveLength(0);
    expect(result.deliveryDays).toBeNull();
    expect(result.packageCount).toBe(0);
    expect(result.totals.items).toBe(0);
    expect(result.totals.shipping).toBe(0);
    expect(result.totals.discount).toBe(0);
    expect(result.totals.grand).toBe(0);
  });

  it("all items invalid: multiple OFFER_NOT_FOUND issues, no shipments", () => {
    const result = validateCart({
      items: [
        { offerId: "fake1", quantity: 1 },
        { offerId: "fake2", quantity: 1 },
      ],
    }, dataset);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0].code).toBe("OFFER_NOT_FOUND");
    expect(result.issues[1].code).toBe("OFFER_NOT_FOUND");
    expect(result.shipments).toHaveLength(0);
    expect(result.deliveryDays).toBeNull();
    expect(result.packageCount).toBe(0);
  });

  it("voucher on empty cart: WELCOME10 valid with discount 0, MINORDER3000 min order not met", () => {
    const resultWelcome = validateCart({
      items: [],
      voucherCode: "WELCOME10",
    }, dataset);
    expect(resultWelcome.valid).toBe(true);
    expect(resultWelcome.totals.discount).toBe(0);
    expect(resultWelcome.issues).toHaveLength(0);
    const resultMinOrder = validateCart({
      items: [],
      voucherCode: "MINORDER3000",
    }, dataset);
    expect(resultMinOrder.valid).toBe(false);
    expect(
      resultMinOrder.issues.some((i) => i.code === "VOUCHER_MIN_ORDER_NOT_MET"),
    ).toBe(true);
    expect(resultMinOrder.totals.discount).toBe(0);
  });

  it("free shipping threshold not met: shippingCost > 0", () => {
    const paid = findOfferWithFreeShipping();
    expect(paid).not.toBeNull();
    const qty = 1;
    const subtotal = paid!.price * qty;
    expect(subtotal).toBeLessThan(paid!.freeShippingThreshold!);
    const result = validateCart({
      items: [{ offerId: paid!.offerId, quantity: qty }],
    }, dataset);
    const shipment = result.shipments.find(
      (s) => s.warehouseId === paid!.warehouseId && s.vendorId === paid!.vendorId,
    );
    expect(shipment).toBeDefined();
    expect(shipment!.itemsSubtotal).toBeLessThan(paid!.freeShippingThreshold!);
    expect(shipment!.shippingCost).toBeGreaterThan(0);
  });
});
