// Oberfläche: Chat, Warenkorb und Testlauf.
import "./style.css";
import { ApiError, ShopApi } from "./api.ts";
import { ALL_CASES, runCase, type CaseResult } from "./cases.ts";
import { newContext, resetContext, type Context } from "./context.ts";
import type { FlowResult, Reply } from "./flow.ts";
import { DEFAULT_MODEL, MODELS, WebLlmModel, checkWebGpu, type JsonMode } from "./model.ts";
import { fmtEur } from "./text.ts";
import { extractStep, type StepInfo } from "./turn.ts";
import type { Verified } from "./verify.ts";

// ---------- DOM-Hilfen ----------

const $ = <T extends HTMLElement = HTMLElement>(s: string): T => {
  const n = document.querySelector<T>(s);
  if (!n) throw new Error(`Element ${s} fehlt`);
  return n;
};

type Kid = Node | string | number | null | undefined | false | Kid[];
function el(tag: string, attrs: Record<string, string | boolean | ((e: Event) => void) | undefined> = {}, ...kids: Kid[]): HTMLElement {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class" && typeof v === "string") n.className = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== false && typeof v !== "function") n.setAttribute(k, v === true ? "" : v);
  }
  const add = (k: Kid): void => {
    if (Array.isArray(k)) k.forEach(add);
    else if (k !== null && k !== undefined && k !== false) n.append(k instanceof Node ? k : String(k));
  };
  kids.forEach(add);
  return n;
}
const pretty = (o: unknown): string => JSON.stringify(o, null, 2);

// ---------- Zustand ----------

const api = new ShopApi("/api");
const model = new WebLlmModel();
let ctx: Context | null = null;
let busy = false;
const mode = (): JsonMode => $<HTMLSelectElement>("#mode").value as JsonMode;

function setStatus(text: string, kind: "" | "ok" | "error" = ""): void {
  const s = $("#status");
  s.textContent = text;
  s.dataset.kind = kind;
}

const errorText = (e: unknown): string => (e instanceof ApiError || e instanceof Error ? e.message : String(e));

// ---------- Modell laden ----------

async function loadModel(): Promise<void> {
  const id = $<HTMLSelectElement>("#model").value;
  const gpuProblem = await checkWebGpu();
  if (gpuProblem) { setStatus(gpuProblem, "error"); return; }
  $<HTMLButtonElement>("#load").disabled = true;
  try {
    await model.load(id, (p, text) => { $<HTMLProgressElement>("#progress").value = p; setStatus(text); });
    $<HTMLProgressElement>("#progress").value = 1;
    setStatus(`Bereit: ${id}`, "ok");
    document.body.dataset.ready = "1";
  } catch (e) {
    console.error(e);
    setStatus(`Fehler beim Laden: ${errorText(e)}`, "error");
  } finally { $<HTMLButtonElement>("#load").disabled = false; }
}

// ---------- Chat ----------

const log = (): HTMLElement => $("#log");
const scroll = (): void => { const l = log(); l.scrollTop = l.scrollHeight; };
const renderUser = (text: string): void => { log().append(el("div", { class: "msg user" }, text)); scroll(); };
const renderSystem = (text: string): void => { log().append(el("div", { class: "msg system" }, text)); scroll(); };

async function runTurn(userText: string): Promise<void> {
  if (!model.ready || busy) return;
  busy = true; $<HTMLButtonElement>("#send").disabled = true;
  renderUser(userText);
  const card = el("div", { class: "round pending" }, el("div", { class: "round-head" }, "Erkennung", el("span", { class: "spin" }, " · Modell denkt …")));
  log().append(card); scroll();
  try {
    ctx ??= await newContext(api);
    const { step, verified, result } = await extractStep(userText, ctx, model, mode());
    renderStepCard(card, step, verified, result);
    renderReply(result?.reply ?? { text: "Das habe ich leider nicht verstanden. Kannst du es anders formulieren?" });
    renderCart();
  } catch (e) {
    console.error(e);
    card.remove();
    renderSystem(`Fehler: ${errorText(e)}`);
  } finally {
    busy = false; $<HTMLButtonElement>("#send").disabled = false; $("#input").focus();
  }
}

