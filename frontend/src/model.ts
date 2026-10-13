// Das Sprachmodell hinter einer kleinen Schnittstelle: im Browser WebLLM, in Tests ein Skript.
import type { JsonSchema } from "./prompt.ts";

export type JsonMode = "schema" | "json" | "free";
export interface ChatMessage { role: "system" | "user" | "assistant"; content: string }
export interface Usage { completion_tokens?: number; extra?: { decode_tokens_per_s?: number } }
export interface Completion { raw: string; ms: number; usage?: Usage }

export interface Model {
  readonly id: string;
  complete(messages: ChatMessage[], schema: JsonSchema, mode: JsonMode): Promise<Completion>;
}

export const MODELS = [
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 1.5B · ca. 1,6 GB" },
  { id: "Qwen2.5-3B-Instruct-q4f16_1-MLC", label: "Qwen2.5 3B · ca. 2,5 GB" },
  { id: "Qwen3-1.7B-q4f16_1-MLC", label: "Qwen3 1.7B · ca. 2,0 GB" },
  { id: "Qwen3-4B-q4f16_1-MLC", label: "Qwen3 4B · ca. 3,4 GB" },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", label: "Llama 3.2 3B · ca. 2,3 GB" },
  { id: "Qwen2.5-7B-Instruct-q4f16_1-MLC", label: "Qwen2.5 7B · ca. 5,1 GB" },
] as const;
export const DEFAULT_MODEL = "Qwen2.5-3B-Instruct-q4f16_1-MLC";

// Nur der Teil der WebLLM-API, den wir brauchen. Bewusst schmal gehalten,
// damit kleine Änderungen in den Typen von @mlc-ai/web-llm die Typprüfung nicht brechen.
interface WebLlmEngine {
  reload(id: string): Promise<void>;
  setInitProgressCallback?(cb: (p: { progress: number; text: string }) => void): void;
  chat: { completions: { create(req: Record<string, unknown>): Promise<{ choices: { message?: { content?: string | null } }[]; usage?: Usage }> } };
}
interface WebLlmModule {
  CreateMLCEngine(id: string, opts: { initProgressCallback: (p: { progress: number; text: string }) => void }): Promise<WebLlmEngine>;
}

export class WebLlmModel implements Model {
  private engine: WebLlmEngine | null = null;
  id = "";

  async load(id: string, onProgress: (progress: number, text: string) => void): Promise<void> {
    const cb = (p: { progress: number; text: string }): void => onProgress(p.progress ?? 0, p.text ?? "Lade Modell …");
    if (this.engine) {
      this.engine.setInitProgressCallback?.(cb);
      await this.engine.reload(id);
    } else {
      // Erst beim Klick laden: die Bibliothek ist groß
      const webllm = (await import("@mlc-ai/web-llm")) as unknown as WebLlmModule;
      this.engine = await webllm.CreateMLCEngine(id, { initProgressCallback: cb });
    }
    this.id = id;
  }

  get ready(): boolean { return this.engine !== null && this.id !== ""; }

  async complete(messages: ChatMessage[], schema: JsonSchema, mode: JsonMode): Promise<Completion> {
    if (!this.engine) throw new Error("Kein Modell geladen");
    const req: Record<string, unknown> = { messages, temperature: 0, max_tokens: 300 };
    if (mode === "schema") req.response_format = { type: "json_object", schema: JSON.stringify(schema) };
    if (mode === "json") req.response_format = { type: "json_object" };
    if (this.id.startsWith("Qwen3")) req.extra_body = { enable_thinking: false };
    const t0 = performance.now();
    const res = await this.engine.chat.completions.create(req);
    return { raw: res.choices[0]?.message?.content ?? "", ms: performance.now() - t0, usage: res.usage };
  }
}

export async function checkWebGpu(): Promise<string | null> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return "Dieser Browser unterstützt kein WebGPU. Bitte aktuelles Chrome oder Edge verwenden.";
  if (!(await gpu.requestAdapter())) return "WebGPU ist vorhanden, aber keine passende Grafikkarte gefunden. Hardware-Beschleunigung im Browser prüfen.";
  return null;
}
