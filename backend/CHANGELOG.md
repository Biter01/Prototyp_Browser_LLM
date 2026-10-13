# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `GET /search`: similarity search (German→English synonyms, typo tolerance, weighted name/attribute/description
  matching, `matchAll` for strict multi-term matches) with `status`, `total`, capped `results` incl. cheapest
  in-stock offer per variant, and `facets` for refinement questions (`src/search.ts`, `src/routes/search.ts`)
- 12 vitest tests for search logic and route (`test/search.test.ts`)
- Project scaffold with TypeScript 7, Fastify 5, ESM, strict mode
- Domain types: Category, Product, Variant, Offer, Vendor, Warehouse, Voucher, Dataset
- Cart validation types: ValidateRequest, ValidateResponse, CartIssue, Shipment
- Dataset loader with zod 4 validation and lookup indexes
- JKU-Linz-themed sample dataset (201 products, 1765 offers, 84% free shipping)
- Dataset generator (`scripts/generate-data.mjs`) — run to regenerate `data/dataset.json`
- Per-vendor shipping model with `freeShippingThreshold`
- Austria Paketsteuer (€3/package) modeled as `Warehouse.packageTax`
- CLI demo client (`client/demo.ts`) — 7-step showcase of API capabilities
- Build agent authority documented in Agents.md
- Subagent authority: verification subagents may spawn fix subagents
- 37 vitest tests covering dataset integrity, routes, validation logic, and rate limiting
- README with installation prerequisites, commands, and dataset swap instructions
- 8 additional test cases (empty cart, filters, invalid body, voucher edge cases) — 43 total

### Changed

- Migrated from npm to pnpm as package manager
- Upgraded all dependencies to latest: Fastify 5.10, zod 4.4, TypeScript 7, vitest 4
- Improved dataset realism: pricing separated (clothing ≤€111, electronics ≥€229), stock distribution, shoe EU sizes, JKU-themed brand names
- Quantity minimum raised from 0 to 1 (Fastify schema + validate logic)
- Stock field changed from numeric to `StockLevel` enum (`NO` | `LITTLE` | `ALOT`)
- Clothing products now have `gender` attribute (`male` | `female` | `unisex`) with gender-specific size systems
- Regenerated openapi.yaml with stock enum, quantity min 1, rate-limit docs
