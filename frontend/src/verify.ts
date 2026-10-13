// Schritt 2: Prüfung der Modellausgabe gegen den Nutzertext und den Gesprächszustand.
// Was weder im Text steht noch im Gespräch geklärt ist, wird entfernt; Offensichtliches wird ergänzt.
import type { Context } from "./context.ts";
import type { Extraction } from "./prompt.ts";
import {
  CART_SIGNAL, CATEGORY_WORDS, COLOR_WORDS, GENDER_WORDS, SIZE_WORDS,
  cleanQuery, colorKey, extractPrice, hasWord, isSet, normalize, ordinalFromText, words,
  type Gender,
} from "./text.ts";

export interface Verified { value: Extraction; notes: string[] }

export function verifyExtraction(raw: unknown, userText: string, ctx: Context): Verified {
  const x: Record<string, unknown> = {};
  for (const [k, v] of Object.entries((raw ?? {}) as Record<string, unknown>)) if (isSet(v)) x[k] = v;
  const notes: string[] = [];
  const t = normalize(userText);
  const drop = (k: string, why: string): void => {
    if (k in x) { notes.push(`${k} „${String(x[k])}“ entfernt: ${why}`); delete x[k]; }
  };
  const str = (k: string): string | undefined => (typeof x[k] === "string" ? (x[k] as string) : undefined);

  // Produkt: Preise und Zahlen entfernen
  const product = str("product");
  if (product !== undefined) {
    const c = cleanQuery(product);
    if (c !== normalize(product).trim()) notes.push(`product „${product}“ → „${c ?? ""}“ (Preis/Zahl entfernt)`);
    if (c) x.product = c; else delete x.product;
  }
  if (Array.isArray(x.products)) x.products = x.products.map((p) => cleanQuery(String(p))).filter(Boolean);

  // Nur eine Farbe als "Produkt" (z. B. Antwort "schwarz" auf "Welche Farbe?") → Farbfilter
  const prod2 = str("product");
  if (prod2 !== undefined) {
    const pw = words(prod2);
    if (pw.length && pw.every((w) => COLOR_WORDS[colorKey(w)])) {
      if (!x.color) x.color = prod2;
      notes.push(`product „${prod2}“ ist eine Farbe → color`);
      delete x.product;
    }
  }
  // "category: none" ohne Produkt ergibt keinen Sinn (oft bei Antworten auf Rückfragen)
  if (x.category === "none" && !x.product && !x.products) { notes.push("category „none“ ohne Produkt entfernt"); delete x.category; }

  // Preis: muss als Zahl im Text stehen
  const p = extractPrice(userText);
  for (const k of ["maxPriceEur", "minPriceEur"] as const) {
    if (k in x && p[k] === undefined) drop(k, "kein Preis im Text");
    else if (k in x && p[k] !== x[k]) { notes.push(`${k} ${String(x[k])} → ${p[k]} (laut Text)`); x[k] = p[k]; }
    else if (!(k in x) && p[k] !== undefined && x.intent !== "off_topic") { x[k] = p[k]; notes.push(`${k} ${p[k]} aus dem Text ergänzt`); }
  }

  // Größe: muss als eigenes Wort im Text stehen (oder Small/Medium/Large)
  const size = str("size");
  if (size !== undefined) {
    const s = normalize(size).replace(/^eu\s*/, "");
    if (!hasWord(userText, s) && !(SIZE_WORDS[s] ?? []).some((w) => hasWord(userText, w))) drop("size", "nicht im Text");
    else x.size = s.toUpperCase();
  }

  // Geschlecht: gültig, wenn im Text ODER im Gespräch schon geklärt
  const known = ctx.prefs.gender;
  const g = str("gender") as Gender | undefined;
  if (g !== undefined && !GENDER_WORDS[g]?.some((w) => hasWord(userText, w)) && g !== known) {
    drop("gender", "weder im Text noch im Gespräch");
  }
  if (!("gender" in x) && x.intent !== "off_topic") {
    for (const [gg, ws] of Object.entries(GENDER_WORDS)) {
      if (ws.some((w) => hasWord(userText, w))) { x.gender = gg; notes.push(`gender „${gg}“ aus dem Text ergänzt`); break; }
    }
  }
  if (!("gender" in x) && known && (x.intent === "search" || x.intent === "outfit")) {
    x.gender = known; notes.push(`gender „${known}“ aus dem Gespräch übernommen`);
  }

  // Farbe
  const color = str("color");
  if (color !== undefined) {
    const key = colorKey(color);
    if (!(COLOR_WORDS[key] ?? [key]).some((w) => t.includes(w))) drop("color", "nicht im Text");
    else x.color = key;
  }

  // Menge
  if ("quantity" in x && !new RegExp(`(^|\\D)${String(x.quantity)}(\\D|$)`).test(t) && !/\b(zwei|drei|vier|funf|two|three|four|five)\b/.test(t)) {
    drop("quantity", "nicht im Text");
  }

  // Ganze Kategorie gefragt ("Was habt ihr an Kleidung?"), Modell sagt aber "unclear"
  if (x.intent === "unclear" || (x.intent === "search" && !x.product && !x.category)) {
    const cat = Object.entries(CATEGORY_WORDS).find(([name, ws]) => ctx.categoryNames.includes(name) && ws.some((w) => t.includes(w)))?.[0];
    if (cat) { x.intent = "search"; x.category = cat; notes.push(`category „${cat}“ aus dem Text erkannt`); }
  }

  // Intent-Gegencheck
  if (x.intent === "add_to_cart") {
    if (!ctx.shown.length) {
      x.intent = x.product ? "search" : "unclear"; notes.push(`add_to_cart → ${String(x.intent)}: es wurden noch keine Produkte gezeigt`);
    } else if (!CART_SIGNAL.test(t) && ordinalFromText(userText, ctx.shown.length) === undefined && ctx.pending?.type !== "variant") {
      x.intent = x.product ? "search" : "unclear"; notes.push(`add_to_cart → ${String(x.intent)}: kein Kauf-Signal im Text`);
    }
  }
  if (x.intent === "add_to_cart") {
    const o = ordinalFromText(userText, ctx.shown.length);
    if (o !== undefined && o !== x.ref) {
      notes.push("ref" in x ? `ref ${String(x.ref)} → ${o} (laut Text)` : `ref ${o} aus dem Text ergänzt`);
      x.ref = o;
    }
    if (typeof x.ref === "number" && (x.ref < 1 || x.ref > ctx.shown.length)) drop("ref", `nur ${ctx.shown.length} Produkte gezeigt`);
    if (!("ref" in x) && ctx.shown.length === 1) { x.ref = 1; notes.push("ref 1 ergänzt (nur ein Produkt gezeigt)"); }
  } else if ("ref" in x) delete x.ref;

  if (x.intent === "outfit") {
    const parts = (Array.isArray(x.products) ? x.products : []).map((s) => String(s).trim()).filter(Boolean).slice(0, 4);
    if (parts.length < 2) {
      x.intent = "search"; x.product = parts[0] ?? x.product; delete x.products;
      notes.push("outfit → search: weniger als zwei Teile erkannt");
    } else x.products = parts;
  } else delete x.products;

  if (x.intent === "off_topic") for (const k of Object.keys(x)) if (k !== "intent") delete x[k];
  return { value: x as unknown as Extraction, notes };
}
