// JSON-Schema und System-Prompt für die Erkennung. Das Modell beantwortet die Nachricht nicht,
// es liefert nur ein JSON-Objekt; den Ablauf steuert der Code.
import type { Category } from "./api.ts";

export const INTENTS = ["search", "add_to_cart", "outfit", "unclear", "off_topic"] as const;
export type Intent = (typeof INTENTS)[number];

/** Was das Modell liefert (alle Felder außer intent optional) */
export interface Extraction {
  intent: Intent;
  product?: string;
  products?: string[];
  category?: string;            // Kategoriename oder "none"
  gender?: "male" | "female";
  size?: string;
  color?: string;
  maxPriceEur?: number;
  minPriceEur?: number;
  ref?: number;
  /** nur vom Code gesetzt: mehrere Nummern ("Nr. 1 und Nr. 3") */
  refs?: number[];
  missingRefs?: number[];
  quantity?: number;
}

export interface JsonSchema {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required: string[];
}

export function makeExtractSchema(categoryNames: string[]): JsonSchema {
  return {
    type: "object",
    properties: {
      intent: { enum: [...INTENTS] },
      product: { type: "string" },
      products: { type: "array", items: { type: "string" } },
      category: { enum: [...categoryNames, "none"] },
      gender: { enum: ["male", "female"] },
      size: { type: "string" },
      color: { type: "string" },
      maxPriceEur: { type: "number" },
      minPriceEur: { type: "number" },
      ref: { type: "integer" },
      quantity: { type: "integer" },
    },
    required: ["intent"],
  };
}

export function buildExtractPrompt(categories: Category[], shownNames: string[]): string {
  const cats = categories.map((c) => `- ${c.name}: ${c.description}`).join("\n");
  const shown = shownNames.length ? shownNames.map((n, i) => `${i + 1}: ${n}`).join("\n") : "keine";
  return `Du analysierst Nachrichten an den JKU-Webshop. Du beantwortest die Nachricht NICHT, sondern gibst GENAU EIN JSON-Objekt zurück.

Felder:
- intent: "search" (ein Produkt suchen), "add_to_cart" (ein gezeigtes Produkt nehmen/kaufen), "outfit" (mehrere Teile zusammenstellen), "unclear" (keine Produktart erkennbar), "off_topic" (hat nichts mit Einkaufen zu tun)
- product: gesuchte Produktart auf ENGLISCH, 1–4 Wörter, Tippfehler korrigiert, z. B. "rain jacket"
- products: nur bei outfit, die Teile auf Englisch, z. B. ["rain jacket","rain pants"]
- category: eine der Kategorien unten, oder "none", wenn keine passt
- gender: "male" oder "female"
- size: Größe, z. B. "M", "XL", "42"
- color: Farbe auf Englisch, z. B. "black"
- maxPriceEur / minPriceEur: Preisgrenze als Zahl
- ref: Nummer des gemeinten Produkts aus "Zuletzt gezeigt" (1 = erstes)
- quantity: Anzahl
WICHTIG: Setze gender, size, color, Preise, ref und quantity NUR, wenn sie in der Nachricht stehen. Sonst weglassen.

Kategorien:
${cats}

Zuletzt gezeigt:
${shown}

Beispiele:
"I brauch a Regnjacke für Herren in M unter 150 €"
{"intent":"search","product":"rain jacket","category":"Campus Clothing","gender":"male","size":"M","maxPriceEur":150}
"kopfhörer"
{"intent":"search","product":"headphones","category":"Electronics & Gadgets"}
"Ich will ein Regen-Outfit"
{"intent":"outfit","products":["rain jacket","rain pants"],"category":"Campus Clothing"}
"Nimm die zweite in L"
{"intent":"add_to_cart","ref":2,"size":"L"}
"Ich suche einen Kühlschrank"
{"intent":"search","product":"fridge","category":"none"}
"Ich suche ein Geschenk"
{"intent":"unclear"}
"Wie wird das Wetter morgen?"
{"intent":"off_topic"}`;
}

// ---------- Modellausgabe lesen ----------

export type Parsed = { ok: true; value: unknown; extracted?: boolean } | { ok: false; error: string };

export function parseModelOutput(raw: string): Parsed {
  const text = String(raw ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  try { return { ok: true, value: JSON.parse(text) }; } catch { /* weiter unten */ }
  const m = text.match(/\{[\s\S]*\}/);                 // freier Modus: erstes {...} herausziehen
  if (m) { try { return { ok: true, value: JSON.parse(m[0]), extracted: true }; } catch { /* kein JSON */ } }
  return { ok: false, error: "Ausgabe ist kein gültiges JSON" };
}

/** Leichte Schema-Prüfung im Code (auch wenn das Modell ohne Zwang antwortet) */
export function checkSchema(obj: unknown, schema: JsonSchema): string[] {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return ["Kein JSON-Objekt"];
  const errs: string[] = [];
  const o = obj as Record<string, unknown>;
  for (const r of schema.required) if (!(r in o)) errs.push(`Pflichtfeld fehlt: ${r}`);
  for (const [k, v] of Object.entries(o)) {
    const s = schema.properties[k];
    if (!s) { errs.push(`Unbekanntes Feld: ${k}`); continue; }
    if (Array.isArray(s.enum) && !s.enum.includes(v)) errs.push(`${k}: ungültiger Wert „${String(v)}“`);
    if (s.type === "string" && typeof v !== "string") errs.push(`${k}: kein Text`);
    if (s.type === "number" && typeof v !== "number") errs.push(`${k}: keine Zahl`);
    if (s.type === "integer" && !Number.isInteger(v)) errs.push(`${k}: keine Ganzzahl`);
    if (s.type === "array" && !Array.isArray(v)) errs.push(`${k}: keine Liste`);
  }
  return errs;
}
