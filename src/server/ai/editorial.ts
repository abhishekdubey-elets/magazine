import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CONTENT_TYPE_LABELS, classify, pullQuotes, suggestHeadlines, summarize } from "@/lib/ai";
import type { Article, ContentType } from "@/lib/types";

/**
 * Editorial AI on the server (Claude). Every result is a *proposal*: it is
 * stored with the article and only changes copy when a person accepts it.
 * Outputs are checked before they are shown — pull quotes must appear
 * word-for-word in the article, so nothing is put in an interviewee's mouth.
 * Without ANTHROPIC_API_KEY the built-in heuristics answer instead.
 */

export type AiAction = "classify" | "summary" | "quotes" | "headlines";
export const AI_ACTIONS: AiAction[] = ["classify", "summary", "quotes", "headlines"];

export const MODEL = process.env.AI_MODEL ?? "claude-opus-5-5";
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
  provider: "anthropic" | "heuristic";
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

export async function runEditorialAi(action: AiAction, a: Article): Promise<AiResult> {
  if (!process.env.ANTHROPIC_API_KEY) return heuristic(action, a);
  client ??= new Anthropic();

  const article = [`Title: ${a.title}`, a.subtitle ? `Deck: ${a.subtitle}` : "", `Author: ${a.author.name}${a.author.designation ? `, ${a.author.designation}` : ""}${a.author.organisation ? `, ${a.author.organisation}` : ""}`, "", a.body]
    .filter((x) => x !== "")
    .join("\n");

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(SCHEMAS[action]) },
    system: SYSTEM,
    messages: [{ role: "user", content: `<article>\n${article}\n</article>\n\n${TASK[action]}` }],
  });
  if (response.stop_reason === "refusal") throw new Error("The AI declined this article. Use the suggestions from the built-in rules instead.");
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("The AI returned an unreadable answer. Try again.");

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
  return { provider: "anthropic", model: response.model, output, rejected, usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens } };
}
