// Schritt 3: Ablauf im Code. Das Modell hat nur erkannt, was der Nutzer will;
// Suche, Rückfragen, Outfit und Warenkorb steuert ausschließlich dieser Code.
import type { SearchHit, SearchResponse } from "./api.ts";
import {
  MAX_RESULTS, hitOf,
  type Ask, type Choice, type Context, type SearchArgs,
} from "./context.ts";
import type { Extraction } from "./prompt.ts";
import {
  CART_SIGNAL, COLOR_WORDS, ORDINALS, colorKey, fmtEur, genderDe, isLastWord, normalize, words,
} from "./text.ts";

export interface Step { ok: boolean; text: string }
export interface Group { label: string; ids: string[] }
export interface Reply { text: string; options?: string[]; productIds?: string[]; groups?: Group[] }
export interface FlowResult { steps: Step[]; reply: Reply; effective: Extraction }

// ---------- Hilfen ----------

export function filterText(a: SearchArgs | Extraction): string {
  const f: string[] = [];
  if (a.gender) f.push(`für ${genderDe(a.gender)}`);
  if (a.size) f.push(`in Größe ${a.size}`);
  if (a.color) f.push(`in ${a.color}`);
  if (a.maxPriceEur !== undefined) f.push(`bis ${a.maxPriceEur} €`);
  if (a.minPriceEur !== undefined) f.push(`ab ${a.minPriceEur} €`);
  return f.length ? " " + f.join(", ") : "";
}

const searchArgs = (x: Extraction): SearchArgs => ({
  query: x.product, category: x.category, gender: x.gender, size: x.size,
  color: x.color, maxPriceEur: x.maxPriceEur, minPriceEur: x.minPriceEur,
});

const toCents = (eur: number | undefined): number | undefined => (eur === undefined ? undefined : Math.round(eur * 100));

/** Ruft GET /search auf. Kategorie "none" wird nie ans Backend geschickt. */
function apiSearch(ctx: Context, a: SearchArgs, limit = MAX_RESULTS): Promise<SearchResponse> {
  return ctx.api.search({
    q: a.query,
    category: a.category && a.category !== "none" ? a.category : undefined,
    gender: a.gender, size: a.size, color: a.color,
    minPrice: toCents(a.minPriceEur), maxPrice: toCents(a.maxPriceEur),
    matchAll: a.matchAll || undefined,
    limit,
  });
}

async function runSearch(ctx: Context, a: SearchArgs, steps: Step[], label = ""): Promise<SearchResponse> {
  const r = await apiSearch(ctx, a);
  steps.push({
    ok: r.status === "ok",
    text: `${label}GET /search „${a.query ?? "–"}“${a.category ? ` in ${a.category}` : ""}${filterText(a)}${a.matchAll ? " (alle Begriffe)" : ""} → ${r.total} Treffer`,
  });
  return r;
}

export const GENDER_CHOICES: Choice[] = [
  { label: "Damen", patch: { gender: "female" } },
  { label: "Herren", patch: { gender: "male" } },
];
const categoryChoices = (ctx: Context): Choice[] => ctx.categoryNames.map((c) => ({ label: c, patch: { category: c } }));
type Question = Ask & { text: string; options: string[] };
const ask = (field: string, text: string, choices: Choice[]): Question =>
  ({ field, text, choices, options: choices.map((c) => c.label) });

/**
 * Rückfrage zum Eingrenzen aus den Facetten des Backends. Jede Option trägt ihren Filter,
 * damit ein Klick im Code angewendet wird und nicht erneut durch das Modell muss.
 * Bereits gesetzte Filter werden nicht nochmal gefragt; Farbe/Größe nur, wenn sie wirklich eingrenzen.
 */
