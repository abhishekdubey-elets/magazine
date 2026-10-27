import type { ReferenceProfile, RefBlockRole, RefPage, RefPageAi, RefPageType, RefTextBlock } from "../types";

/**
 * AI recognition pass over a measured reference (shared by browser and
 * server). The AI sees a rendered page plus the measured text blocks and
 * answers *what things are* — page type, section, the role of each block.
 * It never changes a measurement: trim, margins, columns, sizes, fonts and
 * image placements stay exactly as read from the PDF. Everything it says is
 * recorded beside the rules' result, labelled, and open to correction.
 */

export const REF_PAGE_TYPES: RefPageType[] = ["cover", "contents", "message", "interview", "feature-opener", "article", "infographic", "advertisement", "other"];
export const REF_BLOCK_ROLES: RefBlockRole[] = ["headline", "deck", "standfirst", "body", "subheading", "caption", "pullquote", "byline", "name", "designation", "kicker", "question", "running-head", "folio", "other"];

/** Below this confidence the rules' type is kept and the AI's answer is shown as a second opinion. */
export const AI_ADOPT_CONFIDENCE = 0.6;
/** Pages per request (keeps each request small enough for serverless limits and one model call). */
export const PAGES_PER_REQUEST = 8;
export const MAX_BLOCKS_PER_PAGE = 40;

export interface RecognitionBlock {
  /** Index into the page's `blocks` array. */
  i: number;
  text: string;
  size: number;
  bold: boolean;
  lines: number;
  /** Position and size as a percentage of the trim (0–100). */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RecognitionPage {
  number: number;
  /** JPEG data URL of the rendered page. */
  image: string;
  blocks: RecognitionBlock[];
  images: number;
  rules: { type: RefPageType; confidence: number };
  runningHead?: string;
}

export interface RecognitionRequest {
  title: string;
  pageCount: number;
  bodySize: number;
  pages: RecognitionPage[];
}

export interface RecognitionPageResult {
  number: number;
  type: RefPageType;
  confidence: number;
  section: string;
  reasons: string[];
  blocks: { i: number; role: RefBlockRole }[];
}

export interface RecognitionResult {
  provider: "openai" | "anthropic";
  model: string;
  pages: RecognitionPageResult[];
  usage?: { input_tokens: number; output_tokens: number };
}

const pct = (v: number, of: number) => Math.round((v / of) * 1000) / 10;

/** Build the request for a set of pages (images come from the analysis, not the stored thumbnails). */
export function buildRecognitionRequest(profile: ReferenceProfile, images: Record<number, string | undefined>, numbers?: number[]): RecognitionRequest {
  const { width: W, height: H } = profile.trim;
  const pages = profile.pages
    .filter((p) => (!numbers || numbers.includes(p.number)) && images[p.number])
    .map<RecognitionPage>((p) => ({
      number: p.number,
      image: images[p.number]!,
      blocks: p.blocks.slice(0, MAX_BLOCKS_PER_PAGE).map((b, i) => ({ i, text: b.text.slice(0, 90), size: Math.round(b.size * 10) / 10, bold: b.bold, lines: b.lines, x: pct(b.x, W), y: pct(b.y, H), w: pct(b.w, W), h: pct(b.h, H) })),
      images: p.images.length,
      rules: { type: p.detectedType, confidence: p.confidence },
      runningHead: p.runningHead,
    }));
  return { title: profile.name, pageCount: profile.pageCount, bodySize: profile.body.size, pages };
}

/** Split a request into batches small enough for one serverless call each. */
export function batchRequests(req: RecognitionRequest, size = PAGES_PER_REQUEST): RecognitionRequest[] {
  const out: RecognitionRequest[] = [];
  for (let i = 0; i < req.pages.length; i += size) out.push({ ...req, pages: req.pages.slice(i, i + size) });
  return out;
}

function clean(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

/** Merge AI answers into the profile: page types (when confident), sections and block roles. Pure. */
export function mergeRecognition(profile: ReferenceProfile, results: RecognitionResult[], at = new Date().toISOString()): ReferenceProfile {
  const byPage = new Map<number, RecognitionPageResult>();
  for (const r of results) for (const p of r.pages) byPage.set(p.number, p);
  const disagreements: number[] = [];
  const pages: RefPage[] = profile.pages.map((p) => {
    const a = byPage.get(p.number);
    if (!a) return p;
    const edited = p.type !== p.detectedType && !p.ai?.adopted; // an editor already corrected this page
    const confidence = Math.max(0, Math.min(1, a.confidence));
    const disagrees = a.type !== p.detectedType;
    const adopted = !edited && confidence >= AI_ADOPT_CONFIDENCE;
    if (disagrees) disagreements.push(p.number);
    const ai: RefPageAi = { type: a.type, confidence, section: a.section ? clean(a.section).slice(0, 48) : undefined, reasons: a.reasons.map(clean).filter(Boolean).slice(0, 4), disagrees, adopted };
    const roles = new Map(a.blocks.map((b) => [b.i, b.role]));
    const blocks: RefTextBlock[] = p.blocks.map((b, i) => (roles.has(i) ? { ...b, role: roles.get(i) } : b.role ? { ...b, role: undefined } : b));
    return { ...p, type: adopted ? a.type : p.type, ai, blocks, runningHead: p.runningHead ?? (ai.section && ai.confidence >= AI_ADOPT_CONFIDENCE ? ai.section : undefined) };
  });
  const last = results.at(-1);
  const usage = results.reduce<{ input_tokens: number; output_tokens: number } | undefined>((u, r) => (r.usage ? { input_tokens: (u?.input_tokens ?? 0) + r.usage.input_tokens, output_tokens: (u?.output_tokens ?? 0) + r.usage.output_tokens } : u), undefined);
  return {
    ...profile,
    pages,
    sections: rebuildSections(pages),
    ai: last ? { provider: last.provider, model: last.model, at, pages: byPage.size, disagreements: disagreements.sort((a, b) => a - b), usage } : profile.ai,
  };
}

/** Sections from running heads (measured) and AI-read section names, in page order. */
export function rebuildSections(pages: RefPage[]): ReferenceProfile["sections"] {
  const sections: ReferenceProfile["sections"] = [];
  for (const p of [...pages].sort((a, b) => a.number - b.number)) {
    const name = p.runningHead;
    if (!name) continue;
    const s = sections.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (s) s.pages.push(p.number);
    else sections.push({ name, pages: [p.number] });
  }
  return sections;
}

/** The AI-recognised block with a role, if any (used by template derivation as a hint). */
export function roleBlock(blocks: RefTextBlock[], role: RefBlockRole, used?: Set<RefTextBlock>): RefTextBlock | undefined {
  return blocks.find((b) => b.role === role && !used?.has(b));
}

export const ROLE_LABEL: Record<RefBlockRole, string> = {
  headline: "Headline",
  deck: "Deck",
  standfirst: "Standfirst",
  body: "Body",
  subheading: "Subheading",
  caption: "Caption",
  pullquote: "Pull quote",
  byline: "Byline",
  name: "Name",
  designation: "Designation",
  kicker: "Kicker",
  question: "Question",
  "running-head": "Running head",
  folio: "Page number",
  other: "Other",
};