function renderStepCard(card: HTMLElement, step: StepInfo, verified: Verified | null, result: FlowResult | null): void {
  const stats = [`${(step.ms / 1000).toFixed(1)} s`];
  if (step.usage?.completion_tokens) stats.push(`${step.usage.completion_tokens} Tokens`);
  const tps = step.usage?.extra?.decode_tokens_per_s;
  if (tps) stats.push(`${tps.toFixed(0)} Tokens/s`);
  const ok = step.parsed.ok && !step.schemaErrors.length;
  card.className = `round ${ok && (step.byCode || !verified?.notes.length) ? "ok" : "warn"}`;
  card.replaceChildren(...el("div", {},
    el("div", { class: "round-head" },
      step.byCode ? "1 · Erkennung im Code (ohne Modell)" : "1 · Erkennung durch das Modell",
      el("span", { class: "stats" }, step.byCode ? "0 Tokens" : stats.join(" · "))),
    el("pre", { class: "json" }, step.parsed.ok ? pretty(step.parsed.value) : step.raw || "(leer)"),
    !step.parsed.ok && el("div", { class: "round-line" }, "⚠ Kein gültiges JSON"),
    step.schemaErrors.length > 0 && el("div", { class: "round-line" }, `⚠ Schema: ${step.schemaErrors.join("; ")}`),
    verified && el("div", { class: "round-head sub" }, "2 · Prüfung im Code"),
    verified && (verified.notes.length
      ? el("ul", { class: "steps" }, verified.notes.map((n) => el("li", { class: "fix" }, n)))
      : el("div", { class: "round-line pass" }, "✓ Alle Werte passen zum Text")),
    result && el("div", { class: "round-head sub" }, "3 · Ablauf im Code"),
    result && result.steps.length > 0 && el("ul", { class: "steps" },
      result.steps.map((s) => el("li", { class: s.ok ? "" : "warnline" }, `${s.ok ? "✓" : "⚠"} ${s.text}`))),
    el("details", {},
      el("summary", {}, "Details"),
      !step.byCode && el("p", { class: "label" }, "Rohausgabe des Modells"),
      !step.byCode && el("pre", {}, step.raw || "(leer)"),
      result && el("p", { class: "label" }, "Nach Prüfung verwendet"),
      result && el("pre", {}, pretty(result.effective)),
    ),
  ).childNodes);
  scroll();
}

function productCard(id: string, nr: number | null): HTMLElement | null {
  const h = api.hit(id);
  if (!h) return null;
  return el("div", { class: "card" },
    nr && el("div", { class: "card-nr" }, `Nr. ${nr}`),
    el("div", { class: "card-name" }, h.name),
    el("div", { class: "card-meta" }, `${h.categoryName}${h.brand ? " · " + h.brand : ""}`),
    el("div", { class: "card-price" }, h.priceFrom !== null ? `ab ${fmtEur(h.priceFrom)}` : "nicht lieferbar"),
  );
}

function renderReply(r: Reply): void {
  const box = el("div", { class: "msg bot" }, r.text);
  const nr = (id: string): number | null => (ctx ? ctx.shown.indexOf(id) + 1 || null : null);
  for (const g of r.groups ?? []) {
    box.append(el("div", { class: "group-label" }, g.label));
    box.append(el("div", { class: "cards" }, g.ids.map((id) => productCard(id, nr(id)))));
  }
  if (r.productIds?.length) box.append(el("div", { class: "cards" }, r.productIds.map((id) => productCard(id, nr(id)))));
  if (r.options?.length) box.append(el("div", { class: "options" }, r.options.map((o) => el("button", { class: "chip", onclick: () => send(o) }, o))));
  log().append(box); scroll();
}