export function refineOptions(r: SearchResponse, a: SearchArgs): Question | null {
  const f = r.facets;
  const genders = Object.keys(f.gender).filter((g) => g !== "unisex");
  if (!a.gender && genders.length >= 2) return ask("gender", "Für Damen oder Herren?", GENDER_CHOICES);
  const cats = Object.keys(f.category);
  if (!a.category && cats.length >= 2) return ask("category", "In welchem Bereich?", cats.slice(0, 4).map((c) => ({ label: c, patch: { category: c } })));
  const splits = (counts: Record<string, number>, withValue: number): string[] => {
    const vals = Object.entries(counts).filter(([, n]) => n <= Math.max(MAX_RESULTS, r.total * 0.6));
    return withValue >= r.total * 0.7 && vals.length >= 2 ? vals.map(([v]) => v) : [];
  };
  const colors = splits(f.color, f.withColor);
  if (!a.color && colors.length) return ask("color", "Welche Farbe?", colors.slice(0, 5).map((c) => ({ label: c, patch: { color: c } })));
  const sizes = splits(f.size, f.withSize);
  if (!a.size && sizes.length) return ask("size", "Welche Größe?", sizes.slice(0, 5).map((s) => ({ label: `Größe ${s}`, patch: { size: s } })));
  if (a.maxPriceEur === undefined) return ask("price", "Bis zu welchem Preis?", [30, 50, 100].map((n) => ({ label: `bis ${n} €`, patch: { maxPriceEur: n } })));
  return null;
}

// ---------- Suche ----------

async function handleSearch(x: Extraction, ctx: Context, steps: Step[]): Promise<Reply> {
  let a = searchArgs(x);
  if (a.category === "none") {
    const anywhere = a.query ? await apiSearch(ctx, { ...a, category: undefined }) : null;
    if (anywhere && anywhere.total > 0) {
      steps.push({ ok: true, text: "Kategorie „none“ widerlegt: das Produkt gibt es, suche in allen Kategorien" });
      a.category = undefined;
    } else {
      steps.push({ ok: false, text: "Keine passende Kategorie" });
      ctx.pending = { type: "search", params: {}, ask: { field: "category", choices: categoryChoices(ctx) } };
      return { text: "Das führen wir leider nicht. Diese Bereiche haben wir:", options: ctx.categoryNames };
    }
  } else if (a.category) steps.push({ ok: true, text: `Kategorie „${a.category}“ vorhanden` });

  let r = await runSearch(ctx, a, steps);
  if (r.total === 0 && a.category && a.query) {
    const wide = await apiSearch(ctx, { ...a, category: undefined });
    if (wide.total > 0) {
      steps.push({ ok: true, text: `In „${a.category}“ nichts, in anderen Kategorien ${wide.total} Treffer` });
      a = { ...a, category: undefined }; r = wide;
    }
  }

  if (r.total === 0) {
    for (const k of ["maxPriceEur", "minPriceEur", "size", "color", "gender"] as const) {
      if (a[k] === undefined) continue;
      const relaxed = await apiSearch(ctx, { ...a, [k]: undefined });
      if (relaxed.status === "ok") {
        steps.push({ ok: true, text: `Ohne Filter ${k}: ${relaxed.total} Treffer` });
        ctx.shown = relaxed.results.map((h) => h.id);
        ctx.pending = { type: "search", params: { ...a, [k]: undefined } };
        const what = {
          maxPriceEur: `bis ${a.maxPriceEur} €`, minPriceEur: `ab ${a.minPriceEur} €`,
          size: `in Größe ${a.size}`, color: `in ${a.color}`, gender: `für ${genderDe(a.gender ?? "")}`,
        }[k];
        return { text: `${what[0]!.toUpperCase() + what.slice(1)} gibt es das leider nicht. Ohne diese Einschränkung habe ich ${relaxed.total} gefunden:`, productIds: [...ctx.shown] };
      }
    }
    ctx.pending = null;
    return { text: `Ein passendes Produkt${a.query ? ` für „${a.query}“` : ""}${filterText(a)} gibt es in unserem Sortiment leider nicht.` };
  }

  if (r.status === "too_many") {
    const q = refineOptions(r, a);
    if (q) {
      steps.push({ ok: true, text: `Rückfrage zum Eingrenzen: ${q.field}` });
      ctx.pending = { type: "search", params: a, ask: q };
      return { text: `Dazu gibt es ${r.total} Produkte${filterText(a)}, das sind zu viele. ${q.text}`, options: q.options };
    }
    steps.push({ ok: true, text: `Alle Filter gesetzt, zeige die ersten ${r.results.length} von ${r.total}` });
    ctx.shown = r.results.map((h) => h.id);
    ctx.pending = { type: "search", params: a };
    return { text: `Hier die ersten ${r.results.length} von ${r.total} Produkten${filterText(a)}. Beschreib genauer, was du suchst, um weiter einzugrenzen.`, productIds: [...ctx.shown] };
  }

  ctx.shown = r.results.map((h) => h.id);
  ctx.pending = { type: "search", params: a };
  const n = r.total;
  return { text: `Ich habe ${n} passende${n === 1 ? "s Produkt" : " Produkte"}${filterText(a)} gefunden. Sag z. B. „Nimm Nr. 1“, um eines in den Warenkorb zu legen.`, productIds: [...ctx.shown] };
}

