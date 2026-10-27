import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { REF_BLOCK_ROLES, REF_PAGE_TYPES, type RecognitionPage, type RecognitionRequest, type RecognitionResult } from "@/lib/reference/recognize";
import { REF_TYPE_LABELS } from "@/lib/reference/derive";
import { MODEL, OPENAI_MODEL, OPENAI_URL, providerOrder } from "./editorial";

/**
 * Reference recognition on the server: the model sees each rendered page and
 * the measured text blocks, and returns page type, section and block roles
 * with a confidence. OpenAI (vision) first, Anthropic as fallback. Nothing
 * numeric is asked of the model — measurements come from the PDF.
 */

export const MAX_PAGES_PER_CALL = 12;
/** Data-URL JPEG, ~420 px wide pages are well under this. */
export const MAX_IMAGE_BYTES = 400_000;

const Page = z.object({
  number: z.number(),
  type: z.enum(REF_PAGE_TYPES as [string, ...string[]]),
  confidence: z.number(),
  section: z.string(),
  reasons: z.array(z.string()),
  blocks: z.array(z.object({ i: z.number(), role: z.enum(REF_BLOCK_ROLES as [string, ...string[]]) })),
});
const Schema = z.object({ pages: z.array(Page) });

const JSON_SCHEMA = {
  type: "object",
  properties: {
    pages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          number: { type: "integer" },
          type: { type: "string", enum: REF_PAGE_TYPES },
          confidence: { type: "number" },
          section: { type: "string" },
          reasons: { type: "array", items: { type: "string" } },
          blocks: { type: "array", items: { type: "object", properties: { i: { type: "integer" }, role: { type: "string", enum: REF_BLOCK_ROLES } }, required: ["i", "role"], additionalProperties: false } },
        },
        required: ["number", "type", "confidence", "section", "reasons", "blocks"],
        additionalProperties: false,
      },
    },
  },
  required: ["pages"],
  additionalProperties: false,
};

const TYPE_GUIDE = `Page types:
- cover: the front cover (masthead, cover lines).
- contents: table of contents / "in this issue".
- message: a leadership message, editorial or foreword signed by one person (portrait, name, designation).
- interview: Q&A with one person — emphasised questions, answers, portrait, name and designation.
- feature-opener: the first page of a long feature: very large headline, deck/standfirst, a dominant image, little body text.
- article: a running-text page (feature continuation, analysis, government perspective, event report, company profile): columns of body text with sub-headings, pull quotes, captions.
- infographic: numbers, charts, panels; little running text.
- advertisement: an ad or advertorial — product/brand visual, contact details, no editorial running text.
- other: blank, back cover, filler, or anything that is none of the above.`;

const ROLE_GUIDE = `Block roles (only for blocks that are clearly one of these; leave body text and anything unclear out):
headline, deck (secondary headline under/over the headline), standfirst (bold intro paragraph), subheading (cross-head inside body text), caption (text describing a photo), pullquote (quotation set large inside the layout), byline ("By …"), name (a person's name as a label, e.g. under a portrait), designation (job title/organisation under a name), kicker (small label above the headline, e.g. a section word), question (interview question), running-head (section name at the top edge), folio (page number), other.`;

const SYSTEM = `You are a magazine production editor analysing pages of an Indian B2B/governance magazine (Elets Technomedia). For each page you receive a rendered image and the text blocks measured from the PDF (index, text start, point size, bold, line count, position in % of the page).
Decide the page type, the section name if the page shows one (running head, section kicker; otherwise an empty string), two or three short reasons based on what is visible, and the editorial role of each text block you are confident about (reference blocks by their index).
${TYPE_GUIDE}
${ROLE_GUIDE}
Confidence is 0–1 and must reflect genuine doubt. The rules' guess is given for comparison; disagree whenever the page says otherwise. Answer only in the required JSON.`;

function pageText(p: RecognitionPage) {
  const blocks = p.blocks.map((b) => `${b.i}: "${b.text.replace(/"/g, "'")}" ${b.size}pt${b.bold ? " bold" : ""} ${b.lines}ln @${b.x},${b.y} ${b.w}×${b.h}%`).join("\n");
  return `Page ${p.number}. Rules guessed: ${p.rules.type} (${REF_TYPE_LABELS[p.rules.type]}, ${Math.round(p.rules.confidence * 100)}%). Measured running head: ${p.runningHead ?? "none"}. Images: ${p.images}.\nText blocks:\n${blocks || "(no live text)"}`;
}

function intro(req: RecognitionRequest) {
  return `Magazine: ${req.title}, ${req.pageCount} pages, body text ${req.bodySize}pt. Pages in this batch: ${req.pages.map((p) => p.number).join(", ")}. Return one entry per page, in the same order.`;
}

interface Raw {
  parsed: z.infer<typeof Schema>;
  model: string;
  usage?: { input_tokens: number; output_tokens: number };
}

