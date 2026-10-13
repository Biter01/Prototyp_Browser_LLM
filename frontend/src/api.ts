// Zugriff auf das Backend. Typen kommen direkt aus backend/src/types.ts (eine Quelle der Wahrheit).
import type { Category, SearchHit, SearchQuery, SearchResponse } from "../../backend/src/types.ts";

export type { Category, SearchHit, SearchQuery, SearchResponse };

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class ShopApi {
  /** Alle bisher gesehenen Treffer, für Produktkarten und Warenkorb */
  readonly hits = new Map<string, SearchHit>();
  private categoriesCache: Category[] | null = null;
  private readonly baseUrl: string;
  private readonly fetchFn: FetchFn;

  /**
   * @param baseUrl im Browser "/api" (Vite leitet an das Backend weiter)
   * @param fetchFn austauschbar, z. B. für Tests ohne laufenden Server
   */
  constructor(baseUrl = "/api", fetchFn: FetchFn = (u, i) => fetch(u, i)) {
    this.baseUrl = baseUrl;
    this.fetchFn = fetchFn;
  }

  private async get<T>(path: string): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}${path}`);
    } catch {
      throw new ApiError(0, "Backend nicht erreichbar. Läuft es? (pnpm dev im Projektordner)");
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { message?: string };
      throw new ApiError(res.status, body.message ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  async categories(): Promise<Category[]> {
    this.categoriesCache ??= await this.get<Category[]>("/categories");
    return this.categoriesCache;
  }

  async search(q: SearchQuery): Promise<SearchResponse> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
    const res = await this.get<SearchResponse>(`/search?${params}`);
    for (const h of res.results) this.hits.set(h.id, h);
    return res;
  }

  hit(id: string): SearchHit | undefined {
    return this.hits.get(id);
  }
}
