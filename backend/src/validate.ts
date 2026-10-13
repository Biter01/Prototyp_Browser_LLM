import type { Dataset, Offer, StockLevel, ValidateRequest, ValidateResponse, CartIssue, Shipment, ShipmentItem, Voucher } from "./types.js";
import { getDataset } from "./dataset.js";

interface OfferEntry {
  offer: Offer;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
}

function stockAvailable(level: StockLevel): number {
  if (level === "NO") return 0;
  if (level === "LITTLE") return 10;
  return 9999;
}

function buildOfferMap(dataset: Dataset): Map<string, OfferEntry> {
  const map = new Map<string, OfferEntry>();
  for (const product of dataset.products) {
    for (const variant of product.variants) {
      for (const offer of variant.offers) {
        map.set(offer.id, {
          offer,
          productId: product.id,
          variantId: variant.id,
          productName: product.name,
          variantName: variant.name,
        });
      }
    }
  }
  return map;
}

export function validateCart(request: ValidateRequest, dataset: Dataset): ValidateResponse {
  const issues: CartIssue[] = [];
  const validItems: ShipmentItem[] = [];
  const offerMap = buildOfferMap(dataset);

  for (const item of request.items) {
    const entry = offerMap.get(item.offerId);

    if (!entry) {
      issues.push({ code: "OFFER_NOT_FOUND", message: `Offer ${item.offerId} not found`, offerId: item.offerId });
      continue;
    }

    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      issues.push({ code: "INVALID_QUANTITY", message: `Invalid quantity ${item.quantity} for offer ${item.offerId}`, offerId: item.offerId });
      continue;
    }

    if (item.quantity > stockAvailable(entry.offer.stock)) {
      issues.push({ code: "OUT_OF_STOCK", message: `Insufficient stock for offer ${item.offerId}: requested ${item.quantity}, available ${entry.offer.stock}`, offerId: item.offerId });
      continue;
    }

    validItems.push({
      offerId: item.offerId,
      productId: entry.productId,
      variantId: entry.variantId,
      productName: entry.productName,
      variantName: entry.variantName,
      quantity: item.quantity,
      unitPrice: entry.offer.price,
      lineTotal: entry.offer.price * item.quantity,
    });
  }

  const shipmentMap = new Map<string, Shipment>();
  for (const item of validItems) {
    const entry = offerMap.get(item.offerId)!;
    const key = `${entry.offer.vendorId}-${entry.offer.warehouseId}`;

    let shipment = shipmentMap.get(key);
    if (!shipment) {
      const warehouse = dataset.warehouses.find(w => w.id === entry.offer.warehouseId);
      shipment = {
        vendorId: entry.offer.vendorId,
        warehouseId: entry.offer.warehouseId,
        items: [],
        itemsSubtotal: 0,
        shippingCost: 0,
        packageTax: warehouse?.packageTax ?? 0,
        deliveryDays: { min: 0, max: 0 },
      };
      shipmentMap.set(key, shipment);
    }
    shipment.items.push(item);
    shipment.itemsSubtotal += item.lineTotal;
  }

  for (const shipment of shipmentMap.values()) {
    let rawShippingCost = 0;
    let maxMin = 0;
    let maxMax = 0;
    let hasFreeShipping = false;

    for (const item of shipment.items) {
      const entry = offerMap.get(item.offerId)!;
      rawShippingCost += entry.offer.shippingCost * item.quantity;
      if (entry.offer.deliveryDays.min > maxMin) maxMin = entry.offer.deliveryDays.min;
      if (entry.offer.deliveryDays.max > maxMax) maxMax = entry.offer.deliveryDays.max;
      if (entry.offer.freeShippingThreshold !== undefined && shipment.itemsSubtotal >= entry.offer.freeShippingThreshold) {
        hasFreeShipping = true;
      }
    }

    shipment.shippingCost = hasFreeShipping ? 0 : rawShippingCost;
    shipment.deliveryDays = { min: maxMin, max: maxMax };
  }

  const shipments = Array.from(shipmentMap.values());

  const deliveryDays = shipments.length > 0
    ? {
        min: Math.max(...shipments.map(s => s.deliveryDays.min)),
        max: Math.max(...shipments.map(s => s.deliveryDays.max)),
      }
    : null;

  const itemsTotal = validItems.reduce((sum, i) => sum + i.lineTotal, 0);
  let discount = 0;

  if (request.voucherCode) {
    const voucher = dataset.vouchers.find(v => v.code === request.voucherCode);

    if (!voucher) {
      issues.push({ code: "VOUCHER_NOT_FOUND", message: `Voucher ${request.voucherCode} not found` });
    } else if (voucher.validUntil && new Date(voucher.validUntil) < new Date()) {
      issues.push({ code: "VOUCHER_EXPIRED", message: `Voucher ${request.voucherCode} expired on ${voucher.validUntil}` });
    } else if (voucher.minOrderValue !== undefined && itemsTotal < voucher.minOrderValue) {
      issues.push({ code: "VOUCHER_MIN_ORDER_NOT_MET", message: `Minimum order value of ${voucher.minOrderValue}c not met (subtotal: ${itemsTotal}c)` });
    } else {
      discount = computeDiscount(voucher, validItems, dataset);
    }
  }

  const shippingTotal = shipments.reduce((sum, s) => sum + s.shippingCost + s.packageTax, 0);
  const grand = itemsTotal + shippingTotal - discount;

  return {
    valid: issues.length === 0,
    issues,
    shipments,
    totals: { items: itemsTotal, shipping: shippingTotal, discount, grand },
    deliveryDays,
    packageCount: shipments.length,
  };
}

function computeDiscount(voucher: Voucher, validItems: ShipmentItem[], dataset: Dataset): number {
  const eligibleSubtotal = voucher.categoryId
    ? validItems
        .filter(item => {
          const product = dataset.products.find(p => p.id === item.productId);
          return product?.categoryId === voucher.categoryId;
        })
        .reduce((sum, item) => sum + item.lineTotal, 0)
    : validItems.reduce((sum, item) => sum + item.lineTotal, 0);

  if (voucher.type === "percent") {
    return Math.min(Math.round(eligibleSubtotal * (voucher.value / 100)), eligibleSubtotal);
  }
  return Math.min(voucher.value, eligibleSubtotal);
}
