const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

async function getJSON(path: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json() as Promise<unknown>;
}

async function postJSON(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
}

function divider() {
  console.log("─".repeat(60));
}

function heading(title: string) {
  console.log();
  divider();
  console.log(`  ${title}`);
  divider();
}

function formatCents(c: number): string {
  return `€${(c / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Step 1 – List categories
// ---------------------------------------------------------------------------
async function step1() {
  heading("1. List Categories — GET /categories");
  try {
    const cats = (await getJSON("/categories")) as { name: string; id: string }[];
    for (const c of cats) {
      console.log(`  ${c.name}`);
    }
  } catch (err: unknown) {
    console.log(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Step 2 – Search products for "laptop"
// ---------------------------------------------------------------------------
async function step2(): Promise<string | undefined> {
  heading('2. Search Products — GET /products?q=laptop');
  try {
    const products = (await getJSON("/products?q=laptop")) as {
      id: string; name: string; variants: { offers: { price: number }[] }[];
    }[];
    const top5 = products.slice(0, 5);
    for (const p of top5) {
      const prices = p.variants.flatMap((v) => v.offers.map((o) => o.price));
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      console.log(`  ${p.name}`);
      console.log(`    Price range: ${formatCents(min)} – ${formatCents(max)}`);
    }
    return top5[0]?.id;
  } catch (err: unknown) {
    console.log(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Step 3 – Product detail (first result from step 2)
// ---------------------------------------------------------------------------
async function step3(productId: string | undefined) {
  heading("3. Product Details — GET /products/:id");
  if (!productId) {
    console.log("  SKIP (no product ID from step 2)");
    return;
  }
  try {
    const p = (await getJSON(`/products/${productId}`)) as {
      id: string; name: string; description: string; brand?: string; tags: string[];
      variants: {
        id: string; name: string; sku: string;
        offers: {
          id: string; vendorId: string; warehouseId: string;
          price: number; shippingCost: number;
          freeShippingThreshold?: number;
          deliveryDays: { min: number; max: number }; stock: string;
        }[];
      }[];
    };
    console.log(`  ${p.name}`);
    console.log(`  Brand: ${p.brand ?? "—"}`);
    console.log(`  ${p.description}`);
    for (const v of p.variants) {
      console.log(`\n  Variant: ${v.name} (${v.sku})`);
      for (const o of v.offers) {
        const ship = o.shippingCost === 0 ? "free" : formatCents(o.shippingCost);
        const threshold = o.freeShippingThreshold != null
          ? ` (free ≥ ${formatCents(o.freeShippingThreshold)})`
          : "";
        console.log(
          `    Offer ${o.id.slice(0, 27)}… | vendor=${o.vendorId.slice(0, 27)}… | ` +
          `${formatCents(o.price)} | shipping ${ship}${threshold} | ` +
          `${o.deliveryDays.min}–${o.deliveryDays.max} d | stock ${o.stock}`,
        );
      }
    }
  } catch (err: unknown) {
    console.log(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Step 4 – Compare offers for one variant
// ---------------------------------------------------------------------------
async function step4() {
  heading("4. Compare Offers for a Variant");
  try {
    // Use the "Campus Clothing – Urban Jacket" or similar product with multiple
    // offers.  For deterministic behaviour we grab a known product that has
    // variants with several offers – the ThinkPad X1 Carbon Student Edition.
    const products = (await getJSON("/products?q=ThinkPad+X1+Carbon")) as {
      id: string; name: string;
      variants: {
        id: string; name: string; sku: string;
        offers: {
          id: string; vendorId: string; warehouseId: string;
          price: number; shippingCost: number;
          freeShippingThreshold?: number;
          deliveryDays: { min: number; max: number }; stock: string;
        }[];
      }[];
    }[];
    const tp = products[0];
    if (!tp) { console.log("  SKIP (ThinkPad not found)"); return; }

    const variant = tp.variants.find((v) => v.offers.length > 1);
    if (!variant) { console.log("  SKIP (no variant with multiple offers)"); return; }

    console.log(`  Product: ${tp.name}`);
    console.log(`  Variant: ${variant.name} (${variant.sku})`);

    for (let i = 0; i < variant.offers.length; i++) {
      const o = variant.offers[i];
      const ship = o.shippingCost === 0
        ? "free"
        : `${formatCents(o.shippingCost)}${o.freeShippingThreshold != null ? ` (free ≥ ${formatCents(o.freeShippingThreshold)})` : ""}`;
      console.log(`\n  ── Offer #${i + 1} ──`);
      console.log(`     Vendor:     ${o.vendorId}`);
      console.log(`     Warehouse:  ${o.warehouseId}`);
      console.log(`     Price:      ${formatCents(o.price)}`);
      console.log(`     Shipping:   ${ship}`);
      console.log(`     Delivery:   ${o.deliveryDays.min}–${o.deliveryDays.max} days`);
      console.log(`     Stock:      ${o.stock}`);
    }

    // Comparison summary
    console.log(`\n  ── Comparison ──`);
    const cheapest = variant.offers.reduce((a, b) => (a.price < b.price ? a : b));
    const fastest = variant.offers.reduce((a, b) =>
      a.deliveryDays.max < b.deliveryDays.max ? a : b,
    );

    // Group offers by (vendorId, warehouseId) to find which combo yields
    // fewest packages when items are consolidated.
    const groups = new Map<string, number>();
    for (const o of variant.offers) {
      const key = `${o.vendorId}|${o.warehouseId}`;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    const maxShared = Math.max(...groups.values(), 1);
    const bestGroup = [...groups.entries()].find(([, count]) => count === maxShared)!;
    const [bestVendor, bestWarehouse] = bestGroup[0].split("|");

    console.log(`  Cheapest:         ${formatCents(cheapest.price)} (vendor ${cheapest.vendorId.slice(0, 27)}…)`);
    console.log(`  Fastest:          ${fastest.deliveryDays.max} days max (vendor ${fastest.vendorId.slice(0, 27)}…)`);
    console.log(
      `  Fewest packages: ${maxShared} offer(s) share vendor+warehouse ` +
      `(${bestVendor.slice(0, 27)}… | ${bestWarehouse.slice(0, 27)}…)`,
    );
  } catch (err: unknown) {
    console.log(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Step 5 – Validate a problematic cart
// ---------------------------------------------------------------------------
async function step5() {
  heading("5. Validate Cart — POST /validate (with errors)");
  try {
    const cart = {
      items: [
        { offerId: "off-00000000-0018-0000-000000000000", quantity: 1 },
        { offerId: "off-nonexistent", quantity: 1 },
        { offerId: "off-nonexistent-another", quantity: 1 },
      ],
    };
    const data = (await postJSON("/validate", cart)) as {
      valid: boolean; issues: { code: string; message: string; offerId?: string }[];
      shipments: unknown[]; totals: Record<string, number>;
      deliveryDays: { min: number; max: number } | null; packageCount: number;
    };
    console.log(`  valid: ${data.valid}`);
    console.log("  issues:");
    for (const iss of data.issues) {
      console.log(`    ${iss.code} — ${iss.message}${iss.offerId != null ? ` (offerId: ${iss.offerId})` : ""}`);
    }
    console.log(`  shipments (${data.shipments.length}):`);
    console.log(JSON.stringify(data.shipments, null, 2));
    console.log(`  totals:         ${JSON.stringify(data.totals)}`);
    console.log(`  deliveryDays:   ${JSON.stringify(data.deliveryDays)}`);
    console.log(`  packageCount:   ${data.packageCount}`);
  } catch (err: unknown) {
    console.log(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Step 6 – Successful cart validation (no voucher)
// ---------------------------------------------------------------------------
async function step6() {
  heading("6. Successful Cart Validation — POST /validate (no voucher)");
  try {
    const products = (await getJSON("/products?q=ThinkPad+X1+Carbon")) as {
      id: string; name: string;
      variants: {
        id: string; name: string;
        offers: {
          id: string; vendorId: string; warehouseId: string;
          price: number; shippingCost: number;
          freeShippingThreshold?: number;
          deliveryDays: { min: number; max: number }; stock: string;
        }[];
      }[];
    }[];
    const tp = products[0];
    if (!tp) { console.log("  SKIP (ThinkPad not found)"); return; }

    const variant = tp.variants.find((v) => {
      const combos = new Set(v.offers.map((o) => `${o.vendorId}|${o.warehouseId}`));
      return combos.size >= 2;
    });
    if (!variant) { console.log("  SKIP (no variant with multiple vendor+warehouse combos)"); return; }

    const offer1 = variant.offers[0];
    const offer2 = variant.offers.find(
      (o) => o.vendorId !== offer1.vendorId || o.warehouseId !== offer1.warehouseId,
    );
    if (!offer2) { console.log("  SKIP (could not find 2 offers from different warehouses)"); return; }

    const cart = { items: [{ offerId: offer1.id, quantity: 1 }, { offerId: offer2.id, quantity: 2 }] };

    const data = (await postJSON("/validate", cart)) as {
      valid: boolean;
      issues: { code: string; message: string; offerId?: string }[];
      shipments: {
        vendorId: string; warehouseId: string;
        items: {
          offerId: string; productId: string; variantId: string;
          productName: string; variantName: string;
          quantity: number; unitPrice: number; lineTotal: number;
        }[];
        itemsSubtotal: number;
        shippingCost: number;
        packageTax: number;
        deliveryDays: { min: number; max: number };
      }[];
      totals: { items: number; shipping: number; discount: number; grand: number };
      deliveryDays: { min: number; max: number } | null;
      packageCount: number;
    };

    const vendorNames = new Map<string, string>();
    for (const s of data.shipments) {
      if (!vendorNames.has(s.vendorId)) {
        const v = (await getJSON(`/vendors/${s.vendorId}`)) as { name: string };
        vendorNames.set(s.vendorId, v.name);
      }
    }
    const allWarehouses = (await getJSON("/warehouses")) as { id: string; name: string }[];
    const warehouseNames = new Map(allWarehouses.map((w) => [w.id, w.name]));

    console.log(`  valid: ${data.valid}`);
    console.log(`  issues: ${JSON.stringify(data.issues)}`);
    console.log(`  shipments (${data.shipments.length}):`);
    for (let i = 0; i < data.shipments.length; i++) {
      const s = data.shipments[i];
      const vName = vendorNames.get(s.vendorId) ?? s.vendorId;
      const wName = warehouseNames.get(s.warehouseId) ?? s.warehouseId;
      console.log(`\n  ── Shipment #${i + 1} ──`);
      console.log(`     Vendor:         ${vName}`);
      console.log(`     Warehouse:      ${wName}`);
      console.log(`     Items:`);
      for (const item of s.items) {
        console.log(`       - ${item.productName} — ${item.variantName}`);
        console.log(`         qty ${item.quantity} × ${formatCents(item.unitPrice)} = ${formatCents(item.lineTotal)}`);
      }
      console.log(`     Items Subtotal: ${formatCents(s.itemsSubtotal)}`);
      const shipNote = s.shippingCost === 0 ? " (free)" : "";
      console.log(`     Shipping Cost:  ${formatCents(s.shippingCost)}${shipNote}`);
      console.log(`     Package Tax:    ${formatCents(s.packageTax)}`);
      console.log(`     Delivery Days:  ${s.deliveryDays.min}–${s.deliveryDays.max}`);
    }
    console.log(`\n  totals:`);
    console.log(`    items:    ${formatCents(data.totals.items)}`);
    console.log(`    shipping: ${formatCents(data.totals.shipping)}`);
    console.log(`    discount: ${formatCents(data.totals.discount)}`);
    console.log(`    grand:    ${formatCents(data.totals.grand)}`);
    console.log(`  deliveryDays:   ${data.deliveryDays?.min}–${data.deliveryDays?.max} days`);
    console.log(`  packageCount:   ${data.packageCount}`);
  } catch (err: unknown) {
    console.log(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Step 7 – Validate with valid voucher WELCOME10
// ---------------------------------------------------------------------------
async function step7() {
  heading('7. Validate with Voucher — POST /validate (voucherCode: "WELCOME10")');
  try {
    const cart = {
      items: [
        { offerId: "off-00000000-0018-0000-000000000000", quantity: 1 },
        { offerId: "off-00000000-0030-0000-000000000000", quantity: 2 },
      ],
      voucherCode: "WELCOME10",
    };
    const data = (await postJSON("/validate", cart)) as {
      valid: boolean; issues: unknown[]; totals: Record<string, number>;
    };
    console.log(`  valid:     ${data.valid}`);
    console.log(`  issues:    ${JSON.stringify(data.issues)}`);
    console.log(
      `  totals:    items=${formatCents(data.totals.items)}  shipping=${formatCents(data.totals.shipping)}  ` +
      `discount=${formatCents(data.totals.discount)}  grand=${formatCents(data.totals.grand)}`,
    );
  } catch (err: unknown) {
    console.log(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Step 8 – Validate with expired voucher EXPIRED2024
// ---------------------------------------------------------------------------
async function step8() {
  heading('8. Validate with Expired Voucher — POST /validate (voucherCode: "EXPIRED2024")');
  try {
    const cart = {
      items: [
        { offerId: "off-00000000-0018-0000-000000000000", quantity: 1 },
        { offerId: "off-00000000-0030-0000-000000000000", quantity: 2 },
      ],
      voucherCode: "EXPIRED2024",
    };
    const data = (await postJSON("/validate", cart)) as {
      valid: boolean; issues: { code: string; message: string }[]; totals: Record<string, number>;
    };
    console.log(`  valid:  ${data.valid}`);
    console.log("  issues:");
    for (const iss of data.issues) {
      console.log(`    ${iss.code} — ${iss.message}`);
    }
    console.log(
      `  totals: items=${formatCents(data.totals.items)}  shipping=${formatCents(data.totals.shipping)}  ` +
      `discount=${formatCents(data.totals.discount)}  grand=${formatCents(data.totals.grand)}`,
    );
  } catch (err: unknown) {
    console.log(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Webshop API Demo Client — BASE_URL=${BASE_URL}`);

  await step1();
  const firstProductId = await step2();
  await step3(firstProductId);
  await step4();
  await step5();
  await step6();
  await step7();
  await step8();

  heading("Done");
}

main();
