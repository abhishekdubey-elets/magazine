import { ACCENT, paragraphStyles } from "./design-tokens";
import { fitFrame, blockFill, parseBody, remainingWords, type Cursor } from "./text-engine";
import type {
  Article,
  BindKey,
  FrameSpec,
  Page,
  Publication,
  ResolvedElement,
  Section,
  Settings,
  Template,
  TextStyle,
} from "./types";

/**
 * Layout engine: resolves a page (template geometry + article content +
 * page overrides) into positioned elements. Pure and deterministic, so the
 * same output feeds the renderer, QA and the export packages.
 */

export interface LayoutContext {
  publication: Publication;
  pages: Page[];
  articles: Record<string, Article>;
  templates: Record<string, Template>;
  settings: Settings;
  /** Bumped when web fonts load so measurements are recomputed. */
  fontsVersion: number;
}

export interface ResolvedPage {
  page: Page;
  template?: Template;
  article?: Article;
  section?: Section;
  accent: string;
  isLeft: boolean;
  elements: ResolvedElement[];
  /** Words of the story that did not fit anywhere (reported on the story's last page). */
  storyOversetWords: number;
  /** This page continues a story from an earlier page. */
  continuesFrom?: number;
  /** The story continues on a later page. */
  continuesTo?: number;
}

const DEFAULT_STYLE: TextStyle = paragraphStyles.body;

export function sectionFor(pub: Publication, id?: string) {
  return pub.sections.find((s) => s.id === id);
}

export function accentTint(accent: string) {
  return `color-mix(in srgb, ${accent} 9%, white)`;
}

function resolveStyle(frame: FrameSpec, page: Page, accent: string): TextStyle {
  const base = (frame.styleId && paragraphStyles[frame.styleId]) || DEFAULT_STYLE;
  const merged: TextStyle = { ...base, ...frame.style, ...page.frameOverrides[frame.id]?.style };
  if (merged.color === ACCENT) merged.color = accent;
  return merged;
}

/** The article's value for a bind key (before page overrides). */
export function articleValue(article: Article | undefined, bind: BindKey, pub: Publication): string {
  if (!article) return "";
  const idx = (k: string) => Number(k.split(".")[1] ?? 0);
  switch (bind) {
    case "title":
      return article.title;
    case "subtitle":
      return article.subtitle ?? "";
    case "body":
      return article.body;
    case "summary":
      return article.summary ?? "";
    case "author.name":
      return article.author.name ?? "";
    case "author.designation":
      return article.author.designation ?? "";
    case "author.organisation":
      return article.author.organisation ?? "";
    case "author.role":
      return [article.author.designation, article.author.organisation].filter(Boolean).join(", ");
    case "author.bio":
      return article.author.bio ?? "";
    case "byline":
      if (article.interviewer) return `In conversation with ${article.interviewer}`;
      if (!article.author.name) return "";
      return `By ${article.author.name}${article.author.designation ? `, ${article.author.designation}` : ""}`;
    case "section":
      return sectionFor(pub, article.sectionId)?.name ?? "";
    case "facts":
      return (article.facts ?? []).map((f) => `${f.value}\n${f.label}`).join("\n");
    default:
      if (bind.startsWith("caption.")) return article.captions[idx(bind)] ?? "";
      if (bind.startsWith("pullquote.")) return article.pullQuotes[idx(bind)] ?? "";
      return "";
  }
}

export function overrideKey(frame: FrameSpec): string {
  return frame.bind && frame.bind !== "static" ? frame.bind : `frame:${frame.id}`;
}

function frameText(frame: FrameSpec, page: Page, article: Article | undefined, pub: Publication): { text: string; overridden: boolean } {
  const key = overrideKey(frame);
  const o = page.contentOverrides[key];
  if (o !== undefined) return { text: o, overridden: true };
  if (!frame.bind || frame.bind === "static") return { text: frame.text ?? "", overridden: false };
  if (!article) {
    if (frame.bind === "section") return { text: sectionFor(pub, page.sectionId)?.name ?? "", overridden: false };
    return { text: frame.text ?? "", overridden: false };
  }
  return { text: articleValue(article, frame.bind, pub), overridden: false };
}

