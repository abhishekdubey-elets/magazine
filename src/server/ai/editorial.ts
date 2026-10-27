import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CONTENT_TYPE_LABELS, classify, pullQuotes, suggestHeadlines, summarize } from "@/lib/ai";
import type { Article, ContentType } from "@/lib/types";

/**
 * Editorial AI on the server. Every result is a *proposal*: it is stored with
 * the article and only changes copy when a person accepts it. Outputs are
 * checked before they are shown — pull quotes must appear word-for-word in
 * the article, so nothing is put in an interviewee's mouth.
 *
 * Providers, in order: OpenAI (OPENAI_API_KEY) is the default, Anthropic
 * (ANTHROPIC_API_KEY) is used when OpenAI is not configured or fails, and
 * without either key the built-in heuristics answer. AI_PROVIDER=anthropic
 * or =openai pins one provider.
 */

export type AiAction = "classify" | "summary" | "quotes" | "headlines";
export const AI_ACTIONS: AiAction[] = ["classify", "summary", "quotes", "headlines"];

export const MODEL = process.env.AI_MODEL ?? "claude-opus-5-5";
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o";
export const OPENAI_URL = process.env.OPENAI_BASE_URL?.replace(/\/$/, "") ?? "https://api.openai.com/v1";

export type AiProvider = "openai" | "anthropic" | "heuristic";

/** Which providers are configured, in the order they are tried. */
export function providerOrder(env: Record<string, string | undefined> = process.env): AiProvider[] {
  const pinned = env.AI_PROVIDER;
  const openai = !!env.OPENAI_API_KEY;
  const anthropic = !!env.ANTHROPIC_API_KEY;
  if (pinned === "openai") return openai ? ["openai"] : [];
  if (pinned === "anthropic") return anthropic ? ["anthropic"] : [];
  const out: AiProvider[] = [];
  if (openai) out.push("openai");
  if (anthropic) out.push("anthropic");
  return out;
}

const TYPES = Object.keys(CONTENT_TYPE_LABELS) as [ContentType, ...ContentType[]];

const SCHEMAS = {
  classify: z.object({
    type: z.enum(TYPES),
    confidence: z.number(),
    reasons: z.array(z.string()),
  }),
  summary: z.object({ summary: z.string() }),
  quotes: z.object({ quotes: z.array(z.string()) }),
  headlines: z.object({ headlines: z.array(z.object({ text: z.string(), style: z.string() })) }),
};

/** JSON Schemas (strict) for OpenAI structured outputs; mirror SCHEMAS. */
const JSON_SCHEMAS: Record<AiAction, Record<string, unknown>> = {
  classify: { type: "object", properties: { type: { type: "string", enum: TYPES }, confidence: { type: "number" }, reasons: { type: "array", items: { type: "string" } } }, required: ["type", "confidence", "reasons"], additionalProperties: false },
  summary: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"], additionalProperties: false },
  quotes: { type: "object", properties: { quotes: { type: "array", items: { type: "string" } } }, required: ["quotes"], additionalProperties: false },
  headlines: { type: "object", properties: { headlines: { type: "array", items: { type: "object", properties: { text: { type: "string" }, style: { type: "string" } }, required: ["text", "style"], additionalProperties: false } } }, required: ["headlines"], additionalProperties: false },
};

const SYSTEM = `You are a senior sub-editor at Elets Technomedia, preparing articles for print in governance, technology and healthcare magazines (Indian English, house style: no exclamation marks, no clickbait, titles in title case).
You propose; editors decide. Never invent facts, names, numbers or quotations that are not in the article.`;

const TASK: Record<AiAction, string> = {
  classify: `Classify the article as one of: ${TYPES.map((t) => `${t} (${CONTENT_TYPE_LABELS[t]})`).join(", ")}. Give a confidence between 0 and 1 and two or three short reasons grounded in the text.`,
  summary: "Write a standfirst for the opening spread: one or two sentences, 35–55 words, that tells the reader what the piece is about and why it matters. Use only facts from the article.",
  quotes:
    "Pick three pull quotes. Each must be copied EXACTLY, character for character, from the article body (a sentence or a clause of 10–30 words), chosen for insight or a strong claim. Do not paraphrase, merge sentences or fix wording.",
  headlines:
    "Suggest four print headlines (each at most 10 words) in different styles, e.g. Quote-led, Name-led, Explainer, Analytical. Use the style name as `style`. For a quote-led headline, quote words that appear in the article.",
};

export interface AiResult {
  provider: AiProvider;
  model: string | null;
  output: unknown;
  /** Proposals dropped by validation (e.g. a quote not found in the article). */
  rejected: string[];
  usage?: { input_tokens: number; output_tokens: number };
}

