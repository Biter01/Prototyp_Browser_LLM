// Testhilfen: ShopApi ohne laufenden Server (ruft die Suchlogik des Backends direkt auf)
// und ein Modell, das vorgegebene Antworten liefert.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ShopApi } from "../src/api.ts";
import type { Completion, Model } from "../src/model.ts";
import { searchProducts } from "../../backend/src/search.ts";
import type { Dataset, SearchQuery } from "../../backend/src/types.ts";

const datasetPath = fileURLToPath(new URL("../../backend/data/dataset.json", import.meta.url));
export const dataset = JSON.parse(readFileSync(datasetPath, "utf-8")) as Dataset;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Bildet GET /categories und GET /search nach, wie sie das Backend liefert */
export function offlineApi(): ShopApi {
  return new ShopApi("", async (url) => {
    const u = new URL(url, "http://test");
    if (u.pathname === "/categories") return json(dataset.categories);
    if (u.pathname === "/search") {
      const p = u.searchParams;
      const num = (k: string): number | undefined => (p.has(k) ? Number(p.get(k)) : undefined);
      const q: SearchQuery = {
        q: p.get("q") ?? undefined, category: p.get("category") ?? undefined, gender: p.get("gender") ?? undefined,
        color: p.get("color") ?? undefined, size: p.get("size") ?? undefined,
        minPrice: num("minPrice"), maxPrice: num("maxPrice"), limit: num("limit"), matchAll: p.get("matchAll") === "true",
      };
      return json(searchProducts(dataset, q));
    }
    return json({ message: "Not Found" }, 404);
  });
}

/** Modell, das je Nutzertext eine feste JSON-Antwort gibt (so wie Qwen sie geliefert hat) */
export class ScriptedModel implements Model {
  readonly id = "scripted";
  readonly calls: string[] = [];
  private readonly answers: Record<string, object>;
  constructor(answers: Record<string, object>) { this.answers = answers; }
  async complete(messages: { role: string; content: string }[]): Promise<Completion> {
    const user = messages[messages.length - 1]!.content;
    this.calls.push(user);
    const a = this.answers[user];
    if (!a) throw new Error(`Keine Modellantwort für „${user}“ hinterlegt`);
    return { raw: JSON.stringify(a), ms: 0 };
  }
}