export function frameImage(frame: FrameSpec, page: Page, article: Article | undefined, ctx?: LayoutContext): string | null | undefined {
  const bind = frame.bind ?? "image.0";
  if (bind in page.imageOverrides) return page.imageOverrides[bind];
  const story = storyBind(bind);
  if (story && ctx) {
    const a = storyArticle(ctx, page, story.n);
    return a?.imageIds[0] ?? frame.defaultImageId;
  }
  if (article && bind.startsWith("image.")) {
    const id = article.imageIds[Number(bind.split(".")[1])];
    if (id) return id;
  }
  return frame.defaultImageId;
}

/* ------------------------------------------------- multi-story pages */

/** Parse a `story.N.field` binding (news pages). */
export function storyBind(bind: string | undefined): { n: number; field: string } | null {
  const m = bind?.match(/^story\.(\d)\.(\w+)$/);
  return m ? { n: Number(m[1]), field: m[2] } : null;
}

/** The N-th (1-based) secondary story of a page. */
export function storyArticle(ctx: LayoutContext, page: Page, n: number): Article | undefined {
  const id = page.storyIds?.[n - 1];
  return id ? ctx.articles[id] : undefined;
}

const STORY_FIELD: Record<string, BindKey> = { title: "title", subtitle: "subtitle", body: "body", byline: "byline", caption: "caption.0", summary: "summary" };

/** Pages carrying a story, in reading order. */
export function storyPages(pages: Page[], articleId: string) {
  return pages
    .filter((p) => p.articleId === articleId && p.templateId && p.status !== "planned")
    .sort((a, b) => a.number - b.number);
}

/** Story text used for threading: a body override on the story's first page wins. */
export function storyBody(pages: Page[], article: Article) {
  const first = storyPages(pages, article.id)[0];
  return first?.contentOverrides.body ?? article.body;
}

interface StoryLayout {
  slices: Map<string, ResolvedElement["slices"]>; // key pageId|frameId
  fit: Map<string, number>;
  overset: number;
  lastFrameKey?: string;
  firstPage?: number;
  lastPage?: number;
  pagesWithText: number[];
}

const storyCache = new Map<string, StoryLayout>();

function bodyFrames(template: Template) {
  return template.frames.filter((f) => f.kind === "text" && f.bind === "body");
}

function geometry(frame: FrameSpec, page: Page) {
  const o = page.frameOverrides[frame.id] ?? {};
  return { x: o.x ?? frame.x, y: o.y ?? frame.y, w: o.w ?? frame.w, h: o.h ?? frame.h, columns: o.columns ?? frame.columns ?? 1 };
}

const DROP_CAP_TEMPLATES = new Set(["tpl-article-standard", "tpl-feature-hero", "tpl-case-study", "tpl-continuation", "tpl-editors-note"]);