function renderCart(): void {
  const c = $("#cart");
  const cart = ctx?.cart ?? [];
  if (!cart.length) { c.replaceChildren(el("p", { class: "muted" }, "Leer")); return; }
  const sum = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  c.replaceChildren(
    ...cart.map((i) => el("div", { class: "cart-item" }, el("span", {}, `${i.quantity}× ${i.name}`), el("span", { class: "muted" }, i.variant))),
    el("div", { class: "cart-sum" }, `Zwischensumme ${fmtEur(sum)} (ohne Versand)`),
  );
}

function send(text?: string): void {
  const input = $<HTMLInputElement>("#input");
  const t = (text ?? input.value).trim();
  if (!t) return;
  if (!model.ready) { setStatus("Bitte zuerst ein Modell laden.", "error"); return; }
  input.value = "";
  void runTurn(t);
}

function resetChat(): void {
  if (ctx) resetContext(ctx);
  log().replaceChildren();
  renderCart();
}

// ---------- Testlauf ----------

let testResults: (CaseResult | undefined)[] = [];

function renderTestTable(): void {
  $("#tests thead").replaceChildren(el("tr", {}, ["#", "Eingabe", "Erwartet", "Roh / nach Prüfung", "Zeit", "Ausgabe und Prüfungen"].map((h) => el("th", {}, h))));
  const mark = (pass: boolean): HTMLElement => el("span", { class: pass ? "pass" : "fail" }, pass ? "✓" : "✗");
  const rows = ALL_CASES.map((tc, i) => {
    const r = testResults[i];
    const status = !r ? el("span", { class: "muted" }, "–") : r.dialog ? mark(r.pass) : el("span", {}, mark(r.pass), " / ", mark(r.verifiedPass));
    const detail = r ? el("details", {},
      el("summary", {}, r.dialog ? String(r.parsed.ok ? r.parsed.value : "") : r.parsed.ok ? JSON.stringify(r.parsed.value) : "(kein JSON)"),
      el("ul", { class: "checks" }, r.checks.map((c) => el("li", { class: c.pass ? "pass" : "fail" }, `${c.pass ? "✓" : "✗"} ${c.name}${c.detail ? ": " + c.detail : ""}`))),
      r.verifyNotes?.length && el("p", { class: "label" }, "Code-Prüfung"),
      r.verifyNotes?.length && el("ul", { class: "checks" }, r.verifyNotes.map((n) => el("li", { class: "fix" }, n))),
      r.verifiedFailed?.length && el("p", { class: "note warn" }, `Nach Prüfung noch falsch: ${r.verifiedFailed.map((c) => c.name).join(", ")}`),
      el("p", { class: "label" }, r.dialog ? "Verlauf" : "Rohausgabe"), el("pre", {}, r.raw || "(leer)"),
    ) : el("span", { class: "muted" }, "noch nicht getestet");
    return el("tr", {},
      el("td", {}, String(i + 1)),
      el("td", {},
        tc.kind === "dialog" && el("div", { class: "small", style: "font-weight:600" }, tc.title),
        tc.input,
        tc.kind === "sentence" && tc.preset && el("div", { class: "muted small" }, `vorher gezeigt: Suche „${tc.preset}“`)),
      el("td", {}, tc.kind === "dialog" ? "Dialog" : tc.expect.intent.join(" / ")),
      el("td", { class: "center" }, status),
      el("td", { class: "num" }, r ? `${(r.ms / 1000).toFixed(1)} s` : ""),
      el("td", {}, detail),
    );
  });
  $("#tests tbody").replaceChildren(...rows);
  renderTestSummary();
}