export async function askOpenAIVision(req: RecognitionRequest, fetchFn: typeof fetch = fetch): Promise<Raw> {
  const content: unknown[] = [{ type: "text", text: intro(req) }];
  for (const p of req.pages) {
    content.push({ type: "text", text: pageText(p) });
    content.push({ type: "image_url", image_url: { url: p.image, detail: "low" } });
  }
  const res = await fetchFn(`${OPENAI_URL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content },
      ],
      response_format: { type: "json_schema", json_schema: { name: "pressflow_reference_pages", strict: true, schema: JSON_SCHEMA } },
      max_completion_tokens: 4000,
    }),
    signal: AbortSignal.timeout(110_000),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string }; model?: string; choices?: { message?: { content?: string; refusal?: string }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  if (!res.ok) throw new Error(`OpenAI: ${body.error?.message ?? `HTTP ${res.status}`}`);
  const choice = body.choices?.[0];
  if (choice?.message?.refusal) throw new Error("The AI declined to analyse these pages.");
  if (choice?.finish_reason === "length" || !choice?.message?.content) throw new Error("The AI returned an incomplete answer. Try fewer pages.");
  let json: unknown;
  try {
    json = JSON.parse(choice.message.content);
  } catch {
    throw new Error("The AI returned an unreadable answer. Try again.");
  }
  const parsed = Schema.safeParse(json);
  if (!parsed.success) throw new Error("The AI answer did not match the expected shape. Try again.");
  return { parsed: parsed.data, model: body.model ?? OPENAI_MODEL, usage: body.usage ? { input_tokens: body.usage.prompt_tokens ?? 0, output_tokens: body.usage.completion_tokens ?? 0 } : undefined };
}

let client: Anthropic | null = null;

async function askAnthropicVision(req: RecognitionRequest): Promise<Raw> {
  client ??= new Anthropic();
  const content: Anthropic.Beta.BetaContentBlockParam[] = [{ type: "text", text: intro(req) }];
  for (const p of req.pages) {
    const m = /^data:(image\/\w+);base64,(.+)$/.exec(p.image);
    content.push({ type: "text", text: pageText(p) });
    if (m) content.push({ type: "image", source: { type: "base64", media_type: m[1] as "image/jpeg", data: m[2] } });
  }
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 6000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(Schema) },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason === "refusal") throw new Error("The AI declined to analyse these pages.");
  if (!response.parsed_output) throw new Error("The AI returned an unreadable answer. Try again.");
  return { parsed: response.parsed_output, model: response.model, usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens } };
}

/** Validate a request from the browser: sizes and shapes only (content is data). */
export function validateRequest(body: unknown): RecognitionRequest {
  const r = body as Partial<RecognitionRequest>;
  if (!r || !Array.isArray(r.pages) || !r.pages.length) throw new Error("No pages to recognise.");
  if (r.pages.length > MAX_PAGES_PER_CALL) throw new Error(`At most ${MAX_PAGES_PER_CALL} pages per request.`);
  for (const p of r.pages) {
    if (typeof p.number !== "number" || typeof p.image !== "string" || !p.image.startsWith("data:image/jpeg;base64,")) throw new Error("Each page needs a number and a JPEG image.");
    if (p.image.length > MAX_IMAGE_BYTES) throw new Error(`Page ${p.number}: image too large.`);
    if (!Array.isArray(p.blocks) || p.blocks.length > 60) throw new Error(`Page ${p.number}: bad block list.`);
    if (!p.rules || !REF_PAGE_TYPES.includes(p.rules.type)) throw new Error(`Page ${p.number}: bad rules guess.`);
  }
  return { title: String(r.title ?? "").slice(0, 120), pageCount: Number(r.pageCount) || r.pages.length, bodySize: Number(r.bodySize) || 9, pages: r.pages as RecognitionPage[] };
}

/** Run recognition with the configured providers (OpenAI, then Anthropic). Throws when neither answers. */
export async function recognizeReference(req: RecognitionRequest, fetchFn: typeof fetch = fetch): Promise<RecognitionResult> {
  const order = providerOrder().filter((p) => p !== "heuristic");
  if (!order.length) throw new Error("No AI provider is configured (set OPENAI_API_KEY or ANTHROPIC_API_KEY).");
  const failures: string[] = [];
  for (const p of order) {
    try {
      const raw = p === "openai" ? await askOpenAIVision(req, fetchFn) : await askAnthropicVision(req);
      const wanted = new Set(req.pages.map((x) => x.number));
      const pages = raw.parsed.pages
        .filter((x) => wanted.has(x.number))
        .map((x) => ({
          number: x.number,
          type: x.type as RecognitionResult["pages"][number]["type"],
          confidence: Math.max(0, Math.min(1, x.confidence)),
          section: x.section.trim(),
          reasons: x.reasons.slice(0, 4),
          blocks: x.blocks.filter((b) => Number.isInteger(b.i) && b.i >= 0 && b.i < 60).map((b) => ({ i: b.i, role: b.role as RecognitionResult["pages"][number]["blocks"][number]["role"] })),
        }));
      if (!pages.length) throw new Error("The AI answered for none of the requested pages.");
      return { provider: p, model: raw.model, pages, usage: raw.usage };
    } catch (e) {
      failures.push(`${p}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(failures.join(" · "));
}
