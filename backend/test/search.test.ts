import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { loadDataset } from "../src/dataset.js";
import { searchProducts, expandQuery, lev1 } from "../src/search.js";
import { buildServer } from "../src/server.js";

describe("search logic", () => {
  const data = loadDataset();
  const names = (q: Parameters<typeof searchProducts>[1]) => searchProducts(data, q).results.map((h) => h.name);

  it("translates German terms via synonyms", () => {
    expect(expandQuery("Regenjacke")).toEqual(expect.arrayContaining(["rain", "jacket"]));
    expect(names({ q: "Regenjacke" })[0]).toBe("Men's Rain Jacket Campus Edition");
  });

  it("tolerates typos", () => {
    expect(lev1("hedphones", "headphones")).toBe(true);
    expect(names({ q: "hedphones sony" })).toEqual(["Sony WH-1000XM5 Headphones"]);
  });

  it("ranks name hits above description hits", () => {
    const r = searchProducts(data, { q: "rain jacket" });
    const scores = r.results.map((h) => h.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(r.results[0]?.name).toContain("Rain Jacket");
  });

  it("matchAll keeps only products covering every term", () => {
    const loose = names({ q: "rain pants", gender: "male", category: "Campus Clothing" });
    expect(loose).toContain("Men's Slim Fit Chino Pants");
    expect(names({ q: "rain pants", gender: "male", matchAll: true })).toEqual([]);
    expect(names({ q: "rain pants", gender: "female", matchAll: true })).toEqual(["Women's Rain Pants Over-Trousers"]);
  });

  it("accepts category by name or id and filters by color", () => {
    const byName = searchProducts(data, { category: "JKU Merchandise & Apparel", color: "Black/Green" });
    const id = data.categories.find((c) => c.name === "JKU Merchandise & Apparel")!.id;
    const byId = searchProducts(data, { category: id, color: "Black/Green" });
    expect(byName.results.map((h) => h.name)).toEqual(["JKU Lanyard", "JKU Scarf"]);
    expect(byId.results).toEqual(byName.results);
  });

  it("reports too_many with facets and caps results at limit", () => {
    const r = searchProducts(data, { category: "JKU Merchandise & Apparel" });
    expect(r.status).toBe("too_many");
    expect(r.total).toBe(30);
    expect(r.results).toHaveLength(8);
    expect(r.facets.color["Black/Green"]).toBe(2);
    expect(r.facets.withColor).toBeLessThanOrEqual(r.total);
  });

  it("filters by price in cents and reports not_found", () => {
    const r = searchProducts(data, { q: "headphones", maxPrice: 10000 });
    expect(r.status).toBe("not_found");
    for (const h of searchProducts(data, { q: "hoodie", maxPrice: 5000 }).results) {
      expect(h.priceFrom).not.toBeNull();
      expect(h.priceFrom!).toBeLessThanOrEqual(5000);
    }
  });

  it("returns the cheapest in-stock offer per variant", () => {
    const hit = searchProducts(data, { q: "rain jacket", gender: "male", limit: 1 }).results[0]!;
    const product = data.products.find((p) => p.id === hit.id)!;
    for (const v of hit.variants) {
      const offers = product.variants.find((x) => x.id === v.id)!.offers.filter((o) => o.stock !== "NO");
      const cheapest = Math.min(...offers.map((o) => o.price));
      expect(v.priceFrom).toBe(cheapest);
      expect(offers.find((o) => o.id === v.offerId)?.price).toBe(cheapest);
    }
  });
});

describe("GET /search", () => {
  let server: FastifyInstance;

  afterEach(async () => {
    await server.close();
  });

  it("returns 200 with status, total, results and facets", async () => {
    server = await buildServer();
    const res = await server.inject({ method: "GET", url: "/search?q=Regenjacke&gender=male" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.results[0].name).toBe("Men's Rain Jacket Campus Edition");
    expect(body.results[0].variants[0]).toHaveProperty("offerId");
    expect(body.facets).toHaveProperty("color");
  });

  it("coerces numeric and boolean query parameters", async () => {
    server = await buildServer();
    const res = await server.inject({ method: "GET", url: "/search?q=rain%20pants&gender=female&matchAll=true&limit=3" });
    expect(res.statusCode).toBe(200);
    expect(res.json().results.map((h: { name: string }) => h.name)).toEqual(["Women's Rain Pants Over-Trousers"]);
  });

  it("returns 400 for an unknown category", async () => {
    server = await buildServer();
    const res = await server.inject({ method: "GET", url: "/search?category=Kühlschränke" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for an invalid limit", async () => {
    server = await buildServer();
    const res = await server.inject({ method: "GET", url: "/search?limit=0" });
    expect(res.statusCode).toBe(400);
  });
});