function layoutStory(ctx: LayoutContext, article: Article): StoryLayout {
  const pages = storyPages(ctx.pages, article.id);
  const body = storyBody(ctx.pages, article);
  const sig = [
    article.id,
    body.length,
    hash(body),
    ctx.fontsVersion,
    ctx.settings.page.gutter,
    ...pages.map((p) => {
      const t = ctx.templates[p.templateId!];
      return `${p.id}:${t?.id}:${t?.updatedAt}:${JSON.stringify(p.frameOverrides)}`;
    }),
  ].join("|");
  const cached = storyCache.get(sig);
  if (cached) return cached;

  const paras = parseBody(body);
  const result: StoryLayout = { slices: new Map(), fit: new Map(), overset: 0, pagesWithText: [] };
  let cursor: Cursor = { p: 0, w: 0 };
  for (const page of pages) {
    const template = ctx.templates[page.templateId!];
    if (!template) continue;
    const accent = sectionFor(ctx.publication, page.sectionId ?? article.sectionId)?.color ?? "#1f4ea1";
    for (const frame of bodyFrames(template)) {
      const g = geometry(frame, page);
      const style = resolveStyle(frame, page, accent);
      const key = `${page.id}|${frame.id}`;
      const fit = fitFrame(
        paras,
        cursor,
        { width: g.w, height: g.h, columns: g.columns, gutter: frame.gutter ?? ctx.settings.page.gutter },
        style,
        DROP_CAP_TEMPLATES.has(template.id) && article.contentType !== "interview",
      );
      result.slices.set(key, fit.slices);
      result.fit.set(key, fit.linesAvailable ? fit.linesUsed / fit.linesAvailable : 0);
      result.lastFrameKey = key;
      if (fit.slices.length) {
        result.pagesWithText.push(page.number);
        result.firstPage ??= page.number;
        result.lastPage = page.number;
      }
      cursor = fit.end;
    }
  }
  result.overset = remainingWords(paras, cursor);
  if (storyCache.size > 300) storyCache.clear();
  storyCache.set(sig, result);
  return result;
}

function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h;
}

export function resolvePage(ctx: LayoutContext, page: Page): ResolvedPage {
  const template = page.templateId ? ctx.templates[page.templateId] : undefined;
  const article = page.articleId ? ctx.articles[page.articleId] : undefined;
  const section = sectionFor(ctx.publication, page.sectionId ?? article?.sectionId);
  const accent = section?.color ?? "#1f4ea1";
  const isLeft = page.number % 2 === 0;
  const resolved: ResolvedPage = { page, template, article, section, accent, isLeft, elements: [], storyOversetWords: 0 };
  if (!template) return resolved;

  const generated = page.status !== "planned";
  const story = article && generated ? layoutStory(ctx, article) : undefined;

  if (story) {
    const nums = story.pagesWithText;
    const idx = nums.indexOf(page.number);
    if (idx > 0) resolved.continuesFrom = nums[idx - 1];
    if (idx >= 0 && idx < nums.length - 1) resolved.continuesTo = nums[idx + 1];
  }

  template.frames.forEach((frame) => {
    const o = page.frameOverrides[frame.id] ?? {};
    const g = geometry(frame, page);
    const style = resolveStyle(frame, page, accent);
    const fill = frame.fill === "accent-tint" ? accentTint(accent) : frame.fill === ACCENT ? accent : frame.fill;
    const el: ResolvedElement = {
      frame,
      id: frame.id,
      kind: frame.kind,
      role: frame.role,
      ...g,
      style,
      gutter: frame.gutter ?? ctx.settings.page.gutter,
      text: "",
      imageFit: o.imageFit ?? frame.imageFit ?? ctx.settings.images.defaultFit,
      focusX: o.focusX ?? 50,
      focusY: o.focusY ?? frame.focusY ?? 50,
      overridden: Object.keys(o).length > 0,
      textOverridden: false,
      fill,
      background: frame.background,
      empty: false,
    };

    const sb = storyBind(frame.bind);
    if (frame.kind === "image") {
      el.imageId = generated || frame.defaultImageId ? frameImage(frame, page, article, ctx) : undefined;
      el.empty = !el.imageId;
    } else if (frame.kind === "text" && sb) {
      // Secondary story on a multi-story page: its own article, fitted into this frame only.
      const sa = storyArticle(ctx, page, sb.n);
      const override = page.contentOverrides[overrideKey(frame)];
      if (sb.field === "body") {
        const body = override ?? sa?.body ?? "";
        if (generated && body) {
          const paras = parseBody(body);
          const fit = fitFrame(paras, { p: 0, w: 0 }, { width: g.w, height: g.h, columns: g.columns, gutter: frame.gutter ?? ctx.settings.page.gutter }, style, false);
          el.slices = fit.slices;
          el.text = fit.slices.map((s) => s.text).join("\n\n");
          el.fit = fit.linesAvailable ? fit.linesUsed / fit.linesAvailable : 0;
          const left = remainingWords(paras, fit.end);
          if (left > 0) {
            el.oversetWords = left;
            el.fit = Math.max(el.fit, 1.01);
          }
        }
        el.textOverridden = override !== undefined;
        el.empty = !(el.slices?.length);
      } else {
        const text = override ?? (sa && generated ? articleValue(sa, STORY_FIELD[sb.field] ?? "title", ctx.publication) : "");
        el.text = text;
        el.textOverridden = override !== undefined;
        el.empty = !text.trim();
        if (text) {
          const inset = frame.inset ?? 0;
          el.fit = blockFill(text, { width: g.w - inset * 2, height: g.h - inset * 2 }, style);
        }
      }
    } else if (frame.kind === "text") {
      if (frame.bind === "body") {
        const key = `${page.id}|${frame.id}`;
        el.slices = story?.slices.get(key) ?? [];
        el.fit = story?.fit.get(key) ?? 0;
        el.text = el.slices.map((s) => s.text).join("\n\n");
        el.textOverridden = page.contentOverrides.body !== undefined;
        el.empty = el.slices.length === 0;
        if (story && story.lastFrameKey === key && story.overset > 0) {
          el.oversetWords = story.overset;
          el.fit = Math.max(el.fit, 1.01);
          resolved.storyOversetWords = story.overset;
        }
      } else {
        const showContent = generated || !article || !frame.bind || frame.bind === "static";
        const { text, overridden } = showContent ? frameText(frame, page, article, ctx.publication) : { text: "", overridden: false };
        el.text = text;
        el.textOverridden = overridden;
        el.empty = !text.trim();
        if (frame.bind !== "facts" && text) {
          const inset = frame.inset ?? 0;
          const box = { width: g.w - inset * 2, height: g.h - inset * 2 };
          el.fit = blockFill(text, box, style);
          // Display lines size themselves to their copy, as a designer would.
          if (frame.autoFit && el.fit > 0.96 && !o.style?.size) {
            for (let k = 0.95; k >= 0.3; k -= 0.05) {
              const s = { ...style, size: style.size * k, leading: style.leading * k };
              el.style = s;
              el.fit = blockFill(text, box, s);
              if (el.fit <= 0.96) break;
            }
          }
        }
        if (frame.bind === "facts") el.empty = !article?.facts?.length;
      }
    } else if (frame.kind === "stats") {
      el.empty = !article?.facts?.length;
    }
    resolved.elements.push(el);
  });
  return resolved;
}

