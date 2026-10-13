export interface Category {
  id: string;
  name: string;
  description: string;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  brand?: string;
  tags: string[];
  attributes: Record<string, string | number | boolean>;
  variants: Variant[];
}

export interface Variant {
  id: string;
  sku: string;
  name: string;
  attributes: Record<string, string | number | boolean>;
  offers: Offer[];
}

export type StockLevel = "NO" | "LITTLE" | "ALOT";

export interface Offer {
  id: string;
  vendorId: string;
  warehouseId: string;
  price: number;
  currency: "EUR";
  /** per item, cents; 0 means free shipping */
  shippingCost: number;
  freeShippingThreshold?: number;
  deliveryDays: { min: number; max: number };
  stock: StockLevel;
}

export interface Vendor {
  id: string;
  name: string;
  rating: number;
}

export interface Warehouse {
  id: string;
  name: string;
  country: string;
  /** per-shipment tax in cents (e.g. €3 Paketsteuer for Austrian warehouses) */
  packageTax?: number;
}

export interface Voucher {
  code: string;
  type: "percent" | "fixed";
  value: number;
  minOrderValue?: number;
  validUntil?: string;
  categoryId?: string;
  description: string;
}

export interface Dataset {
  categories: Category[];
  products: Product[];
  vendors: Vendor[];
  warehouses: Warehouse[];
  vouchers: Voucher[];
}

export interface ValidateRequest {
  items: { offerId: string; quantity: number }[];
  voucherCode?: string;
}

export type CartIssueCode =
  | "OFFER_NOT_FOUND"
  | "INVALID_QUANTITY"
  | "OUT_OF_STOCK"
  | "VOUCHER_NOT_FOUND"
  | "VOUCHER_EXPIRED"
  | "VOUCHER_MIN_ORDER_NOT_MET";

export interface CartIssue {
  code: CartIssueCode;
  message: string;
  offerId?: string;
}

export interface ShipmentItem {
  offerId: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Shipment {
  vendorId: string;
  warehouseId: string;
  items: ShipmentItem[];
  itemsSubtotal: number;
  shippingCost: number;
  /** flat per-shipment tax for this shipment's warehouse (e.g. €3 Paketsteuer) */
  packageTax: number;
  deliveryDays: { min: number; max: number };
}

export interface Totals {
  items: number;
  /** sum over shipments of (shippingCost + packageTax) */
  shipping: number;
  discount: number;
  grand: number;
}

export interface ValidateResponse {
  valid: boolean;
  issues: CartIssue[];
  shipments: Shipment[];
  totals: Totals;
  deliveryDays: { min: number; max: number } | null;
  packageCount: number;
}

// ---------- Ähnlichkeitssuche (GET /search) ----------

export interface SearchQuery {
  /** Suchbegriffe, deutsch oder englisch, Tippfehler werden toleriert */
  q?: string;
  /** Kategorie-ID oder Kategoriename */
  category?: string;
  gender?: string;
  color?: string;
  size?: string;
  /** Preisgrenzen in Cent (wie bei GET /products) */
  minPrice?: number;
  maxPrice?: number;
  /** nur Produkte, die ALLE Suchbegriffe abdecken */
  matchAll?: boolean;
  /** maximale Anzahl Ergebnisse, Standard 8 */
  limit?: number;
}

export interface SearchHitVariant {
  id: string;
  name: string;
  /** günstigstes lieferbares Angebot in Cent, null = nicht lieferbar */
  priceFrom: number | null;
  /** ID dieses Angebots (für den Warenkorb bzw. POST /validate) */
  offerId: string | null;
}

export interface SearchHit {
  id: string;
  name: string;
  brand?: string;
  categoryId: string;
  categoryName: string;
  priceFrom: number | null;
  colors: string[];
  sizes: string[];
  genders: string[];
  score: number;
  variants: SearchHitVariant[];
}

export interface SearchFacets {
  category: Record<string, number>;
  color: Record<string, number>;
  size: Record<string, number>;
  gender: Record<string, number>;
  /** wie viele Treffer überhaupt eine Farbe bzw. Größe haben */
  withColor: number;
  withSize: number;
}

export interface SearchResponse {
  /** ok: 1..limit Treffer · too_many: mehr als limit · not_found: keine */
  status: "ok" | "too_many" | "not_found";
  total: number;
  limit: number;
  results: SearchHit[];
  facets: SearchFacets;
}
