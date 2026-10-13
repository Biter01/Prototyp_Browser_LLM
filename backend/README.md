# Webshop Backend — IT Project 2026/27

Read-only webshop catalog backend for a student exercise at JKU Linz: students
fill a shopping cart through an AI chat assistant that uses tool calling to query
products and validate selections. The cart lives entirely in the frontend — this
backend only serves catalog data and offers a stateless `POST /validate` endpoint
to check cart contents, compute shipments, and apply voucher codes.

## Quick Start

### Prerequisites

- **Node.js** >= 20
- **pnpm** (package manager)
- **Git**

### Installation

```bash
git clone <repo-url>
cd webshop-backend
pnpm install
```

### Usage

```bash
pnpm dev          # starts server on http://localhost:3000 with file watching
```

Swagger UI is available at [http://localhost:3000/docs](http://localhost:3000/docs).

## API Overview

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/health` | Health check |
| GET | `/categories` | List all categories |
| GET | `/categories/:id/products` | Products in a category (404 if unknown) |
| GET | `/products` | Search products (`?category=`, `&q=`, `&minPrice=`, `&maxPrice=`) |
| GET | `/products/:id` | Product detail (404 if unknown) |
| GET | `/search` | Similarity search with typo tolerance, German synonyms and facets (see below) |
| GET | `/vendors` | List all vendors |
| GET | `/vendors/:id` | Vendor detail (404 if unknown) |
| GET | `/warehouses` | List all warehouses |
| POST | `/validate` | Validate cart and compute shipments |

All prices are in **integer euro cents** with currency `EUR`. IDs are UUIDs.
Vouchers are never exposed via the API — the only way to test a code is through
`POST /validate`.

## Similarity Search (GET /search)

`GET /products?q=` only does a plain substring match. `GET /search` is built for the chat
frontend: it understands German terms (`Regenjacke` → `rain jacket`), tolerates typos
(`hedphones` → `headphones`) and ranks name hits above brand/attribute and description hits.

| Parameter | Type | Meaning |
| --------- | ---- | ------- |
| `q` | string | search terms (German or English) |
| `category` | string | category ID **or** name; unknown → 400 |
| `gender` | `male` \| `female` \| `unisex` | unisex products always match |
| `color`, `size` | string | exact attribute value, e.g. `Black/Green`, `M` |
| `minPrice`, `maxPrice` | integer | in cents, like `/products` |
| `matchAll` | boolean | only products covering **every** term (`rain pants` → no chinos) |
| `limit` | integer 1–50 | max results, default 8 |

Response: `status` (`ok` · `too_many` · `not_found`), `total`, `results` (at most `limit`;
each with `priceFrom` and per variant the cheapest in-stock `offerId`) and `facets`
(counts per category, color, size, gender) so a client can ask a refining question.
The logic lives in `src/search.ts` (pure, no Fastify imports).

## Cart Validation (POST /validate)

The `/validate` endpoint accepts a list of items (offer ID + quantity) and an
optional voucher code. It validates each item, groups valid ones into shipments
by vendor and warehouse, computes shipping costs, applies free-shipping
thresholds, adds Austrian **Paketsteuer** (€3 flat per package for Austrian
warehouses), and evaluates voucher discounts. The response exposes trade-offs
between price, delivery speed, and package count so an AI agent can optimise for
different goals (cheapest, fastest, fewest packages).

Rate-limited to **5 requests per minute per IP**. Returns 429 on overuse.

## CLI Demo Client

The demo client (`client/demo.ts`) showcases the full API capabilities in a
7-step walkthrough. Start the server first, then run the client:

```bash
pnpm dev              # terminal 1 — start server
pnpm client           # terminal 2 — run demo
```

The client demonstrates:

1. **List categories** — browse the 6 JKU product categories
2. **Search products** — full-text search across name, description, brand, tags
3. **Product details** — variants with offers from multiple vendors
4. **Offer comparison** — cheapest vs fastest vs fewest packages for one variant
5. **Cart validation with errors** — OFFER_NOT_FOUND and INVALID_QUANTITY issues
6. **Voucher discount** — apply WELCOME10 for 10% off, see updated totals
7. **Expired voucher** — VOUCHER_EXPIRED error from EXPIRED2024

The client uses plain `fetch` (no dependencies) and can be used as a reference
for building AI tool-calling integrations.

## Dataset

The sample dataset (`data/dataset.json`) is JKU-Linz-themed: 201 products across
6 categories, 5 vendors with realistic shipping profiles, and 4 warehouses
including "Linz (JKU Campus)". 84% of offers have free shipping. A "JKU Starter
Set" of ~12 curated products is tagged with `starter-set`.

### Swapping datasets

The dataset is swappable at runtime via the `DATASET_PATH` environment variable
— no code changes needed. For example:

```bash
DATASET_PATH=./my-custom-dataset.json pnpm dev
```

The dataset must conform to the same schema as the default (categories, products,
vendors, warehouses, vouchers). Validation is handled by zod on load.

To regenerate the default dataset:

```bash
node scripts/generate-data.mjs
```

Never edit `data/dataset.json` by hand; always use the generator.

## Development

| Command | Purpose |
| ------- | ------- |
| `pnpm dev` | Start server with watch mode |
| `pnpm start` | Start server (no watch) |
| `pnpm typecheck` | TypeScript type checking (`tsc --noEmit`) |
| `pnpm test` | Run test suite (vitest) |
| `pnpm openapi` | Regenerate `openapi.yaml` from server routes |
| `pnpm client` | Run CLI demo client (requires running server) |
| `node scripts/generate-data.mjs` | Regenerate the default dataset |

Tests use `buildServer()` + `fastify.inject` — no live network port needed.
After making changes, always run `pnpm typecheck && pnpm test`.

## Project Structure

```
client/demo.ts          # CLI demo client (plain fetch, no deps)
data/dataset.json       # sample dataset (swappable via DATASET_PATH)
scripts/
  generate-data.mjs     # dataset generator
  openapi.ts            # writes swagger spec to openapi.yaml
src/
  index.ts              # entrypoint — reads env, starts server
  server.ts             # buildServer() factory with plugins and routes
  types.ts              # all domain + API types (single source of truth)
  dataset.ts            # zod schemas, loader, lookup indexes
  validate.ts           # pure cart validation logic (no fastify imports)
  routes/               # route plugins per resource
test/                   # vitest suites
openapi.yaml            # generated, committed — API contract
```

## Tech Stack

- **Runtime:** Node.js >= 20, pnpm, ESM
- **Language:** TypeScript (strict mode)
- **Framework:** Fastify 5 with `@fastify/swagger`, `@fastify/swagger-ui`, `@fastify/rate-limit`
- **Validation:** zod 4
- **Testing:** vitest
- **Dev tooling:** tsx (watch + execution)

## License

This project is developed for educational purposes at the Institute of
Business Informatics — Software Engineering, Johannes Kepler University Linz.
