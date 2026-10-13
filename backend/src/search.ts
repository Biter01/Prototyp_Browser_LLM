// Ähnlichkeitssuche über den Katalog (reine Logik, keine Fastify-Imports).
// Versteht deutsche Begriffe (Synonyme), toleriert Tippfehler (Levenshtein ≤ 1) und
// gewichtet Treffer im Namen höher als in Marke/Attributen und Beschreibung.
import type {
  Category,
  Dataset,
  Product,
  SearchFacets,
  SearchHit,
  SearchQuery,
  SearchResponse,
} from "./types.js";

export const DEFAULT_LIMIT = 8;
export const MAX_LIMIT = 50;

// ---------- Textaufbereitung ----------

export function normalize(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const STOP = new Set([
  "a", "an", "the", "for", "and", "or", "with", "of", "in", "to",
  "fur", "und", "oder", "mit", "ein", "eine", "einen", "der", "die", "das", "ich", "brauch", "brauche",
  "under", "unter", "below", "bis", "max", "maximal", "euro", "eur", "price", "preis",
]);

const stem = (t: string): string => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t);

export function tokens(s: unknown): string[] {
  return normalize(s).split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t)).map(stem);
}

/** Deutsch → Englisch (der Katalog ist englisch). Schlüssel normalisiert, ohne Umlaute. */
export const SYNONYMS: Record<string, string> = {
  kopfhorer: "headphones headset earbuds", jacke: "jacket", regenjacke: "rain jacket waterproof",
  regen: "rain waterproof", hose: "pants trousers", regenhose: "rain pants", schuhe: "shoes sneakers",
  schuh: "shoes sneakers", winterjacke: "winter jacket down parka", rucksack: "backpack",
  wasserdicht: "waterproof", laptop: "laptop notebook", taschenrechner: "calculator",
  buch: "book textbook", lehrbuch: "textbook", mutze: "beanie hat", handschuhe: "gloves",
  pullover: "sweater hoodie", kapuzenpullover: "hoodie", tasse: "mug", flasche: "bottle",
  regenschirm: "umbrella", billig: "budget", gunstig: "budget", leicht: "lightweight",
};

/** Für matchAll: Begriffe, die als gleichwertig gelten ("rain pants" ↔ "waterproof trousers"). */
const COVER_SYNONYMS: Record<string, string[]> = {
  rain: ["rain", "waterproof"], waterproof: ["waterproof", "rain"],
  pant: ["pant", "trouser"], trouser: ["trouser", "pant"],
};

export function expandQuery(q: string): string[] {
  const out: string[] = [];
  for (const t of normalize(q).split(/[^a-z0-9]+/).filter(Boolean)) {
    out.push(t);
    const syn = SYNONYMS[t];
    if (syn) out.push(...syn.split(" "));
  }
  return [...new Set(out.filter((t) => !STOP.has(t)).map(stem))];
}

/** true, wenn der Levenshtein-Abstand höchstens 1 ist */
export function lev1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export function tokenScore(qt: string, pt: string): number {
  if (qt === pt) return 1;
  if (qt.length >= 4 && pt.startsWith(qt)) return 0.8;
  if (qt.length >= 5 && lev1(qt, pt)) return 0.7;
  return 0;
}

// ---------- Index ----------

type Gender = "male" | "female" | "unisex";

interface IndexedProduct {
  product: Product;
  category: Category;
  /** Gewicht und Tokens: 3 = Name, 2 = Marke/Attribute/Farben, 1 = Tags/Beschreibung/Kategorie */
  fields: [number, Set<string>][];
  allTokens: string[];
  colors: string[];
  sizes: string[];
  genders: Gender[];
  priceFrom: number | null;
  variants: SearchHit["variants"];
}

const attrText = (attrs: Record<string, string | number | boolean>): string =>
  Object.entries(attrs)
    .map(([k, v]) => (v === true ? k : v === false ? "" : String(v)))
    .join(" ");

function indexProduct(p: Product, category: Category): IndexedProduct {
  const variantAttr = (key: string): string[] =>
    p.variants.map((v) => v.attributes[key]).filter((x): x is string => typeof x === "string");
  const productColor = typeof p.attributes.color === "string" ? [p.attributes.color] : [];
  const colors = [...new Set([...productColor, ...variantAttr("color")])];
  const sizes = [...new Set(variantAttr("size"))];
  const genders = [...new Set([p.attributes.gender, ...variantAttr("gender")]
    .filter((g): g is Gender => g === "male" || g === "female" || g === "unisex"))];

  const variants = p.variants.map((v) => {
    const inStock = v.offers.filter((o) => o.stock !== "NO").sort((a, b) => a.price - b.price);
    return { id: v.id, name: v.name, priceFrom: inStock[0]?.price ?? null, offerId: inStock[0]?.id ?? null };
  });
  const prices = variants.map((v) => v.priceFrom).filter((x): x is number => x !== null);

  const fields: [number, Set<string>][] = [
    [3, new Set(tokens(p.name))],
    [2, new Set(tokens([p.brand ?? "", attrText(p.attributes), colors.join(" ")].join(" ")))],
    [1, new Set(tokens([p.tags.join(" "), p.description, category.name].join(" ")))],
  ];
  return {
    product: p, category, fields,
    allTokens: fields.flatMap(([, set]) => [...set]),
    colors, sizes, genders,
    priceFrom: prices.length ? Math.min(...prices) : null,
    variants,
  };
}

