import { templateCapacity } from "./layout-engine";
import { compatibleTemplates } from "./templates";
import { countWords, parseBody } from "./text-engine";
import type { Article, ContentType, Settings, Template } from "./types";

/**
 * Local, deterministic stand-ins for AI services. Each function inspects the
 * actual article text, so results change with the content — but no model is
 * called. Replace with real model calls behind the same signatures.
 */

const STOP = new Set(
  "a an and are as at be been but by for from has have he her his i in into is it its of on or our that the their them they this to was we were which will with who what how why can more not also than so such these those there over under about after before while when where very just only into across each every per both most other some any all if then its it's we're our us you your".split(
    " ",
  ),
);

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  interview: "Interview",
  "leadership-message": "Leadership message",
  "government-perspective": "Government perspective",
  feature: "Feature article",
  "news-report": "News report",
  "case-study": "Case study",
  "event-report": "Event report",
  "company-profile": "Company profile",
  editorial: "Editorial",
};

export function sentences(text: string): string[] {
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z“"‘(₹0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
}

function plain(article: Pick<Article, "body">) {
  return parseBody(article.body)
    .map((p) => p.words.join(" "))
    .join("\n");
}

function tokens(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9₹%\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

export function keywords(text: string, n = 8): string[] {
  const freq = new Map<string, number>();
  for (const t of tokens(text)) freq.set(t, (freq.get(t) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([w]) => w);
}

/* ------------------------------------------------------------ classify */

export interface Classification {
  type: ContentType;
  confidence: number;
  reasons: string[];
  scores: { type: ContentType; score: number }[];
}

export function classify(article: Pick<Article, "body" | "title" | "author">): Classification {
  const paras = parseBody(article.body);
  const text = plain(article);
  const lower = text.toLowerCase();
  const words = countWords(text);
  const qCount = paras.filter((p) => p.kind === "q").length;
  const qMarks = (text.match(/\?/g) ?? []).length;
  const firstPerson = (lower.match(/\b(i|my|me)\b/g) ?? []).length / Math.max(words, 1);
  const we = (lower.match(/\b(we|our|us)\b/g) ?? []).length / Math.max(words, 1);
  const subheads = paras.filter((p) => p.kind === "h").map((p) => p.words.join(" ").toLowerCase());
  const has = (re: RegExp) => (lower.match(re) ?? []).length;
  const designation = `${article.author.designation ?? ""}`.toLowerCase();

  const s: Record<ContentType, number> = {
    interview: qCount * 3 + (qMarks > 4 ? 4 : 0),
    "leadership-message":
      (article.title.toLowerCase() === "message" ? 8 : 0) +
      (/(secretary|minister|commissioner|chair|ias|director)/.test(designation) ? 2 : 0) +
      (has(/best wishes|congratulate|i am confident|i extend|jai hind/g) * 3) +
      firstPerson * 120,
    "case-study": subheads.filter((h) => /challenge|approach|outcome|result|solution/.test(h)).length * 3 + has(/\b(outcome|baseline|pilot|before|after|reduced|improved)\b/g) * 0.4,
    "event-report": has(/\b(conclave|summit|session|panel|delegates|keynote|award|inaugurat)\w*/g) * 1.2 + (/(event|conclave)/.test(designation) ? 3 : 0),
    "news-report": (/^[A-Z]{3,}:/.test(text) ? 6 : 0) + (words < 360 ? 2 : 0) + has(/\b(announced|said|according to|on monday|on tuesday|this week)\b/g),
    feature: 2 + subheads.length * 1.2 + (words > 500 ? 2 : 0) + we * 10,
    editorial: (/(editor)/.test(designation) ? 7 : 0) + has(/dear readers|this issue|in this edition/g) * 3,
    "government-perspective":
      (/(secretary|minister|commissioner|ias|ips|ifs|collector|chief|director general|department|ministry|government of)/.test(designation) ? 5 : 0) +
      has(/\b(policy|scheme|citizens|department|governance|public service|state government|ministry)\b/g) * 0.5 +
      (qCount === 0 && firstPerson > 0.008 ? 2 : 0),
    "company-profile":
      has(/\b(founded|headquartered|our (clients|customers|products|services)|offers|portfolio|leadership team|ceo|managing director|turnover|revenue|offices in)\b/g) * 1.2 +
      subheads.filter((h) => /about|overview|products|services|leadership|achievements|contact/.test(h)).length * 3 +
      (/(ceo|founder|managing director|cto|coo)/.test(designation) ? 3 : 0),
  };
  const scores = (Object.entries(s) as [ContentType, number][])
    .map(([type, score]) => ({ type, score: Math.round(score * 10) / 10 }))
    .sort((a, b) => b.score - a.score);
  const top = scores[0];
  const total = scores.reduce((a, b) => a + Math.max(b.score, 0), 0) || 1;
  const confidence = Math.min(0.97, Math.max(0.42, top.score / total + 0.25));

  const reasons: string[] = [];
  if (qCount) reasons.push(`${qCount} question/answer pairs detected (paragraphs starting “Q:”/“A:”).`);
  if (subheads.length) reasons.push(`${subheads.length} sub-headings: ${subheads.slice(0, 3).map((h) => `“${h}”`).join(", ")}.`);
  if (firstPerson > 0.01) reasons.push(`High first-person voice (${(firstPerson * 100).toFixed(1)}% of words).`);
  if (article.author.designation) reasons.push(`Author designation: ${article.author.designation}.`);
  reasons.push(`${words} words in body.`);
  return { type: top.type, confidence: Math.round(confidence * 100) / 100, reasons, scores };
}

/* ------------------------------------------------------------- summary */

function scoreSentences(text: string) {
  const kws = keywords(text, 14);
  const sents = sentences(text);
  return sents.map((s, i) => {
    const t = tokens(s);
    const kwHits = t.filter((w) => kws.includes(w)).length;
    const len = t.length;
    const position = i < 2 ? 1.6 : i < 5 ? 1.15 : 1;
    const numbers = /\d/.test(s) ? 1.15 : 1;
    return { s, i, score: ((kwHits + 1) / Math.sqrt(len + 4)) * position * numbers };
  });
}

/** Extractive summary: highest-scoring sentences in original order, ~40–55 words. */
export function summarize(article: Pick<Article, "body">, target = 48): string {
  const all = parseBody(article.body);
  // Interviews: the standfirst comes from the third-person introduction, not the answers.
  if (all.some((p) => p.kind === "q") && all[0]?.kind === "p") {
    if (all[0].words.length <= 85) return all[0].words.join(" ");
    const intro = sentences(all[0].words.join(" "));
    const out: string[] = [];
    for (const s of intro) {
      if (countWords([...out, s].join(" ")) > target + 14 && out.length) break;
      out.push(s);
    }
    return out.join(" ");
  }
  const text = all
    .filter((p) => p.kind !== "q" && p.kind !== "h")
    .map((p) => p.words.join(" "))
    .join("\n");
  const ranked = scoreSentences(text).sort((a, b) => b.score - a.score);
  const picked: typeof ranked = [];
  let words = 0;
  for (const r of ranked) {
    const w = countWords(r.s);
    if (w > 45) continue;
    if (words + w > target + 12) continue;
    picked.push(r);
    words += w;
    if (words >= target - 10) break;
  }
  return picked
    .sort((a, b) => a.i - b.i)
    .map((r) => r.s)
    .join(" ");
}

/** For interviews: the body's leading introduction paragraph, if any. */
export function interviewIntro(body: string): string | null {
  const paras = parseBody(body);
  return paras.some((p) => p.kind === "q") && paras[0]?.kind === "p" ? paras[0].words.join(" ") : null;
}

/** Remove the leading introduction paragraph from an interview body. */
export function withoutIntro(body: string): string {
  return body.replace(/\r\n/g, "\n").split(/\n\s*\n/).slice(1).join("\n\n");
}

/* ----------------------------------------------------------- pull quotes */

export function pullQuotes(article: Pick<Article, "body">, n = 3): string[] {
  const paras = parseBody(article.body).filter((p) => p.kind !== "q" && p.kind !== "h");
  const text = paras.map((p) => p.words.join(" ")).join("\n");
  const strong = /\b(must|never|not|only|every|future|trust|believe|real|truly|first|largest|citizen|people)\b/gi;
  return sentences(text)
    .map((s, i) => {
      const w = countWords(s);
      const fit = w >= 12 && w <= 30 ? 1 : w <= 36 ? 0.4 : 0;
      const punch = (s.match(strong) ?? []).length;
      return { s: s.replace(/^["“]|["”]$/g, ""), score: fit * (1 + punch * 0.6) * (i > 0 ? 1 : 0.7), i };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.s);
}

/* -------------------------------------------------------------- headlines */

function titleCase(s: string) {
  return s.replace(/\b([a-z])([a-z]*)/g, (_m, a: string, b: string) => a.toUpperCase() + b);
}

/** Capitalised multi-word phrases (organisations, places, programmes). */
function entities(text: string): string[] {
  const m = text.match(/\b(?:[A-Z][a-zA-Z&]+(?:\s+(?:of|and|for|the)\s+|\s+)){1,3}[A-Z][a-zA-Z]+\b/g) ?? [];
  const freq = new Map<string, number>();
  for (const e of m) {
    if (/^(The|In|As|For|At|We|Our|It|This|When|But)\s/.test(e)) continue;
    freq.set(e, (freq.get(e) ?? 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => e);
}

export function suggestHeadlines(article: Pick<Article, "body" | "title" | "contentType" | "author">): { text: string; style: string }[] {
  const text = plain(article);
  const kw = keywords(text, 10).filter((k) => !/^\d/.test(k));
  const ents = entities(text);
  const k1 = titleCase(kw[0] ?? "governance");
  const k2 = titleCase(kw[1] ?? "technology");
  const k3 = titleCase(kw[2] ?? "citizens");
  const ent = ents[0] ?? article.author.organisation ?? "Maharashtra";
  const name = article.author.name.replace(/^(Dr\.|Shri|Smt\.|Ms\.|Mr\.)\s+/, "").split(",")[0];
  const out: { text: string; style: string }[] = [];
  if (article.contentType === "interview") {
    out.push({ text: `“${firstQuoteFragment(text)}”`, style: "Quote-led" });
    out.push({ text: `${name} on ${k1}, ${k2} and the Road Ahead`, style: "Name-led" });
  }
  out.push({ text: `How ${ent} Is Rethinking ${k1}`, style: "Explainer" });
  out.push({ text: `${k1} at Scale: Lessons from ${ent}`, style: "Analytical" });
  out.push({ text: `From ${k2} to ${k3}: A New Playbook`, style: "Narrative" });
  return out.slice(0, 4);
}

function firstQuoteFragment(text: string) {
  const s = pullQuotes({ body: text }, 1)[0] ?? sentences(text)[0] ?? "";
  const words = s.split(/\s+/).slice(0, 9).join(" ").replace(/[,;:.]$/, "");
  return words;
}

/* --------------------------------------------------- image opportunities */

export interface ImageOpportunity {
  kind: "portrait" | "scene" | "infographic" | "event";
  title: string;
  reason: string;
  suggestedImageId?: string;
  caption: string;
}

export function imageOpportunities(article: Article): ImageOpportunity[] {
  const text = plain(article);
  const lower = text.toLowerCase();
  const out: ImageOpportunity[] = [];
  const role = [article.author.designation, article.author.organisation].filter(Boolean).join(", ");
  if (article.contentType === "interview" || article.contentType === "leadership-message" || article.contentType === "editorial") {
    out.push({
      kind: "portrait",
      title: `Portrait of ${article.author.name || "the author"}`,
      reason: `${CONTENT_TYPE_LABELS[article.contentType]} templates lead with the speaker's portrait.`,
      suggestedImageId: article.imageIds[0],
      caption: `${article.author.name}${role ? `, ${role}` : ""}`,
    });
  }
  const numbers = text.match(/(₹\s?[\d,.]+\s?(?:crore|lakh|cr)?|\d[\d,.]*\s?(?:%|per cent|lakh|crore|districts|schools|villages))/gi) ?? [];
  if (numbers.length >= 3) {
    out.push({
      kind: "infographic",
      title: "Data callout / infographic",
      reason: `${numbers.length} figures found (e.g. ${numbers.slice(0, 3).join(", ")}). A facts box or chart will carry them better than running text.`,
      caption: `Key figures: ${numbers.slice(0, 3).join(" · ")}`,
    });
  }
  const scenes: [RegExp, string, string][] = [
    [/farm|crop|agri|soil|kisan/, "img-farm-drone", "Field photography: farmers using the advisory"],
    [/data cent|cloud|server|sovereign/, "img-datacentre", "Data centre interior"],
    [/school|student|classroom|skill/, "img-classroom", "Students in a digital classroom"],
    [/health|hospital|doctor|telemedicine/, "img-health", "Telemedicine consultation at a health centre"],
    [/solar|energy|microgrid/, "img-solar", "Solar installation"],
    [/cyber|security|threat|zero.trust/, "img-cyber", "Security operations visual"],
    [/conclave|summit|panel|session/, "img-conference", "Conference stage and audience"],
    [/service cent|counter|kiosk|citizen service|aaple sarkar/, "img-citizen-service", "Citizen service centre"],
    [/self-help|community|women|village|csr/, "img-csr-community", "Community programme participants"],
    [/\bai\b|artificial intelligence|model|algorithm/, "img-ai-abstract", "AI concept illustration"],
  ];
  for (const [re, img, title] of scenes) {
    const hits = (lower.match(new RegExp(re.source, "g")) ?? []).length;
    if (hits >= 2 && out.length < 4) {
      out.push({ kind: img === "img-conference" ? "event" : "scene", title, reason: `Mentioned ${hits}× in the copy.`, suggestedImageId: img, caption: `${title} (photo: to be supplied)` });
    }
  }
  return out;
}

export function suggestCaption(article: Article, index: number): string {
  const ops = imageOpportunities(article);
  if (index === 0 && ops[0]?.kind === "portrait") return ops[0].caption;
  const first = sentences(plain(article))[0] ?? article.title;
  const short = first.split(/\s+/).slice(0, 16).join(" ").replace(/[,;:]$/, "");
  return `${short}${short.endsWith(".") ? "" : "."}`;
}

/* ------------------------------------------------- layout recommendation */

export interface TemplateRecommendation {
  template: Template;
  capacity: number;
  score: number;
  fits: boolean;
  reasons: string[];
}

export function recommendTemplates(article: Article, templates: Template[], settings: Settings, trim?: { width: number; height: number }): TemplateRecommendation[] {
  const words = countWords(article.body);
  const hasImage = article.imageIds.length > 0;
  return compatibleTemplates(templates, article.contentType, trim)
    .filter((t) => t.status === "active")
    .map((t) => {
      const capacity = templateCapacity(t, article, settings);
      const fits = capacity >= words;
      const imageFrames = t.frames.filter((f) => f.kind === "image" && !f.optional).length;
      const reasons: string[] = [];
      let score = 50;
      reasons.push(`Designed for ${t.contentTypes.map((c) => CONTENT_TYPE_LABELS[c]).join(", ").toLowerCase()}.`);
      if (fits) {
        score += 30 - Math.min(20, ((capacity - words) / Math.max(words, 1)) * 40);
        reasons.push(`Body capacity ≈ ${capacity} words; article has ${words} — fits on one page.`);
      } else if (capacity === 0) {
        score -= 5;
        reasons.push("Opener only — body continues on a following page.");
      } else {
        score -= Math.min(40, ((words - capacity) / Math.max(words, 1)) * 60);
        reasons.push(`Holds ≈ ${capacity} of ${words} words — needs a continuation page or edits.`);
      }
      if (imageFrames && !hasImage) {
        score -= 12;
        reasons.push(`Requires ${imageFrames} image${imageFrames > 1 ? "s" : ""}; none attached yet.`);
      } else if (imageFrames) reasons.push(`Uses ${imageFrames} image${imageFrames > 1 ? "s" : ""} (${article.imageIds.length} available).`);
      if (t.frames.some((f) => f.bind === "facts" && !f.optional) && !article.facts?.length) {
        score -= 10;
        reasons.push("Expects key facts; none recorded.");
      }
      if (t.frames.some((f) => f.bind === "summary") && !article.summary) reasons.push("Shows a standfirst — generate a summary first.");
      return { template: t, capacity, score: Math.round(score), fits, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

/* -------------------------------------------------------- prepare check */

export interface ReadinessItem {
  label: string;
  ok: boolean;
  required: boolean;
  detail: string;
}

export function readiness(article: Article): ReadinessItem[] {
  const words = countWords(article.body);
  return [
    { label: "Headline", ok: !!article.title.trim(), required: true, detail: article.title || "Missing" },
    { label: "Body text", ok: words >= 60, required: true, detail: `${words} words` },
    { label: "Author name", ok: !!article.author.name.trim(), required: true, detail: article.author.name || "Missing" },
    { label: "Designation", ok: !!article.author.designation?.trim(), required: false, detail: article.author.designation || "Missing" },
    { label: "Deck / subtitle", ok: !!article.subtitle?.trim(), required: false, detail: article.subtitle ? "Present" : "Missing" },
    { label: "Summary / standfirst", ok: !!article.summary?.trim(), required: false, detail: article.summary ? `${countWords(article.summary)} words` : "Missing" },
    { label: "Images", ok: article.imageIds.length > 0, required: false, detail: `${article.imageIds.length} attached` },
    { label: "Captions", ok: article.imageIds.length === 0 || article.captions.filter((c) => c?.trim()).length >= article.imageIds.length, required: false, detail: `${article.captions.filter((c) => c?.trim()).length}/${article.imageIds.length}` },
    { label: "Pull quotes", ok: article.pullQuotes.length > 0, required: false, detail: `${article.pullQuotes.length}` },
    { label: "Editorial approval", ok: article.status === "approved", required: false, detail: article.status.replace("-", " ") },
  ];
}

/* ---------------------------------------------------------- trim proposal */

export interface TrimProposal {
  text: string;
  removed: string[];
  wordsBefore: number;
  wordsAfter: number;
}

/**
 * Propose a shorter version by dropping the lowest-scoring sentences
 * (never the first sentence of a paragraph, never questions or sub-heads).
 * Presented for editorial review — never applied automatically.
 */
export function proposeTrim(body: string, wordsToCut: number): TrimProposal {
  const paras = body.split(/\n\s*\n/);
  const candidates: { p: number; s: string; score: number }[] = [];
  const all = paras.join(" ");
  const kws = keywords(all, 16);
  paras.forEach((para, p) => {
    if (/^(Q:|##)/.test(para.trim())) return;
    const sents = sentences(para.replace(/^A:\s*/, ""));
    sents.slice(1).forEach((s) => {
      const t = tokens(s);
      const hits = t.filter((w) => kws.includes(w)).length;
      candidates.push({ p, s, score: (hits + 1) / Math.sqrt(t.length + 2) });
    });
  });
  candidates.sort((a, b) => a.score - b.score);
  const removed: { p: number; s: string }[] = [];
  let cut = 0;
  for (const c of candidates) {
    if (cut >= wordsToCut) break;
    removed.push(c);
    cut += countWords(c.s);
  }
  const next = paras.map((para, p) => {
    let out = para;
    for (const r of removed.filter((x) => x.p === p)) out = out.replace(r.s, "").replace(/\s{2,}/g, " ");
    return out.trim();
  });
  const text = next.join("\n\n");
  return { text, removed: removed.map((r) => r.s), wordsBefore: countWords(body), wordsAfter: countWords(text) };
}

/** Simulated latency so demo interactions read as a service call. */
export const simulate = <T,>(fn: () => T, ms = 700): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(fn()), ms + Math.round(Math.random() * 300)));