export function makeContext(
  publication: Publication,
  pages: Page[],
  articles: Article[],
  templates: Template[],
  settings: Settings,
  fontsVersion: number,
): LayoutContext {
  return {
    publication,
    pages,
    articles: Object.fromEntries(articles.map((a) => [a.id, a])),
    templates: Object.fromEntries(templates.map((t) => [t.id, t])),
    settings,
    fontsVersion,
  };
}

/** Body capacity of a template in words, measured with a sample story. */
export function templateCapacity(template: Template, sample: Article, settings: Settings): number {
  // Repeat the sample so capacity is never capped by the sample's own length.
  const one = parseBody(sample.body);
  const paras = [...one];
  if (one.length) while (remainingWords(paras, { p: 0, w: 0 }) < 2000) paras.push(...one);
  let cursor: Cursor = { p: 0, w: 0 };
  const total = remainingWords(paras, cursor);
  for (const frame of bodyFrames(template)) {
    const style = { ...((frame.styleId && paragraphStyles[frame.styleId]) || DEFAULT_STYLE), ...frame.style };
    cursor = fitFrame(paras, cursor, { width: frame.w, height: frame.h, columns: frame.columns ?? 1, gutter: frame.gutter ?? settings.page.gutter }, style, false).end;
  }
  return total - remainingWords(paras, cursor);
}
