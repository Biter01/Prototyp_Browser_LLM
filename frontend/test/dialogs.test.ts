// Ganze Gespräche Ende-zu-Ende: Modellantworten wie in echten Protokollen mit Qwen2.5-3B,
// Suche über die echte Backend-Logik. Prüft, dass der Code den Kontext hält.
import { describe, it, expect } from "vitest";
import { DIALOG_CASES, runDialogCase } from "../src/cases.ts";
import { newContext } from "../src/context.ts";
import { extractStep } from "../src/turn.ts";
import { offlineApi, ScriptedModel } from "./helpers.ts";

// Was das Modell auf die jeweiligen Sätze tatsächlich geantwortet hat (bzw. typisch antwortet)
const ANSWERS: Record<string, object> = {
  "Ich suche JKU Merchandise": { intent: "search", category: "JKU Merchandise & Apparel" },
  "Black/Green": { intent: "search", product: "black/green", category: "none" },
  "Zeig mir JKU Merch": { intent: "unclear" },
  "schwarz": { intent: "search", product: "black", category: "none" },
  "Ich will ein Regen-Outfit für die JKU": { intent: "outfit", products: ["rain jacket", "rain pants"], category: "Campus Clothing" },
  "Bitte stelle mir ein Regen Outfit zusammen": { intent: "outfit", products: ["rain jacket", "rain pants"], category: "Campus Clothing" },
  "Herren": { intent: "search", gender: "male" },
  "Regenjacke für Herren": { intent: "search", product: "rain jacket", category: "Campus Clothing", gender: "male" },
  "Zeig mir Hosen": { intent: "search", product: "pants", category: "Campus Clothing" },
  "Hosen für Herren": { intent: "search", product: "pants", category: "Campus Clothing", gender: "male" },
  "Was habt ihr an Kleidung": { intent: "unclear" },
  "JKU Merchandise & Apparel": { intent: "search", category: "JKU Merchandise & Apparel" },
};

describe("Dialog-Tests aus dem Testlauf", () => {
  for (const tc of DIALOG_CASES) {
    it(tc.title, async () => {
      const r = await runDialogCase(tc, offlineApi(), new ScriptedModel(ANSWERS), "schema");
      const failed = r.checks.filter((c) => !c.pass).map((c) => `${c.name}: ${c.detail}`);
      expect(failed).toEqual([]);
    });
  }
});

describe("Gesprächsverläufe aus den Fehlerprotokollen", () => {
  it("Regen-Outfit: Auswahl per Nummer fragt nicht erneut nach Damen/Herren", async () => {
    const api = offlineApi();
    const model = new ScriptedModel(ANSWERS);
    const ctx = await newContext(api);
    await extractStep("Bitte stelle mir ein Regen Outfit zusammen", ctx, model, "schema");
    const outfit = await extractStep("Herren", ctx, model, "schema");
    expect(outfit.result?.reply.text).toContain("Nicht im Sortiment: rain pants");
    const pick = await extractStep("NR. 1 und Nr.3", ctx, model, "schema");
    expect(pick.step.byCode).toBe(true);
    expect(pick.result?.reply.text).not.toContain("Damen oder Herren");
    expect(pick.result?.reply.options).toEqual(["S / Black", "S / White", "XL / White"]);
    await extractStep("S / White", ctx, model, "schema");
    expect(ctx.cart.map((c) => `${c.name} (${c.variant})`)).toEqual(["Men's Rain Jacket Campus Edition (S / White)"]);
    // Nur der erste Satz geht ans Modell; "Herren", "NR. 1 und Nr.3" und "S / White" erkennt der Code
    expect(model.calls).toEqual(["Bitte stelle mir ein Regen Outfit zusammen"]);
  });

  it("Kategorie geht beim dritten Schritt nicht verloren", async () => {
    const api = offlineApi();
    const model = new ScriptedModel(ANSWERS);
    const ctx = await newContext(api);
    const first = await extractStep("Was habt ihr an Kleidung", ctx, model, "schema");
    expect(first.result?.effective.category).toBe("Campus Clothing");
    const ctx2 = await newContext(api);
    await extractStep("JKU Merchandise & Apparel", ctx2, model, "schema");
    const color = await extractStep("Black/Green", ctx2, model, "schema");
    expect(color.step.byCode).toBe(true);
    expect(color.result?.effective).toMatchObject({ category: "JKU Merchandise & Apparel", color: "Black/Green" });
    expect(ctx2.shown.map((id) => api.hit(id)?.name)).toEqual(["JKU Lanyard", "JKU Scarf"]);
  });
});
