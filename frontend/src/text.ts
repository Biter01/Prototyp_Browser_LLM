// Textaufbereitung für die Prüfung der Modellausgabe gegen den Nutzertext.

export function normalize(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export const words = (t: string): string[] => normalize(t).split(/[^a-z0-9]+/).filter(Boolean);

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const hasWord = (text: string, w: string): boolean =>
  new RegExp(`(^|[^a-z0-9])${escapeRe(w)}($|[^a-z0-9])`).test(normalize(text));

export const isSet = (v: unknown): boolean =>
  v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);

export type Gender = "male" | "female";

export const GENDER_WORDS: Record<Gender, string[]> = {
  male: ["herren", "herr", "manner", "mann", "men", "man", "male", "jungs", "junge"],
  female: ["damen", "dame", "frauen", "frau", "women", "woman", "female", "madchen"],
};

export const COLOR_WORDS: Record<string, string[]> = {
  black: ["schwarz", "black"], white: ["weiss", "white"], navy: ["navy", "dunkelblau", "marine"],
  blue: ["blau", "blue"], grey: ["grau", "grey", "gray"], brown: ["braun", "brown"],
  red: ["rot", "red"], green: ["grun", "green", "olive", "oliv"], beige: ["beige"], khaki: ["khaki"],
  cream: ["creme", "cream"],
};

export const SIZE_WORDS: Record<string, string[]> = { s: ["small"], m: ["medium"], l: ["large"] };

/** Wörter, an denen der Code eine ganze Kategorie erkennt ("Was habt ihr an Kleidung?") */
export const CATEGORY_WORDS: Record<string, string[]> = {
  "Campus Clothing": ["kleidung", "klamotten", "gewand", "anziehen", "mode", "clothing", "clothes"],
  "JKU Merchandise & Apparel": ["merch", "fanartikel", "souvenir", "jku sachen", "jku-sachen"],
  "Electronics & Gadgets": ["elektronik", "technik", "gadget", "electronics"],
  "Textbooks & Stationery": ["bucher", "lehrbucher", "schreibwaren", "schulsachen", "books", "stationery"],
  "Software & Subscriptions": ["software", "lizenzen", "programme", "abos", "subscriptions"],
  "Campus Accessories": ["zubehor", "accessoires", "accessories"],
};

export const ORDINALS: Record<string, number> = {
  erste: 1, ersten: 1, erstes: 1, erster: 1, first: 1, zweite: 2, zweiten: 2, zweites: 2, second: 2,
  dritte: 3, dritten: 3, drittes: 3, third: 3, vierte: 4, vierten: 4, viertes: 4, funfte: 5, funften: 5, funftes: 5,
};
const LAST_WORDS = ["letzte", "letzten", "letztes", "last"];

export const CART_SIGNAL =
  /\b(nimm|nehm\w*|kauf\w*|bestell\w*|warenkorb|korb|leg\w*|hinzu\w*|add|buy|take|hatte gern|will (die|das|den))\b/;

export function colorKey(c: string): string {
  const n = normalize(c);
  return Object.keys(COLOR_WORDS).find((k) => k === n || COLOR_WORDS[k]!.includes(n)) ?? n;
}

export const isLastWord = (w: string): boolean => LAST_WORDS.includes(w);

export function ordinalFromText(text: string, shownCount: number): number | undefined {
  const w = words(text);
  if (w.some(isLastWord)) return shownCount || undefined;
  for (const x of w) if (ORDINALS[x]) return ORDINALS[x];
  const m = normalize(text).match(/(?:nr\.?|nummer|number|#)\s*(\d+)/);
  return m ? Number(m[1]) : undefined;
}

// ---------- Preise ----------

const NUM = "(\\d+(?:[.,]\\d+)?)";
const PRICE_MAX = new RegExp(`(?:unter|under|below|bis|max(?:imal)?|hochstens|less than|<)\\s*${NUM}\\s*(?:€|eur(?:o)?)?`, "i");
const PRICE_MIN = new RegExp(`(?:ab|uber|over|above|from|mindestens|min|>)\\s*${NUM}\\s*(?:€|eur(?:o)?)`, "i");
const PRICE_ANY = new RegExp(`${NUM}\\s*(?:€|eur(?:o)?)`, "i");
const toNum = (s: string): number => Number(s.replace(",", "."));

export interface PriceInText { rest: string; maxPriceEur?: number; minPriceEur?: number }

export function extractPrice(text: string): PriceInText {
  let t = normalize(text);
  const out: PriceInText = { rest: "" };
  let m: RegExpMatchArray | null;
  if ((m = t.match(PRICE_MAX))) { out.maxPriceEur = toNum(m[1]!); t = t.replace(m[0], " "); }
  if ((m = t.match(PRICE_MIN))) { out.minPriceEur = toNum(m[1]!); t = t.replace(m[0], " "); }
  if (out.maxPriceEur === undefined && out.minPriceEur === undefined && (m = t.match(PRICE_ANY))) {
    out.maxPriceEur = toNum(m[1]!); t = t.replace(m[0], " ");
  }
  out.rest = t.replace(/€/g, " ").replace(/\s+/g, " ").trim();
  return out;
}

/** Suchtext bereinigen: Preisangaben und reine Zahlen gehören nicht in die Produktsuche */
export function cleanQuery(q: string): string | undefined {
  const rest = extractPrice(q).rest.split(/\s+/)
    .filter((w) => w && !/^\d+([.,]\d+)?$/.test(w) && !/^[€$%]$/.test(w)).join(" ");
  return rest || undefined;
}

export const fmtEur = (cents: number): string => `${(cents / 100).toFixed(2).replace(".", ",")} €`;
export const genderDe = (g: string): string => ({ male: "Herren", female: "Damen", unisex: "Unisex" } as Record<string, string>)[g] ?? g;
