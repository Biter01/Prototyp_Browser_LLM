# Agents.md — Webshop Backend (IT Project 2026/27)

Read-only webshop catalog backend for a student exercise: students fill a shopping
cart via AI chat + tool calling. The cart lives **entirely in the frontend** — this
backend only serves catalog data and offers a stateless `POST /validate` endpoint.
No auth, no images, portable, swappable JSON dataset.

## Stack

- Node.js >= 20, pnpm, ESM (`"type": "module"`)
- TypeScript (strict), Fastify 5
- `@fastify/swagger` + `@fastify/swagger-ui` (docs at `/docs`, spec export to `openapi.yaml`)
- `@fastify/rate-limit` (only on `POST /validate`: 5 requests / minute / IP)
- `zod` for dataset validation, `vitest` for tests, `tsx` for dev/scripts
- Money is always **integer cents**, currency `EUR`. IDs are UUIDs.

## Commands

| Command             | Purpose                                        |
| ------------------- | ---------------------------------------------- |
| `pnpm dev`          | Start server with watch (tsx)                  |
| `pnpm start`        | Start server (tsx, no watch)                   |
| `pnpm typecheck`    | `tsc --noEmit`                                 |
| `pnpm test`         | `vitest run`                                   |
| `pnpm openapi`      | Generate/refresh committed `openapi.yaml`      |
| `pnpm client`       | Run CLI demo client against a running server   |

Env vars: `PORT` (default 3000), `HOST` (default 0.0.0.0), `DATASET_PATH`
(default `data/dataset.json` — swap datasets without code changes).

## Project structure

```
data/dataset.json     # default sample dataset (swappable via DATASET_PATH)
src/types.ts          # all domain + API types (single source of truth)
src/dataset.ts        # zod schemas, loader, lookup indexes (by id, offer→variant→product)
src/validate.ts       # pure cart validation logic (no fastify imports!)
src/search.ts         # pure similarity search for GET /search (no fastify imports!)
src/server.ts         # buildServer() factory: plugins, schemas, routes
src/index.ts          # entrypoint (reads env, starts server)
src/routes/*.ts       # route plugins per resource
scripts/openapi.ts    # boots server, writes swagger YAML to openapi.yaml
client/demo.ts        # CLI demo client (plain fetch, no deps)
test/*.test.ts        # vitest suites (use buildServer + fastify.inject)
openapi.yaml          # generated, committed — contract for the frontend team
```

## API contract (do not deviate)

- `GET /health` → `{ status: "ok" }`
- `GET /categories` → `Category[]`
- `GET /categories/:id/products` → `Product[]` (404 if category unknown)
- `GET /products?category=&q=&minPrice=&maxPrice=` → `Product[]`
  (`q` matches name/description/brand/tags, case-insensitive; price filters in
  cents, match if **any** offer price is in range)
- `GET /products/:id` → `Product` (404 if unknown)
- `GET /vendors` → `Vendor[]`, `GET /vendors/:id` → `Vendor` (404)
- `GET /warehouses` → `Warehouse[]` (warehouse UUIDs are public)
- `POST /validate` → `ValidateResponse` (rate-limited 5/min/IP → 429)

Vouchers are **never exposed via the API** (no list/detail endpoint). The only way
to learn whether a voucher code is valid is `POST /validate` — which is rate-limited
to make brute-forcing codes impractical. Voucher codes are distributed out-of-band
(e.g. in the exercise description).

All error bodies: `{ statusCode, error, message }` (fastify default shape).

## Domain types (single source of truth: `src/types.ts`)

```typescript
interface Category { id: string; name: string; description: string }

interface Product {
  id: string; categoryId: string; name: string; description: string;
  brand?: string; tags: string[];
  attributes: Record<string, string | number | boolean>;
  variants: Variant[];
}

interface Variant {
  id: string; sku: string; name: string;
  attributes: Record<string, string | number | boolean>;
  offers: Offer[];
}

type StockLevel = "NO" | "LITTLE" | "ALOT";

interface Offer {
  id: string; vendorId: string; warehouseId: string;
  price: number; currency: "EUR";
  shippingCost: number;              // per item, cents; 0 means free shipping
  freeShippingThreshold?: number;    // shipment item subtotal >= threshold → shipping 0
  deliveryDays: { min: number; max: number };
  stock: StockLevel;
}

interface Vendor { id: string; name: string; rating: number /* 1..5 */ }
interface Warehouse { id: string; name: string; country: string; packageTax?: number }

interface Voucher {
  code: string;                      // e.g. "WELCOME10"
  type: "percent" | "fixed";        // percent: value = 0..100; fixed: cents
  value: number;
  minOrderValue?: number;            // cents, on items subtotal
  validUntil?: string;               // ISO date
  categoryId?: string;               // discount applies only to items of this category
  description: string;
}

interface Dataset {
  categories: Category[]; products: Product[]; vendors: Vendor[];
  warehouses: Warehouse[]; vouchers: Voucher[];
}
```