// ---------- Outfit ----------

async function handleOutfit(x: Extraction, ctx: Context, steps: Step[]): Promise<Reply> {
  const parts = x.products ?? [];
  if (!x.gender) {
    steps.push({ ok: true, text: "Outfit ohne Damen/Herren: Rückfrage" });
    ctx.pending = { type: "outfit", params: x, ask: { field: "gender", choices: GENDER_CHOICES } };
    return { text: `Gern stelle ich dir ein Outfit zusammen (${parts.join(", ")}). Für Damen oder Herren?`, options: ["Damen", "Herren"] };
  }
  const groups: Group[] = [];
  const used = new Set<string>();
  const notFit = new Map<string, string[]>();
  for (const part of parts) {
    let a: SearchArgs = { query: part, category: x.category, gender: x.gender, size: x.size };
    let loose = await runSearch(ctx, a, steps, `${part}: `);
    if (!loose.total && a.size) { a = { ...a, size: undefined }; loose = await runSearch(ctx, a, steps, `${part} ohne Größe: `); }
    if (!loose.total && a.category) { a = { ...a, category: undefined, size: undefined }; loose = await runSearch(ctx, a, steps, `${part} alle Kategorien: `); }
    // Nur Teile, die ALLE Begriffe abdecken ("rain pants" → keine Chino)
    const exact = loose.total ? (await apiSearch(ctx, { ...a, matchAll: true })).results : [];
    if (loose.total && !exact.length) {
      const other = (await apiSearch(ctx, { query: part, matchAll: true }, 50)).results;
      const otherG = [...new Set(other.flatMap((h) => h.genders.map(genderDe)))];
      steps.push({ ok: false, text: `${part}: ${loose.total} Treffer, aber keiner passt zu allen Begriffen${otherG.length ? ` (gibt es nur für ${otherG.join("/")})` : ""}` });
      notFit.set(part, otherG);
    }
    const top = exact.filter((h) => !used.has(h.id)).slice(0, 2);
    top.forEach((h) => used.add(h.id));
    groups.push({ label: part, ids: top.map((h) => h.id) });
  }
  ctx.shown = groups.flatMap((g) => g.ids);
  ctx.pending = null;
  const missing = groups.filter((g) => !g.ids.length).map((g) => {
    const other = notFit.get(g.label);
    return other?.length ? `${g.label} (gibt es bei uns nur für ${other.join("/")})` : g.label;
  });
  if (!ctx.shown.length) return { text: `Für dieses Outfit${filterText(x)} habe ich leider keine passenden Teile gefunden: ${missing.join(", ")}.` };
  const hint = ctx.shown.length === 1
    ? "Sag „Nimm Nr. 1“, um es in den Warenkorb zu legen."
    : `Sag z. B. „Nimm Nr. 1 und Nr. ${ctx.shown.length}“, um Teile in den Warenkorb zu legen.`;
  return {
    text: `Hier ein Vorschlag für dein Outfit${filterText(x)}.${missing.length ? ` Nicht im Sortiment: ${missing.join(", ")}.` : ""} ${hint}`,
    groups: groups.filter((g) => g.ids.length),
  };
}

// ---------- Warenkorb ----------

type HitVariant = SearchHit["variants"][number];
const available = (h: SearchHit): HitVariant[] => h.variants.filter((v) => v.priceFrom !== null && v.offerId !== null);
const variantParts = (name: string): string[] => name.split("/").map((s) => normalize(s).replace(/^eu\s*/, "").trim());

export function matchVariants(h: SearchHit, f: { size?: string; color?: string }, userText: string): HitVariant[] {
  const avail = available(h);
  const t = normalize(userText).trim();
  const exact = avail.filter((v) => normalize(v.name) === t);
  if (exact.length) return exact;
  return avail.filter((v) => {
    const parts = variantParts(v.name);
    if (f.size && !parts.includes(normalize(f.size))) return false;
    if (f.color && !parts.some((p) => colorKey(p) === f.color || p.includes(f.color!))) return false;
    return true;
  });
}