let indexed: { data: Dataset; items: IndexedProduct[] } | null = null;

export function buildSearchIndex(data: Dataset): IndexedProduct[] {
  if (indexed?.data === data) return indexed.items;
  const catById = new Map(data.categories.map((c) => [c.id, c]));
  const items = data.products.flatMap((p) => {
    const c = catById.get(p.categoryId);
    return c ? [indexProduct(p, c)] : [];
  });
  indexed = { data, items };
  return items;
}

// ---------- Suche ----------

const GENDER_WORDS: Record<string, Gender> = {
  herren: "male", men: "male", man: "male", male: "male", mann: "male", manner: "male",
  damen: "female", women: "female", woman: "female", female: "female", frau: "female", frauen: "female",
  unisex: "unisex",
};

export function normGender(g: string | undefined): Gender | undefined {
  return g ? GENDER_WORDS[normalize(g)] : undefined;
}

/** Kategorie per ID oder Name (Groß-/Kleinschreibung egal). undefined = unbekannt. */
export function resolveCategory(data: Dataset, value: string): Category | undefined {
  const n = normalize(value).trim();
  return data.categories.find((c) => c.id === value || normalize(c.name) === n);
}

/** Deckt ein Produkt ALLE Suchbegriffe ab? ("rain pants" → eine Chino zählt nicht) */
function coversAll(item: IndexedProduct, q: string): boolean {
  return tokens(q).every((qt) =>
    (COVER_SYNONYMS[qt] ?? [qt]).some((s) => item.allTokens.some((pt) => tokenScore(s, pt) >= 0.7)));
}

const has = (arr: string[], v: string): boolean => arr.some((x) => normalize(x) === normalize(v));

export function searchProducts(data: Dataset, query: SearchQuery): SearchResponse {
  const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const items = buildSearchIndex(data);
  const category = query.category ? resolveCategory(data, query.category) : undefined;
  const qTokens = query.q ? expandQuery(query.q) : [];
  const gender = normGender(query.gender);

  let hits: { item: IndexedProduct; score: number }[] = [];
  for (const item of items) {
    if (item.priceFrom === null) continue;                                  // nicht lieferbar
    if (category && item.category.id !== category.id) continue;
    if (query.maxPrice !== undefined && item.priceFrom > query.maxPrice) continue;
    if (query.minPrice !== undefined && item.priceFrom < query.minPrice) continue;
    if (query.color && !has(item.colors, query.color)) continue;
    if (query.size && !has(item.sizes, query.size)) continue;
    if (gender && item.genders.length && !item.genders.includes(gender) && !item.genders.includes("unisex")) continue;

    let score = 0, strong = false;
    for (const qt of qTokens) {
      let best = 0;
      for (const [w, set] of item.fields) for (const pt of set) {
        const s = w * tokenScore(qt, pt);
        if (s > best) best = s;
        if (w >= 2 && s >= w * 0.7) strong = true;                          // Treffer in Name oder Attributen
      }
      score += best;
    }
    if (qTokens.length && (score === 0 || !strong)) continue;
    if (query.matchAll && query.q && !coversAll(item, query.q)) continue;
    hits.push({ item, score });
  }

  if (qTokens.length) {
    const top = Math.max(0, ...hits.map((h) => h.score));
    hits = hits.filter((h) => h.score >= top * 0.4).sort((a, b) => b.score - a.score);
  } else {
    hits.sort((a, b) => (a.item.priceFrom ?? 0) - (b.item.priceFrom ?? 0));
  }

  const total = hits.length;
  return {
    status: total === 0 ? "not_found" : total > limit ? "too_many" : "ok",
    total,
    limit,
    results: hits.slice(0, limit).map(({ item, score }) => toHit(item, score)),
    facets: facets(hits.map((h) => h.item)),
  };
}

function toHit(item: IndexedProduct, score: number): SearchHit {
  const p = item.product;
  return {
    id: p.id,
    name: p.name,
    ...(p.brand ? { brand: p.brand } : {}),
    categoryId: item.category.id,
    categoryName: item.category.name,
    priceFrom: item.priceFrom,
    colors: item.colors,
    sizes: item.sizes,
    genders: item.genders,
    score: Math.round(score * 100) / 100,
    variants: item.variants,
  };
}

function facets(items: IndexedProduct[]): SearchFacets {
  const count = (vals: string[]): Record<string, number> => {
    const m: Record<string, number> = {};
    for (const v of vals) m[v] = (m[v] ?? 0) + 1;
    return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8));
  };
  return {
    category: count(items.map((i) => i.category.name)),
    color: count(items.flatMap((i) => i.colors)),
    size: count(items.flatMap((i) => i.sizes)),
    gender: count(items.flatMap((i) => i.genders)),
    withColor: items.filter((i) => i.colors.length).length,
    withSize: items.filter((i) => i.sizes.length).length,
  };
}
