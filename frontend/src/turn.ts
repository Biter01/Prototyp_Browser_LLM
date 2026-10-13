// Ein Schritt im Gespräch: erst Erkennung im Code, sonst ein Modellaufruf; dann Prüfung und Ablauf.
// Wird vom Chat, vom Testlauf und von den automatischen Tests gleich verwendet.
import { shownNames, type Context } from "./context.ts";
import { detectDirect, runExtractFlow, type FlowResult } from "./flow.ts";
import type { JsonMode, Model, Usage } from "./model.ts";
import { buildExtractPrompt, checkSchema, makeExtractSchema, parseModelOutput, type Parsed } from "./prompt.ts";
import { verifyExtraction, type Verified } from "./verify.ts";

export interface StepInfo {
  ms: number;
  raw: string;
  usage?: Usage;
  parsed: Parsed;
  schemaErrors: string[];
  /** true: im Code erkannt, kein Modellaufruf */
  byCode: boolean;
}

export interface TurnResult { step: StepInfo; verified: Verified | null; result: FlowResult | null }

export async function extractStep(userText: string, ctx: Context, model: Model, mode: JsonMode): Promise<TurnResult> {
  const direct = detectDirect(userText, ctx);
  if (direct) {
    const result = await runExtractFlow(direct.value, userText, ctx, direct.notes);
    return {
      step: { ms: 0, raw: "", parsed: { ok: true, value: direct.value }, schemaErrors: [], byCode: true },
      verified: direct, result,
    };
  }
  const schema = makeExtractSchema(ctx.categoryNames);
  const messages = [
    { role: "system" as const, content: buildExtractPrompt(ctx.categories, shownNames(ctx)) },
    { role: "user" as const, content: userText },
  ];
  const { raw, ms, usage } = await model.complete(messages, schema, mode);
  const parsed = parseModelOutput(raw);
  const schemaErrors = parsed.ok ? checkSchema(parsed.value, schema) : [];
  const step: StepInfo = { ms, usage, raw, parsed, schemaErrors, byCode: false };
  if (!parsed.ok) return { step, verified: null, result: null };
  const verified = verifyExtraction(parsed.value, userText, ctx);
  return { step, verified, result: await runExtractFlow(verified.value, userText, ctx, verified.notes) };
}