function addToCart(ctx: Context, h: SearchHit, v: HitVariant, quantity: number, steps: Step[]): string {
  const item = ctx.cart.find((c) => c.variantId === v.id);
  if (item) item.quantity += quantity;
  else ctx.cart.push({ productId: h.id, variantId: v.id, offerId: v.offerId!, name: h.name, variant: v.name, quantity, unitPrice: v.priceFrom! });
  steps.push({ ok: true, text: `In den Warenkorb: ${quantity}× ${h.name} (${v.name})` });
  return `${quantity}× ${h.name} (${v.name}, ${fmtEur(v.priceFrom!)})`;
}

/**
 * Legt die Produkte nacheinander in den Warenkorb. Braucht eines eine Varianten-Auswahl,
 * stoppt der Ablauf mit einer Rückfrage und merkt sich den Rest in ctx.pending.queue.
 */
function processCartQueue(queue: string[], filter: { size?: string; color?: string }, quantity: number,
  ctx: Context, steps: Step[], added: string[]): Reply {
  const rest = [...queue];
  while (rest.length) {
    const h = hitOf(ctx, rest.shift()!);
    steps.push({ ok: true, text: `Produkt: ${h.name}` });
    const avail = available(h);
    if (!avail.length) { steps.push({ ok: false, text: "Keine Variante lieferbar" }); added.push(`${h.name} ist derzeit nicht lieferbar`); continue; }
    const m = avail.length === 1 ? avail : matchVariants(h, filter, "");
    if (m.length === 1) { added.push(addToCart(ctx, h, m[0]!, quantity, steps)); continue; }
    ctx.pending = { type: "variant", productId: h.id, queue: rest, filter, quantity };
    const done = added.length ? `Im Warenkorb: ${added.join("; ")}.\n\n` : "";
    if (!m.length) {
      steps.push({ ok: false, text: `Keine Variante ${filter.size ?? ""} ${filter.color ?? ""}`.trim() });
      return { text: `${done}${h.name} gibt es nicht in ${[filter.size && "Größe " + filter.size, filter.color].filter(Boolean).join(" / ")}. Verfügbar sind:`, options: avail.map((v) => v.name) };
    }
    steps.push({ ok: true, text: `${m.length} passende Varianten, Rückfrage` });
    return { text: `${done}Welche Variante von ${h.name}?`, options: m.map((v) => v.name) };
  }
  ctx.pending = null;
  return { text: added.length ? `Im Warenkorb: ${added.join("; ")}.` : "Es wurde nichts in den Warenkorb gelegt." };
}

function handleCart(x: Extraction, userText: string, ctx: Context, steps: Step[]): Reply {
  const pend = ctx.pending?.type === "variant" ? ctx.pending : null;
  if (pend) {
    // Antwort auf die Varianten-Rückfrage gilt nur für dieses eine Produkt
    const h = hitOf(ctx, pend.productId);
    const m = matchVariants(h, { size: x.size ?? pend.filter.size, color: x.color ?? pend.filter.color }, userText);
    if (m.length !== 1) {
      steps.push({ ok: false, text: `Antwort passt zu ${m.length} Varianten, erneute Rückfrage` });
      return { text: `Welche Variante von ${h.name}? Bitte wähle eine:`, options: (m.length ? m : available(h)).map((v) => v.name) };
    }
    const added = [addToCart(ctx, h, m[0]!, pend.quantity, steps)];
    return processCartQueue(pend.queue, pend.filter, pend.quantity, ctx, steps, added);
  }
  const refs = x.refs?.length ? x.refs : x.ref ? [x.ref] : [];
  const ids = [...new Set(refs.map((r) => ctx.shown[r - 1]).filter((id): id is string => !!id))];
  if (!ids.length) {
    steps.push({ ok: false, text: "Unklar, welches Produkt gemeint ist" });
    return { text: "Welches Produkt meinst du?", options: ctx.shown.slice(0, 4).map((_, i) => `Nimm Nr. ${i + 1}`) };
  }
  steps.push({ ok: true, text: `Gewählt: ${refs.map((r) => "Nr. " + r).join(", ")}` });
  const r = processCartQueue(ids, { size: x.size, color: x.color }, x.quantity ?? 1, ctx, steps, []);
  if (x.missingRefs?.length) {
    const shownText = ctx.shown.length === 1 ? " nur Nr. 1" : `n Nr. 1 bis ${ctx.shown.length}`;
    r.text = `${x.missingRefs.map((n) => "Nr. " + n).join(", ")} gibt es nicht, gezeigt wurde${shownText}.\n\n${r.text}`;
  }
  return r;
}

