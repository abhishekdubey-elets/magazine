import { sections as houseSections } from "@/data/seed";
import { ink } from "../design-tokens";
import { makeContext, resolvePage, templateCapacity, type LayoutContext } from "../layout-engine";
import { fitsTrim } from "../templates";
import { countWords } from "../text-engine";
import type { Article, DesignSpec, EditorialFormat, IssuePlan, Page, PlanEntry, PlanEntryKind, Publication, ReferenceProfile, Section, Settings, Template } from "../types";
import { formatFor, type FormatTemplates } from "./formats";
import { FORMAT_LABEL } from "./spec";

/**
 * Issue planner: turns the editor's content selection for a new topic into a
 * page plan that follows the reference's design system — table of contents,
 * running order, page allocation (continuation pages from measured template
 * capacity), reserved advertisements and required images. The plan is data
 * the editor can change before anything is generated; generation refuses to
 * run while the plan has unresolved conflicts.
 */

export interface PlanInput {
  profile: ReferenceProfile;
  spec: DesignSpec;
  formats: FormatTemplates;
  /** Every template available for overrides (workspace + format templates). */
  templates: Template[];
  articles: Article[];
  settings: Settings;
  title: string;
  issueLabel: string;
  topic: string;
  pageCount: number;
  includeAds: boolean;
  /** Selected articles in running order. */
  articleIds: string[];
  /** Editor's format choice per article. */
  formatOverrides: Record<string, EditorialFormat>;
  /** Editor's template choice per article (template id). */
  templateOverrides: Record<string, string>;
  /** Pages reserved for advertisements (1-based), in addition to the reference's IFC/back cover. */
  adPages: number[];
  existing?: IssuePlan;
}

const MAX_CONTINUATIONS = 3;
const NEWS_BRIEFS = 4;

