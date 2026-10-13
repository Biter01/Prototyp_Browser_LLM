// Gesprächszustand im Code. Das Modell sieht davon nur die Liste "Zuletzt gezeigt".
import type { Category, SearchHit } from "./api.ts";
import { ShopApi } from "./api.ts";
import type { Extraction } from "./prompt.ts";
import type { Gender } from "./text.ts";

export const MAX_RESULTS = 8;

export interface CartItem {
  productId: string;
  variantId: string;
  /** günstigstes lieferbares Angebot dieser Variante (für POST /validate) */
  offerId: string;
  name: string;
  variant: string;
  quantity: number;
  unitPrice: number;   // Cent
}

/** Suchparameter im Frontend (Preise in Euro, Kategorie als Name) */
export interface SearchArgs {
  query?: string;
  category?: string;
  gender?: string;
  size?: string;
  color?: string;
  maxPriceEur?: number;
  minPriceEur?: number;
  matchAll?: boolean;
}

/** Eine Antwortmöglichkeit auf eine Rückfrage: Klick → dieser Filter wird direkt angewendet */
export interface Choice { label: string; patch: Partial<SearchArgs> & { gender?: Gender } }

export interface Ask { field: string; text?: string; choices: Choice[] }

export type Pending =
  | { type: "search"; params: SearchArgs; ask?: Ask }
  | { type: "outfit"; params: Extraction; ask?: Ask }
  | { type: "variant"; productId: string; queue: string[]; filter: { size?: string; color?: string }; quantity: number };

export interface Context {
  api: ShopApi;
  categories: Category[];
  categoryNames: string[];
  /** zuletzt gezeigte Produkte (IDs), Nr. 1 = shown[0] */
  shown: string[];
  cart: CartItem[];
  pending: Pending | null;
  /** im Gespräch geklärte Angaben, z. B. { gender: "male" } */
  prefs: { gender?: Gender };
}

export async function newContext(api: ShopApi): Promise<Context> {
  const categories = await api.categories();
  return { api, categories, categoryNames: categories.map((c) => c.name), shown: [], cart: [], pending: null, prefs: {} };
}

export function resetContext(ctx: Context): void {
  Object.assign(ctx, { shown: [], cart: [], pending: null, prefs: {} });
}

export const hitOf = (ctx: Context, id: string): SearchHit => {
  const h = ctx.api.hit(id);
  if (!h) throw new Error(`Produkt ${id} ist nicht im Zwischenspeicher`);
  return h;
};

export const shownNames = (ctx: Context): string[] => ctx.shown.map((id) => ctx.api.hit(id)?.name ?? id);