// ---------- Erkennung im Code, ohne Modell ----------

export interface Direct { value: Extraction; notes: string[] }

const SELECTION_FILLER = new Set(["nr", "nummer", "number", "und", "and", "bitte", "die", "das", "den", "dem", "sowie",
  "plus", "auch", "ich", "mochte", "hatte", "gern", "gerne", "s", "in", "grosse", "size", "von", "beide", "beides"]);

/** "Nr. 1 und Nr. 3", "die erste und die dritte", "Men's Rain Jacket … in den Warenkorb" */
export function detectCartCommand(userText: string, ctx: Context): Direct | null {
  if (!ctx.shown.length || ctx.pending?.type === "variant") return null;
  const t = normalize(userText);
  const w = words(userText);
  const refs: number[] = [];
  const how: string[] = [];
  for (const m of t.matchAll(/(?:nr\.?|nummer|number|#)\s*(\d+)/g)) refs.push(Number(m[1]));
  for (const x of w) if (ORDINALS[x]) refs.push(ORDINALS[x]);
  if (w.some(isLastWord)) refs.push(ctx.shown.length);
  if (/^[\d\s,+&und]+$/.test(t) && /\d/.test(t)) for (const m of t.matchAll(/\d+/g)) refs.push(Number(m[0]));
  if (refs.length) how.push("Nummern");
  const tw = new Set(w);
  ctx.shown.forEach((id, i) => {
    const nameWords = words(hitOf(ctx, id).name).filter((x) => x.length > 1);
    if (nameWords.length && nameWords.every((x) => tw.has(x))) {
      refs.push(i + 1);
      if (!how.includes("Produktnamen")) how.push("Produktnamen");
    }
  });
  const uniq = [...new Set(refs)].sort((a, b) => a - b);
  const valid = uniq.filter((r) => r >= 1 && r <= ctx.shown.length);
  const invalid = uniq.filter((r) => !valid.includes(r));
  if (!valid.length) return null;

  const sizeM = t.match(/(?:\bin|grosse|size)\s+(xxl|xl|xs|s|m|l|\d{2})\b/);
  const size = sizeM ? sizeM[1]!.toUpperCase() : undefined;
  const color = Object.keys(COLOR_WORDS).find((k) => COLOR_WORDS[k]!.some((c) => tw.has(c)));
  // Reine Auswahl ("Nr. 1 und Nr. 3") gilt auch ohne Kauf-Wort als Warenkorb-Wunsch
  const leftover = w.filter((x) => !SELECTION_FILLER.has(x) && !ORDINALS[x] && !/^\d+$/.test(x) && x !== (size ?? "").toLowerCase()
    && !(color ? COLOR_WORDS[color]! : []).includes(x) && !isLastWord(x));
  const nameOnly = how.length === 1 && how[0] === "Produktnamen";
  if (!CART_SIGNAL.test(t) && (nameOnly || leftover.length)) return null;

  const x: Extraction = { intent: "add_to_cart", refs: valid };
  if (invalid.length) x.missingRefs = invalid;
  if (size) x.size = size;
  if (color) x.color = color;
  const notes = [`Im Code erkannt (${how.join(" + ")}): ${valid.map((r) => "Nr. " + r).join(", ")}`];
  if (invalid.length) notes.push(`${invalid.map((r) => "Nr. " + r).join(", ")} ignoriert: nur ${ctx.shown.length} Produkt(e) gezeigt`);
  return { value: x, notes };
}

/** Klick auf eine Variante ("S / Black") während einer Varianten-Rückfrage */
export function detectVariantAnswer(userText: string, ctx: Context): Direct | null {
  if (ctx.pending?.type !== "variant") return null;
  const h = hitOf(ctx, ctx.pending.productId);
  const t = normalize(userText).trim();
  if (!h.variants.some((v) => normalize(v.name) === t)) return null;
  return { value: { intent: "add_to_cart" }, notes: ["Im Code erkannt: Variante gewählt"] };
}

/** Klick auf eine Antwort-Option einer Rückfrage (oder genau deren Text getippt) */
export function detectOptionAnswer(userText: string, ctx: Context): Direct | null {
  const pend = ctx.pending;
  if (!pend || pend.type === "variant" || !pend.ask) return null;
  const t = normalize(userText).trim();
  const c = pend.ask.choices.find((ch) => normalize(ch.label).trim() === t);
  if (!c) return null;
  const patch = c.patch as Partial<Extraction>;
  return {
    value: { intent: pend.type === "outfit" ? "outfit" : "search", ...patch },
    notes: [`Im Code erkannt: Antwort auf Rückfrage (${Object.entries(c.patch).map(([k, v]) => `${k} = ${String(v)}`).join(", ")})`],
  };
}

export function detectDirect(userText: string, ctx: Context): Direct | null {
  return detectVariantAnswer(userText, ctx) ?? detectOptionAnswer(userText, ctx) ?? detectCartCommand(userText, ctx);
}

// ---------- Zusammenführen und Ablauf ----------

const REFINEMENTS = ["gender", "size", "color", "maxPriceEur", "minPriceEur", "category"] as const;

/** Kombiniert Antworten auf Rückfragen ("Damen", "Größe M") mit der offenen Anfrage */
function mergePending(x: Extraction, ctx: Context, notes: string[]): Extraction {
  const pend = ctx.pending;
  if (!pend) return x;
  if (pend.type === "variant") {
    if (x.intent !== "off_topic" && !x.product) { notes.push("Antwort auf Varianten-Rückfrage"); return { ...x, intent: "add_to_cart" }; }
    return x;
  }
  const refinements = REFINEMENTS.filter((k) => k in x);
  if (["search", "unclear", "outfit"].includes(x.intent) && !x.product && !x.products && refinements.length) {
    notes.push(`mit offener Anfrage kombiniert (${refinements.join(", ")})`);
    const patch = Object.fromEntries(refinements.map((k) => [k, x[k]])) as Partial<Extraction>;
    if (pend.type === "outfit") return { ...pend.params, ...patch, intent: "outfit" };
    const p = pend.params;
    const base: Extraction = {
      intent: "search", product: p.query, category: p.category, gender: p.gender as Extraction["gender"],
      size: p.size, color: p.color, maxPriceEur: p.maxPriceEur, minPriceEur: p.minPriceEur,
    };
    return { ...base, ...patch };
  }
  return x;
}

const clean = (x: Extraction): Extraction =>
  Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined)) as unknown as Extraction;

export async function runExtractFlow(verified: Extraction, userText: string, ctx: Context, notes: string[]): Promise<FlowResult> {
  const steps: Step[] = [];
  const x = clean(mergePending(verified, ctx, notes));
  if (x.gender) ctx.prefs.gender = x.gender;   // geklärt ist geklärt
  let reply: Reply;
  switch (x.intent) {
    case "off_topic":
      reply = { text: "Dabei kann ich nicht helfen. Ich unterstütze dich bei der Produktsuche und beim Warenkorb. Wonach suchst du?" };
      break;
    case "unclear":
      steps.push({ ok: false, text: "Keine Produktart erkannt: Rückfrage" });
      ctx.pending = { type: "search", params: {}, ask: { field: "category", choices: categoryChoices(ctx) } };
      reply = { text: "Was genau suchst du? Wähle einen Bereich oder beschreibe das Produkt.", options: ctx.categoryNames.slice(0, 6) };
      break;
    case "add_to_cart":
      reply = handleCart(x, userText, ctx, steps);
      break;
    case "outfit":
      reply = await handleOutfit(x, ctx, steps);
      break;
    default:
      if (!x.product && !x.category) {
        steps.push({ ok: false, text: "Weder Produkt noch Kategorie erkannt: Rückfrage" });
        ctx.pending = { type: "search", params: {}, ask: { field: "category", choices: categoryChoices(ctx) } };
        reply = { text: "Was genau suchst du?", options: ctx.categoryNames.slice(0, 6) };
      } else reply = await handleSearch(x, ctx, steps);
  }
  return { steps, reply, effective: x };
}