function renderTestSummary(): void {
  const done = testResults.filter((r): r is CaseResult => !!r);
  if (!done.length) { $("#summary").replaceChildren(); return; }
  const single = done.filter((r) => !r.dialog);
  const dialogs = done.filter((r) => r.dialog);
  const ns = single.length;
  const cnt = (name: string): number => single.filter((r) => r.checks.find((c) => c.name === name)?.pass).length;
  const avg = done.reduce((s, r) => s + r.ms, 0) / done.length / 1000;
  const tile = (label: string, v: string): HTMLElement => el("div", { class: "tile" }, el("div", { class: "tile-v" }, v), el("div", { class: "tile-l" }, label));
  $("#summary").replaceChildren(
    tile("JSON gültig", `${single.filter((r) => r.parsed.ok).length}/${ns}`),
    tile("Intent richtig", `${cnt("Intent")}/${ns}`),
    tile("Keine erfundenen Werte", `${cnt("Keine erfundenen Werte")}/${ns}`),
    tile("Alles korrekt (roh)", `${single.filter((r) => r.pass).length}/${ns}`),
    tile("Alles korrekt nach Prüfung", `${single.filter((r) => r.verifiedPass).length}/${ns}`),
    tile("Dialoge korrekt", dialogs.length ? `${dialogs.filter((r) => r.pass).length}/${dialogs.length}` : "–"),
    tile("Ø Antwortzeit", `${avg.toFixed(1)} s`),
  );
}

async function runTests(): Promise<void> {
  if (!model.ready || busy) { setStatus(!model.ready ? "Bitte zuerst ein Modell laden." : "Es läuft gerade noch eine Anfrage, bitte kurz warten.", "error"); return; }
  busy = true; $<HTMLButtonElement>("#run-tests").disabled = true;
  testResults = [];
  renderTestTable();
  try {
    for (const [i, tc] of ALL_CASES.entries()) {
      setStatus(`Test ${i + 1}/${ALL_CASES.length}: ${tc.input}`);
      testResults[i] = await runCase(tc, api, model, mode());
      renderTestTable();
    }
    setStatus(`Testlauf fertig (${model.id}, Modus ${mode()})`, "ok");
  } catch (e) {
    console.error(e); setStatus(`Fehler im Testlauf: ${errorText(e)}`, "error");
  } finally { busy = false; $<HTMLButtonElement>("#run-tests").disabled = false; }
}

async function copyResults(): Promise<void> {
  if (!testResults.some(Boolean)) { setStatus("Noch keine Testergebnisse: zuerst „Alle Tests starten“ und warten, bis die Tabelle gefüllt ist.", "error"); return; }
  const data = {
    model: model.id, mode: mode(), date: new Date().toISOString(),
    results: ALL_CASES.map((tc, i) => {
      const r = testResults[i];
      return {
        input: tc.input, kind: tc.kind, pass: r?.pass, verifiedPass: r?.verifiedPass, ms: Math.round(r?.ms ?? 0),
        output: r?.raw, failed: r?.checks.filter((c) => !c.pass),
      };
    }),
  };
  try { await navigator.clipboard.writeText(pretty(data)); setStatus("Ergebnisse in die Zwischenablage kopiert.", "ok"); }
  catch { const w = window.open(); if (w) w.document.body.innerText = pretty(data); }
}

// ---------- Start ----------

async function init(): Promise<void> {
  $("#model").append(...MODELS.map((m) => el("option", { value: m.id }, m.label)));
  $<HTMLSelectElement>("#model").value = DEFAULT_MODEL;
  $("#load").addEventListener("click", () => void loadModel());
  $("#send").addEventListener("click", () => send());
  $("#input").addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") send(); });
  $("#reset").addEventListener("click", resetChat);
  $("#run-tests").addEventListener("click", () => void runTests());
  $("#copy").addEventListener("click", () => void copyResults());
  for (const b of document.querySelectorAll<HTMLElement>("[data-suggest]")) b.addEventListener("click", () => send(b.dataset.suggest));
  for (const t of document.querySelectorAll<HTMLElement>(".tab")) t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.setAttribute("aria-selected", x === t ? "true" : "false"));
    document.querySelectorAll<HTMLElement>(".pane").forEach((p) => { p.hidden = p.id !== t.dataset.pane; });
  });
  renderCart(); renderTestTable();
  try {
    ctx = await newContext(api);
    const gpuProblem = await checkWebGpu();
    setStatus(gpuProblem ?? `Backend verbunden (${ctx.categories.length} Kategorien). Modell wählen und laden.`, gpuProblem ? "error" : "ok");
  } catch (e) {
    setStatus(errorText(e), "error");
  }
}

void init();