let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`;

interface Unit {
  format: EditorialFormat;
  article: Article;
  storyIds: string[];
  template: Template;
  continuation: Template;
  pages: number;
  oversetWords: number;
  reason: string;
  requiredImages: number;
  imagesAvailable: number;
}

/** Word capacity of the frames bound to one story field on a multi-story template. */
function storyCapacity(template: Template, bind: string, sample: Article, settings: Settings) {
  const frames = template.frames.filter((f) => f.bind === bind).map((f) => ({ ...f, bind: "body" as const }));
  if (!frames.length) return 0;
  return templateCapacity({ ...template, frames }, sample, settings);
}

export function requiredImages(t: Template) {
  return t.frames.filter((f) => f.kind === "image" && !f.optional && !f.defaultImageId).length;
}

/** Templates an article of this format may use on the reference trim. */
export function templateChoices(input: Pick<PlanInput, "templates" | "formats" | "profile">, format: EditorialFormat, article: Article): Template[] {
  const trim = input.profile.trim;
  const fmt = input.formats.byFormat[format];
  const others = input.templates.filter((t) => t.id !== fmt.id && t.status !== "archived" && fitsTrim(t, trim) && !t.id.endsWith("continuation") && (t.format === format || t.contentTypes.includes(article.contentType)));
  return [fmt, ...others];
}

function unitFor(input: PlanInput, article: Article, briefs: Article[], forced?: EditorialFormat): Unit {
  const format = forced ?? input.formatOverrides[article.id] ?? formatFor(article.contentType);
  const chosen = input.templateOverrides[article.id];
  const template = (chosen && input.templates.find((t) => t.id === chosen)) || input.formats.byFormat[format];
  const continuation = input.formats.support.continuation;
  const words = countWords(article.body);
  const cap = templateCapacity(template, article, input.settings);
  const contCap = Math.max(1, templateCapacity(continuation, article, input.settings));
  const extra = Math.max(0, words - cap);
  const cont = format === "news-page" ? 0 : Math.min(MAX_CONTINUATIONS, Math.ceil(extra / contCap));
  const overset = Math.max(0, extra - cont * contCap);
  const reasons = [template.name.startsWith(FORMAT_LABEL[format]) ? template.name : `${FORMAT_LABEL[format]} — ${template.name}`, `${words} words, template holds ≈ ${cap}`];
  if (forced) reasons.unshift(`Too long for a news page lead — planned as a ${FORMAT_LABEL[format].toLowerCase()}`);
  if (cont) reasons.push(`${cont} continuation page${cont > 1 ? "s" : ""} (≈ ${contCap} words each)`);
  if (format === "news-page" && briefs.length) reasons.push(`${briefs.length} brief${briefs.length > 1 ? "s" : ""}: ${briefs.map((b) => b.title).join("; ")}`);
  return {
    format,
    article,
    storyIds: briefs.map((b) => b.id),
    template,
    continuation,
    pages: 1 + cont,
    oversetWords: overset,
    reason: reasons.join(" · "),
    requiredImages: requiredImages(template),
    imagesAvailable: article.imageIds.length,
  };
}

/** Group the selected articles into page units (news reports share a page). */
function units(input: PlanInput): Unit[] {
  const byId = new Map(input.articles.map((a) => [a.id, a]));
  const selected = input.articleIds.map((id) => byId.get(id)).filter((a): a is Article => !!a);
  const out: Unit[] = [];
  let news: Article[] = [];
  const newsTemplate = input.formats.byFormat["news-page"];
  const flushNews = () => {
    while (news.length) {
      const lead = news.reduce((m, a) => (countWords(a.body) > countWords(m.body) ? a : m));
      const rest = news.filter((a) => a !== lead);
      // A report too long for the lead frame gets a page of its own (approved alternate layout) rather than hidden text.
      if (countWords(lead.body) > templateCapacity(newsTemplate, lead, input.settings) && !input.templateOverrides[lead.id]) {
        out.push(unitFor(input, lead, [], "feature"));
        news = rest;
        continue;
      }
      const briefs = rest.slice(0, NEWS_BRIEFS);
      out.push(unitFor(input, lead, briefs));
      news = rest.slice(NEWS_BRIEFS);
    }
  };
  for (const a of selected) {
    const format = input.formatOverrides[a.id] ?? formatFor(a.contentType);
    if (format === "news-page") {
      news.push(a);
      continue;
    }
    flushNews();
    out.push(unitFor(input, a, []));
  }
  flushNews();
  // Briefs on a news page are checked against their own frames.
  for (const u of out) {
    if (u.format !== "news-page") continue;
    u.storyIds.forEach((id, i) => {
      const brief = byId.get(id)!;
      const cap = storyCapacity(u.template, `story.${i + 1}.body`, brief, input.settings);
      const w = countWords(brief.body);
      if (w > cap) u.oversetWords += w - cap;
    });
  }
  return out;
}

export function buildIssuePlan(input: PlanInput): IssuePlan {
  const N = Math.max(4, Math.round(input.pageCount));
  const now = new Date().toISOString();
  const ref = input.profile;
  const refHas = (t: string) => ref.pages.some((p) => p.type === t);
  const notes: string[] = [];
  const unresolved: string[] = [];
  const fixed = new Map<number, PlanEntry>();
  const entry = (number: number, kind: PlanEntryKind, title: string, extra: Partial<PlanEntry> = {}): PlanEntry => ({
    id: uid("plan"),
    number,
    kind,
    title,
    requiredImages: 0,
    imagesAvailable: 0,
    ...extra,
  });

  fixed.set(1, entry(1, "cover", "Front cover", { templateId: input.formats.support.cover.id, sectionId: "sec-front", reserved: true, reason: "Every issue opens with the cover" }));
  const ads = input.includeAds && refHas("advertisement");
  if (ads) fixed.set(2, entry(2, "advertisement", "Inside front cover advertisement", { templateId: input.formats.support.advertisement.id, sectionId: "sec-partners", reserved: true, reason: "The reference carries an advertisement inside the front cover" }));
  if (refHas("contents") && N >= 8) {
    const n = ads ? 3 : 2;
    fixed.set(n, entry(n, "contents", "Contents", { templateId: input.formats.support.contents.id, sectionId: "sec-front", reserved: true, reason: "The reference has a contents page near the front" }));
  }
  const lastIsAd = ads && [...ref.pages].sort((a, b) => a.number - b.number).at(-1)?.type === "advertisement";
  fixed.set(N, lastIsAd ? entry(N, "advertisement", "Back cover advertisement", { templateId: input.formats.support.advertisement.id, sectionId: "sec-partners", reserved: true, reason: "The reference closes with an advertisement" }) : entry(N, "closing", "Back cover", { templateId: input.formats.support.closing.id, sectionId: "sec-front", reserved: true, reason: "Closing page" }));
  for (const n of input.adPages) {
    if (n < 2 || n >= N || fixed.has(n)) continue;
    fixed.set(n, entry(n, "advertisement", `Advertisement (page ${n})`, { templateId: input.formats.support.advertisement.id, sectionId: "sec-partners", reserved: true, reason: "Reserved by the editor" }));
  }

  const slots: number[] = [];
  for (let n = 1; n <= N; n++) if (!fixed.has(n)) slots.push(n);
  const us = units(input);
  const entries: PlanEntry[] = [...fixed.values()];
  let i = 0;
  for (const u of us) {
    if (i + u.pages > slots.length) {
      const need = us.slice(us.indexOf(u)).reduce((n, x) => n + x.pages, 0) - (slots.length - i);
      unresolved.push(`Not enough pages: ${need} more page${need > 1 ? "s" : ""} needed for the remaining content (from “${u.article.title}”). Raise the page count, remove articles or choose shorter layouts.`);
      break;
    }
    const first = entry(slots[i], u.format, u.article.title, {
      articleId: u.article.id,
      storyIds: u.storyIds.length ? u.storyIds : undefined,
      templateId: u.template.id,
      sectionId: u.article.sectionId,
      reason: u.reason,
      requiredImages: u.requiredImages,
      imagesAvailable: u.imagesAvailable,
      oversetWords: u.pages === 1 ? u.oversetWords : 0,
    });
    entries.push(first);
    i++;
    for (let c = 1; c < u.pages; c++) {
      entries.push(entry(slots[i], "continuation", `${u.article.title} (continued)`, { articleId: u.article.id, templateId: u.continuation.id, sectionId: u.article.sectionId, continuesId: first.id, reason: "Story continues from the previous page", oversetWords: c === u.pages - 1 ? u.oversetWords : 0 }));
      i++;
    }
    if (u.oversetWords > 0) unresolved.push(`“${u.article.title}” has about ${u.oversetWords} words more than ${u.pages} page${u.pages > 1 ? "s" : ""} can hold (${FORMAT_LABEL[u.format]}). Choose a roomier template, allow more pages, or trim the copy with the editor.`);
    if (u.requiredImages > u.imagesAvailable) notes.push(`“${u.article.title}” needs ${u.requiredImages} image${u.requiredImages > 1 ? "s" : ""}; ${u.imagesAvailable} attached.`);
  }
  for (; i < slots.length; i++) {
    entries.push(entry(slots[i], "feature", "Open slot", { templateId: input.formats.byFormat.feature.id, reason: "No content planned for this page yet", sectionId: undefined }));
  }
  entries.sort((a, b) => a.number - b.number);
  // Sections flow forward across pages without one.
  for (let k = 1; k < entries.length; k++) if (!entries[k].sectionId && entries[k].kind !== "advertisement") entries[k].sectionId = entries[k - 1].sectionId;
  const open = entries.filter((e) => e.title === "Open slot").length;
  if (open) notes.push(`${open} open page${open > 1 ? "s" : ""} — add content or reduce the page count.`);
  if (N % 4) notes.push(`${N} pages is not a multiple of 4 (saddle-stitch imposition needs multiples of 4).`);
  const formatsUsed = [...new Set(us.map((u) => u.format))];
  notes.unshift(`${us.length} content unit${us.length === 1 ? "" : "s"} across ${entries.filter((e) => e.articleId).length} pages: ${formatsUsed.map((f) => FORMAT_LABEL[f]).join(", ") || "none"}.`);

  return {
    id: input.existing?.id ?? uid("issue"),
    designSpecId: input.spec.id,
    designSpecVersion: input.spec.version,
    referenceId: input.profile.id,
    topic: input.topic.trim(),
    title: input.title.trim() || input.profile.name,
    issueLabel: input.issueLabel.trim() || "New issue",
    pageCount: N,
    entries,
    articleIds: [...input.articleIds],
    includeAds: input.includeAds,
    status: "draft",
    notes,
    unresolved,
    createdAt: input.existing?.createdAt ?? now,
    updatedAt: now,
  };
}

/** Table of contents from a plan (title + page), skipping furniture pages. */
export function planToc(plan: IssuePlan, articles: Article[]) {
  const byId = new Map(articles.map((a) => [a.id, a]));
  return plan.entries
    .filter((e) => e.articleId && e.kind !== "continuation")
    .map((e) => {
      const a = byId.get(e.articleId!);
      const last = plan.entries.filter((x) => x.continuesId === e.id).map((x) => x.number).sort((a, b) => a - b).at(-1);
      return { number: e.number, title: a?.title ?? e.title, format: e.kind as EditorialFormat, author: a?.author.name ?? "", pages: last ? `${e.number}–${last}` : String(e.number), stories: (e.storyIds ?? []).map((id) => byId.get(id)?.title ?? id) };
    });
}

/* ---------------------------------------------------------- generation */

export interface GenerateResult {
  ok: boolean;
  publication: Publication;
  pages: Page[];
  templates: Template[];
  /** Blocking problems found while laying out (nothing should be imported while these remain). */
  problems: string[];
  /** Measured overset per article after layout. */
  overset: { articleId: string; title: string; words: number; pages: number[] }[];
  report: string[];
}

/**
 * Generate the issue from an approved plan: publication, pages and templates.
 * Text is never cut or shrunk; stories that still overflow their planned pages
 * are reported as problems and generation is marked not ok.
 */
export function generateIssue(plan: IssuePlan, input: PlanInput, fontsVersion: number, actor: string): GenerateResult {
  const now = new Date().toISOString();
  const pubId = `pub-${Date.now().toString(36)}`;
  const byId = new Map(input.articles.map((a) => [a.id, a]));
  const palette = input.spec.identity.palette.value;
  const refSections: Section[] = input.spec.structure.sections.value.slice(0, 10).map((s, i) => ({ id: `sec-${input.profile.id}-${i}`, name: s.name, color: palette[i % Math.max(1, palette.length)] ?? ink.blue }));
  const sections = [...refSections, ...houseSections];
  const problems: string[] = [...plan.unresolved];
  if (plan.status !== "approved" && plan.status !== "generated") problems.unshift("The issue plan has not been approved yet.");

  const pageTypeFor = (kind: PlanEntryKind): Page["pageType"] => {
    switch (kind) {
      case "cover":
        return "cover";
      case "contents":
        return "contents";
      case "advertisement":
        return "advertisement";
      case "closing":
        return "closing";
      case "interview":
        return "interview";
      case "government-perspective":
        return "leadership-message";
      case "feature":
        return "feature";
      default:
        return "article";
    }
  };
  let ad = 0;
  const pages: Page[] = plan.entries.map((e) => {
    const article = e.articleId ? byId.get(e.articleId) : undefined;
    const imageOverrides: Record<string, string | null> = {};
    if (e.kind === "advertisement") imageOverrides["image.0"] = ad++ % 2 ? "img-ad-bank" : "img-ad-cloud";
    const ready = e.kind === "cover" || e.kind === "contents" || e.kind === "advertisement" || e.kind === "closing" || !!article;
    return {
      id: `${pubId}-p${e.number}`,
      publicationId: pubId,
      number: e.number,
      pageType: pageTypeFor(e.kind),
      title: e.kind === "closing" ? "Back cover" : e.title,
      sectionId: e.sectionId,
      templateId: e.templateId,
      articleId: e.kind === "closing" ? input.articles.find((a) => a.id === "art-closing")?.id : article?.id,
      storyIds: e.storyIds,
      format: (["interview", "feature", "government-perspective", "event-report", "news-page", "company-profile"] as string[]).includes(e.kind) ? (e.kind as EditorialFormat) : undefined,
      status: ready ? "draft" : "planned",
      contentOverrides: {},
      imageOverrides,
      frameOverrides: {},
      generatedAt: ready ? now : undefined,
      updatedAt: now,
    };
  });

  const spec = input.spec;
  const g = spec.page.margins.value;
  const publication: Publication = {
    id: pubId,
    title: plan.title,
    masthead: plan.title.replace(/\s+/g, ""),
    issueLabel: plan.issueLabel,
    issueDate: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
    stage: "layout",
    description: `${plan.topic ? `${plan.topic}. ` : ""}Designed like “${input.profile.name}” (design spec v${spec.version}) with Reference-to-Magazine Studio.`,
    website: "egov.eletsonline.com",
    tagline: "The ultimate resource for Governance Innovations",
    sections,
    pageIds: pages.map((p) => p.id),
    trim: { ...spec.page.trim.value },
    bleed: spec.page.bleed.value,
    grid: { marginTop: g.top, marginBottom: g.bottom, marginInside: g.inside, marginOutside: g.outside, columns: spec.page.columns.value, gutter: spec.page.gutter.value },
    referenceId: input.profile.id,
    designSpecId: spec.id,
    designSpecVersion: spec.version,
    plan: { ...plan, status: "generated", generatedAt: now },
    updatedAt: now,
    updatedBy: actor,
    coverColor: spec.identity.accent.value,
  };

  // Measure the real layout: stories that overflow their planned pages are blockers.
  const templates = [...input.formats.templates, ...input.templates.filter((t) => !input.formats.templates.some((f) => f.id === t.id))];
  const ctx: LayoutContext = makeContext(publication, pages, input.articles, templates, input.settings, fontsVersion);
  const overset: GenerateResult["overset"] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    if (!p.articleId || seen.has(p.articleId) || p.status === "planned") continue;
    seen.add(p.articleId);
    const story = pages.filter((x) => x.articleId === p.articleId).sort((a, b) => a.number - b.number);
    const last = resolvePage(ctx, story[story.length - 1]);
    const briefs = resolvePage(ctx, p).elements.filter((e) => e.frame.bind?.startsWith("story.") && (e.oversetWords ?? 0) > 0);
    const words = last.storyOversetWords + briefs.reduce((n, e) => n + (e.oversetWords ?? 0), 0);
    if (words > 0) {
      const title = byId.get(p.articleId)?.title ?? p.title;
      overset.push({ articleId: p.articleId, title, words, pages: story.map((s) => s.number) });
      problems.push(`“${title}”: about ${words} words do not fit on page${story.length > 1 ? "s" : ""} ${story.map((s) => s.number).join(", ")}. Nothing was cut — allow another page or a roomier template.`);
    }
  }
  const report = [
    `${pages.length} pages generated from the plan; ${pages.filter((p) => p.articleId).length} carry content.`,
    ...input.formats.notes,
    ...(overset.length ? [`${overset.length} stor${overset.length === 1 ? "y" : "ies"} still overflow — see problems.`] : ["All stories fit their planned pages."]),
  ];
  return { ok: problems.length === 0, publication, pages, templates: input.formats.templates, problems, overset, report };
}