## `/validate` semantics

Request:

```typescript
interface ValidateRequest {
  items: { offerId: string; quantity: number }[];
  voucherCode?: string;
}
```

Response:

```typescript
interface ValidateResponse {
  valid: boolean;                    // false if any issue exists
  issues: CartIssue[];
  shipments: Shipment[];             // grouped by vendorId + warehouseId
  totals: { items: number; shipping: number; discount: number; grand: number };
  deliveryDays: { min: number; max: number } | null; // slowest shipment wins
  packageCount: number;              // shipments.length
}

interface CartIssue {
  code: "OFFER_NOT_FOUND" | "INVALID_QUANTITY" | "OUT_OF_STOCK"
      | "VOUCHER_NOT_FOUND" | "VOUCHER_EXPIRED" | "VOUCHER_MIN_ORDER_NOT_MET";
  message: string;
  offerId?: string;
}

interface Shipment {
  vendorId: string; warehouseId: string;
  items: { offerId: string; productId: string; variantId: string;
           productName: string; variantName: string;
           quantity: number; unitPrice: number; lineTotal: number }[];
  itemsSubtotal: number;
  shippingCost: number;              // 0 if freeShippingThreshold reached
  packageTax: number;                // flat per-shipment tax (e.g. €3 Paketsteuer)
  deliveryDays: { min: number; max: number };
}
```

Rules:

- Unknown offer → `OFFER_NOT_FOUND`; `quantity < 1` or non-integer → `INVALID_QUANTITY`;
  `quantity > stock` → `OUT_OF_STOCK`. Problem items are excluded from shipments/totals.
- Shipments group valid items by `(vendorId, warehouseId)`.
- Shipment `shippingCost = Σ item.shippingCost × quantity`; set to `0` if any item's
  offer has `freeShippingThreshold` and the shipment's `itemsSubtotal >=` that threshold.
- Shipment `deliveryDays = { min: max(items.min), max: max(items.max) }` (ships complete).
- Overall `deliveryDays = { min: max(shipments.min), max: max(shipments.max) }`,
  `null` when there are no shipments.
- Voucher: applied to items subtotal (never shipping); with `categoryId` only to the
  matching items' subtotal. Discount capped at eligible subtotal. Issues per rules above;
  invalid voucher → `discount: 0` + issue (items/shipping still computed).
- `grand = items + shipping − discount`.

The response deliberately exposes price/speed/package trade-offs so an AI agent can
optimize for "cheapest", "fastest delivery", or "fewest packages" by picking
different offers for the same variant.

## Shipping & taxes

- Offers carry per-item `shippingCost` in cents; most offers have `shippingCost: 0` (free shipping).
- `freeShippingThreshold` is only set on paid offers; when a shipment's `itemsSubtotal >= threshold`,
  that shipment's `shippingCost` is reduced to 0.
- Austrian warehouses (country `"AT"`) carry a flat `packageTax` of 300 cents (€3 Paketsteuer per
  package) added on top of `shippingCost` per shipment.
- `Shipment` exposes both `shippingCost` and `packageTax` so an AI can compare total landed cost.
- `totals.shipping` = sum over all shipments of (`shippingCost` + `packageTax`).

## Dataset generation

The dataset is generated by `scripts/generate-data.mjs` — never hand-edit `data/dataset.json`.
To regenerate:
```bash
node scripts/generate-data.mjs
```
The data is JKU-Linz-themed (201 products across 6 categories, 5 vendors with realistic shipping
profiles, 4 warehouses including "Linz (JKU Campus)").

A "JKU Starter Set" can be composed by filtering for the `starter-set` tag across products in
Campus Clothing, JKU Merchandise, Electronics & Gadgets, and Textbooks & Stationery categories
(~12 curated products).

## Build agent authority

The build/verify flow is **not** restated here — it lives in skill `build-verify`
(agents-skills), with its always-on kernel in `.agents/rules/build-verify.md`:
pull before changing, delegate implementation, verify in an independent subagent,
commit after every round, push and watch CI. Follow that skill, not a local copy.

## Subagent authority

Implementation and verification go to **separate, independent subagents** — never
validate your own work. The verifying subagent reports findings with
`file:line` + severity; it does not fix them. Details: skill `build-verify`.

## Conventions

- **Conventional Commits** (`feat:`, `fix:`, `test:`, `docs:`, `chore:`)
- No comments in code unless necessary; strict TS, no `any`
- Keep `src/validate.ts` pure (data in → result out) so it is unit-testable
- Tests use `buildServer()` + `fastify.inject`, never a live network port
  (except rate-limit test may use inject with distinct `remoteAddress`)
- After changes always run: `pnpm typecheck && pnpm test`
- When API shape changes: regenerate `openapi.yaml` via `pnpm openapi` and commit it