const norm = (s: string) =>
  s
    .replace(/[“”"]/g, '"')
    .replace(/[‘’']/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** A quote must occur in the article; returns the article's own wording. */
export function verbatim(quote: string, body: string): string | null {
  const q = norm(quote).replace(/^["']|["']$/g, "").replace(/[.,;:]$/, "");
  if (q.split(" ").length < 5) return null;
  const flat = body.replace(/\s+/g, " ").trim();
  const at = norm(flat).indexOf(q);
  // norm() only maps characters 1:1 except whitespace runs, which `flat` already collapsed.
  return at >= 0 ? flat.slice(at, at + q.length) : null;
}

function heuristic(action: AiAction, a: Article): AiResult {
  const output =
    action === "classify"
      ? classify(a)
      : action === "summary"
        ? { summary: summarize(a) }
        : action === "quotes"
          ? { quotes: pullQuotes(a) }
          : { headlines: suggestHeadlines(a) };
  return { provider: "heuristic", model: null, output, rejected: [] };
}

let client: Anthropic | null = null;

const articleText = (a: Article) =>
  [`Title: ${a.title}`, a.subtitle ? `Deck: ${a.subtitle}` : "", `Author: ${a.author.name}${a.author.designation ? `, ${a.author.designation}` : ""}${a.author.organisation ? `, ${a.author.organisation}` : ""}`, "", a.body]
    .filter((x) => x !== "")
    .join("\n");

interface RawResult {
  parsed: unknown;
  model: string;
  usage?: { input_tokens: number; output_tokens: number };
}

async function askAnthropic(action: AiAction, a: Article): Promise<RawResult> {
  client ??= new Anthropic();
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(SCHEMAS[action]) },
    system: SYSTEM,
    messages: [{ role: "user", content: `<article>\n${articleText(a)}\n</article>\n\n${TASK[action]}` }],
  });
  if (response.stop_reason === "refusal") throw new Error("The AI declined this article. Use the suggestions from the built-in rules instead.");
  if (!response.parsed_output) throw new Error("The AI returned an unreadable answer. Try again.");
  return { parsed: response.parsed_output, model: response.model, usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens } };
}

/** OpenAI chat completion with a strict JSON schema (raw HTTP; no SDK needed). */
export async function askOpenAI(action: AiAction, a: Article, fetchFn: typeof fetch = fetch): Promise<RawResult> {
  const res = await fetchFn(`${OPENAI_URL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `<article>\n${articleText(a)}\n</article>\n\n${TASK[action]}` },
      ],
      response_format: { type: "json_schema", json_schema: { name: `pressflow_${action}`, strict: true, schema: JSON_SCHEMAS[action] } },
      max_completion_tokens: 2000,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string }; model?: string; choices?: { message?: { content?: string; refusal?: string }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  if (!res.ok) throw new Error(`OpenAI: ${body.error?.message ?? `HTTP ${res.status}`}`);
  const choice = body.choices?.[0];
  if (choice?.message?.refusal) throw new Error("The AI declined this article. Use the suggestions from the built-in rules instead.");
  if (choice?.finish_reason === "length" || !choice?.message?.content) throw new Error("The AI returned an incomplete answer. Try again.");
  let json: unknown;
  try {
    json = JSON.parse(choice.message.content);
  } catch {
    throw new Error("The AI returned an unreadable answer. Try again.");
  }
  const parsed = SCHEMAS[action].safeParse(json);
  if (!parsed.success) throw new Error("The AI answer did not match the expected shape. Try again.");
  return { parsed: parsed.data, model: body.model ?? OPENAI_MODEL, usage: body.usage ? { input_tokens: body.usage.prompt_tokens ?? 0, output_tokens: body.usage.completion_tokens ?? 0 } : undefined };
}

export async function runEditorialAi(action: AiAction, a: Article): Promise<AiResult> {
  const order = providerOrder();
  if (!order.length) return heuristic(action, a);
  let raw: RawResult | undefined;
  let provider: AiProvider = order[0];
  const failures: string[] = [];
  for (const p of order) {
    try {
      raw = p === "openai" ? await askOpenAI(action, a) : await askAnthropic(action, a);
      provider = p;
      break;
    } catch (e) {
      failures.push(`${p}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!raw) throw new Error(failures.join(" · "));
  const parsed = raw.parsed;

  const rejected: string[] = [];
  let output: unknown = parsed;
  if (action === "quotes") {
    const quotes: string[] = [];
    for (const q of (parsed as z.infer<typeof SCHEMAS.quotes>).quotes) {
      const v = verbatim(q, a.body);
      if (v) quotes.push(v);
      else rejected.push(`Not in the article word-for-word: “${q}”`);
    }
    output = { quotes };
  }
  if (action === "classify") {
    const c = parsed as z.infer<typeof SCHEMAS.classify>;
    output = { ...c, confidence: Math.round(Math.max(0, Math.min(1, c.confidence)) * 100) / 100, scores: [{ type: c.type, score: c.confidence }] };
  }
  return { provider, model: raw.model, output, rejected, usage: raw.usage };
}
