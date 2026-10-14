import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

/**
 * Provider-agnostic structured generation. The product only needs one primitive:
 * "system + user text (+ images) -> JSON matching a zod schema". Three providers are
 * supported so the key already used by the short-video analyzer can be reused here.
 *
 * Selection: LLM_PROVIDER=anthropic|gemini|openai, else the first configured key in
 * the order gemini, openai, anthropic.
 */

export type Provider = "anthropic" | "gemini" | "openai";

export interface ImageInput {
  mediaType: "image/png" | "image/jpeg";
  data: Buffer | Uint8Array;
}

export interface GenerateJsonArgs<T> {
  system: string;
  user: string;
  images?: { label: string; image: ImageInput }[];
  schema: z.ZodType<T>;
  maxTokens?: number;
}

export type GenerateJsonResult<T> = { ok: true; data: T; provider: Provider; model: string } | { ok: false; error: string; provider: Provider | null };

const GEMINI_KEY = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;
const OPENAI_KEY = () => process.env.OPENAI_API_KEY;
const ANTHROPIC_KEY = () => process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;

export function resolveProvider(): Provider | null {
  const forced = (process.env.LLM_PROVIDER || "").toLowerCase();
  if (forced === "anthropic" || forced === "gemini" || forced === "openai") {
    const has = forced === "gemini" ? GEMINI_KEY() : forced === "openai" ? OPENAI_KEY() : ANTHROPIC_KEY();
    return has ? forced : null;
  }
  if (GEMINI_KEY()) return "gemini";
  if (OPENAI_KEY()) return "openai";
  if (ANTHROPIC_KEY()) return "anthropic";
  return null;
}

export function providerLabel(p: Provider | null) {
  return p === "gemini" ? "Gemini" : p === "openai" ? "OpenAI" : p === "anthropic" ? "Claude" : null;
}

export function modelFor(p: Provider) {
  if (p === "gemini") return process.env.GEMINI_MODEL || "gemini-2.5-flash";
  if (p === "openai") return process.env.OPENAI_MODEL || "gpt-4o-mini";
  return process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
}

export async function generateJson<T>(args: GenerateJsonArgs<T>): Promise<GenerateJsonResult<T>> {
  const provider = resolveProvider();
  if (!provider) return { ok: false, error: "no provider configured", provider: null };
  try {
    if (provider === "anthropic") return await viaAnthropic(args, modelFor(provider));
    if (provider === "gemini") return await viaGemini(args, modelFor(provider));
    return await viaOpenAI(args, modelFor(provider));
  } catch (err) {
    const msg = err instanceof Anthropic.APIError ? `API error ${err.status}: ${err.message}` : err instanceof Error ? err.message : String(err);
    console.error(`llm(${provider}) failed`, msg);
    return { ok: false, error: msg, provider };
  }
}

// Shared ---------------------------------------------------------------------

function schemaText<T>(schema: z.ZodType<T>) {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return JSON.stringify(json);
}

function parseJsonLoose(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("response was not JSON");
  }
}

function validate<T>(schema: z.ZodType<T>, raw: unknown, provider: Provider, model: string): GenerateJsonResult<T> {
  const r = schema.safeParse(raw);
  if (!r.success) return { ok: false, error: `schema mismatch: ${r.error.issues[0]?.message ?? "invalid"}`, provider };
  return { ok: true, data: r.data, provider, model };
}

const b64 = (d: Buffer | Uint8Array) => Buffer.from(d).toString("base64");

// Anthropic --------------------------------------------------------------------

async function viaAnthropic<T>(args: GenerateJsonArgs<T>, model: string): Promise<GenerateJsonResult<T>> {
  const client = new Anthropic();
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const im of args.images ?? []) {
    content.push({ type: "text", text: `【${im.label}】` });
    content.push({ type: "image", source: { type: "base64", media_type: im.image.mediaType, data: b64(im.image.data) } });
  }
  content.push({ type: "text", text: args.user });
  const res = await client.beta.messages.parse({
    model,
    max_tokens: args.maxTokens ?? 4096,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
    output_config: { effort: "medium", format: betaZodOutputFormat(args.schema) },
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) return { ok: false, error: "model declined", provider: "anthropic" };
  return { ok: true, data: res.parsed_output as T, provider: "anthropic", model };
}

// Gemini -------------------------------------------------------------------------

async function viaGemini<T>(args: GenerateJsonArgs<T>, model: string): Promise<GenerateJsonResult<T>> {
  const parts: Array<Record<string, unknown>> = [];
  for (const im of args.images ?? []) {
    parts.push({ text: `【${im.label}】` });
    parts.push({ inline_data: { mime_type: im.image.mediaType, data: b64(im.image.data) } });
  }
  parts.push({ text: `${args.user}\n\n出力は次の JSON Schema に従う JSON のみ:\n${schemaText(args.schema)}` });
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: args.system }] },
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: args.maxTokens ?? 4096, temperature: 0.7 },
    }),
    signal: AbortSignal.timeout(50_000),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>; promptFeedback?: { blockReason?: string } };
  if (json.promptFeedback?.blockReason) return { ok: false, error: `blocked: ${json.promptFeedback.blockReason}`, provider: "gemini" };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) return { ok: false, error: `empty response (${json.candidates?.[0]?.finishReason ?? "no candidate"})`, provider: "gemini" };
  return validate(args.schema, parseJsonLoose(text), "gemini", model);
}

// OpenAI -------------------------------------------------------------------------

async function viaOpenAI<T>(args: GenerateJsonArgs<T>, model: string): Promise<GenerateJsonResult<T>> {
  const content: Array<Record<string, unknown>> = [];
  for (const im of args.images ?? []) {
    content.push({ type: "text", text: `【${im.label}】` });
    content.push({ type: "image_url", image_url: { url: `data:${im.image.mediaType};base64,${b64(im.image.data)}`, detail: "low" } });
  }
  content.push({ type: "text", text: `${args.user}\n\n出力は次の JSON Schema に従う JSON のみ:\n${schemaText(args.schema)}` });
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI_KEY()}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
      max_tokens: args.maxTokens ?? 4096,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(50_000),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string; refusal?: string } }> };
  const msg = json.choices?.[0]?.message;
  if (msg?.refusal) return { ok: false, error: `refused: ${msg.refusal}`, provider: "openai" };
  if (!msg?.content) return { ok: false, error: "empty response", provider: "openai" };
  return validate(args.schema, parseJsonLoose(msg.content), "openai", model);
}
