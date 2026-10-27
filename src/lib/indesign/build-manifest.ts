"use client";

import { ink, MM_PER_PT, paragraphStyles } from "../design-tokens";
import { findImage, linkName } from "../images";
import { resolvePage, storyArticle, storyBind, storyBody, type LayoutContext, type ResolvedPage } from "../layout-engine";
import { measureMm, parseBody } from "../text-engine";
import { tocEntries } from "../toc";
import type { FontRole, ImageAsset, ResolvedElement, TextStyle } from "../types";
import {
  MANIFEST_SCHEMA,
  type Bounds,
  type IdItem,
  type IdLink,
  type IdPage,
  type IdParagraph,
  type IdParagraphStyle,
  type IdRun,
  type IdStory,
  type IdGradient,
  type IdParent,
  type IdText,
  type InDesignManifestV2,
} from "./manifest-types";

/* ------------------------------------------------------------- fonts */

export type FontFamilyMap = Partial<Record<FontRole, string>>;

/** Weight → style name for the default (Google) families. House fonts use the same naming. */
const WEIGHTS: Record<FontRole, { family: string; styles: Record<number, string> }> = {
  body: { family: "Roboto", styles: { 100: "Thin", 300: "Light", 400: "Regular", 500: "Medium", 700: "Bold", 900: "Black" } },
  headline: { family: "Roboto Condensed", styles: { 300: "Light", 400: "Regular", 500: "Medium", 700: "Bold", 800: "ExtraBold", 900: "Black" } },
  display: { family: "Bebas Neue", styles: { 400: "Regular" } },
  serif: { family: "Source Serif 4", styles: { 300: "Light", 400: "Regular", 600: "Semibold", 700: "Bold" } },
  sans: { family: "Inter", styles: { 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black" } },
};

export const DEFAULT_FONT_FAMILIES: Record<FontRole, string> = Object.fromEntries(
  (Object.keys(WEIGHTS) as FontRole[]).map((r) => [r, WEIGHTS[r].family]),
) as Record<FontRole, string>;

export function resolveFont(role: FontRole, weight: number, italic: boolean, map: FontFamilyMap = {}) {
  const def = WEIGHTS[role];
  const weights = Object.keys(def.styles).map(Number);
  const nearest = weights.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a), weights[0]);
  const base = def.styles[nearest];
  const fontStyle = italic ? (base === "Regular" ? "Italic" : `${base} Italic`) : base;
  return { family: map[role]?.trim() || def.family, fontStyle };
}

/* ------------------------------------------------------------ colour */

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

/** CSS colour → { hex, opacity }. Handles hex, rgb(a), the app's color-mix tints and gradients (first stop). */
export function cssColor(input: string | undefined): { hex: string; opacity: number } | undefined {
  if (!input) return undefined;
  const c = input.trim().toLowerCase();
  if (c === "transparent" || c === "none") return undefined;
  if (c === "white") return { hex: "#ffffff", opacity: 100 };
  if (c === "black") return { hex: "#000000", opacity: 100 };
  const mix = c.match(/color-mix\(in srgb,\s*(#[0-9a-f]{3,8})\s+(\d+(?:\.\d+)?)%,\s*white\)/);
  if (mix) {
    const base = cssColor(mix[1])!.hex;
    const p = Number(mix[2]) / 100;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16));
    return { hex: `#${hex2(r * p + 255 * (1 - p))}${hex2(g * p + 255 * (1 - p))}${hex2(b * p + 255 * (1 - p))}`, opacity: 100 };
  }
  const h = c.match(/#([0-9a-f]{3,8})\b/);
  const rgb = c.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/);
  // For gradients, use whichever colour stop comes first.
  const hIdx = h?.index ?? Infinity;
  const rIdx = rgb?.index ?? Infinity;
  if (rgb && rIdx <= hIdx) {
    return { hex: `#${hex2(+rgb[1])}${hex2(+rgb[2])}${hex2(+rgb[3])}`, opacity: rgb[4] !== undefined ? Math.round(Number(rgb[4]) * 100) : 100 };
  }
  if (h) {
    let v = h[1];
    if (v.length === 3) v = v.split("").map((x) => x + x).join("");
    const a = v.length === 8 ? Math.round((parseInt(v.slice(6, 8), 16) / 255) * 100) : 100;
    return { hex: `#${v.slice(0, 6)}`, opacity: a };
  }
  return undefined;
}

/** CSS linear-gradient → InDesign gradient (angle + colour/opacity stops). */
export function cssGradient(input: string | undefined): IdGradient | undefined {
  if (!input || !/linear-gradient/i.test(input)) return undefined;
  const inner = input.slice(input.indexOf("(") + 1, input.lastIndexOf(")"));
  // Split on commas that are not inside rgb()/rgba().
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of inner) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  parts.push(cur.trim());
  let css = 180;
  if (/deg$/.test(parts[0])) css = parseFloat(parts.shift()!);
  else if (/^to /.test(parts[0])) {
    const dir = parts.shift()!;
    css = dir.includes("right") ? 90 : dir.includes("left") ? 270 : dir.includes("top") ? 0 : 180;
  }
  const stops = parts
    .map((p, i, all) => {
      const pos = p.match(/(-?\d+(?:\.\d+)?)%\s*$/);
      const c = cssColor(pos ? p.slice(0, pos.index) : p);
      if (!c) return null;
      return { color: c.hex, opacity: c.opacity, location: pos ? Number(pos[1]) : all.length > 1 ? (i / (all.length - 1)) * 100 : 0 };
    })
    .filter((s): s is { color: string; opacity: number; location: number } => !!s);
  if (stops.length < 2) return undefined;
  // CSS 90deg points right (InDesign 0); CSS 180deg points down (InDesign -90).
  return { angle: 90 - css, stops };
}

/* ------------------------------------------------------------ builder */

const pt = (mm: number) => Math.round((mm / MM_PER_PT) * 100) / 100;
const box = (x: number, y: number, w: number, h: number): Bounds => [pt(y), pt(x), pt(y + h), pt(x + w)];

export interface ManifestOptions {
  fontMap?: FontFamilyMap;
}

const DROP_CAP_LINES = 3;

class Builder {
  styles: Record<string, IdParagraphStyle> = {};
  private sigs = new Map<string, string>();
  fonts = new Map<string, { family: string; fontStyle: string }>();
  links = new Map<string, IdLink>();

  constructor(
    private ctx: LayoutContext,
    private uploads: ImageAsset[],
    private fontMap: FontFamilyMap,
  ) {}

  /** Register a paragraph style; identical definitions share one named style. */
  style(hint: string, s: TextStyle, extra: Partial<IdParagraphStyle> = {}): string {
    const font = resolveFont(s.font, s.weight, !!s.italic, this.fontMap);
    this.fonts.set(`${font.family}\t${font.fontStyle}`, font);
    const color = cssColor(s.color)?.hex ?? ink.text;
    const def: IdParagraphStyle = {
      family: font.family,
      fontStyle: font.fontStyle,
      size: round2(s.size),
      leading: round2(s.leading),
      tracking: s.tracking ?? 0,
      align: s.align,
      color,
      caps: !!s.uppercase,
      spaceBefore: 0,
      spaceAfter: round2(s.spaceAfter ?? 0),
      hyphenate: s.align === "justify" && (s.font === "body" || s.font === "serif"),
      ...extra,
    };
    const sig = JSON.stringify(def);
    const existing = this.sigs.get(sig);
    if (existing) return existing;
    let name = hint;
    for (let i = 2; this.styles[name]; i++) name = `${hint} ${i}`;
    this.styles[name] = def;
    this.sigs.set(sig, name);
    return name;
  }

  run(start: number, length: number, s: Partial<TextStyle> & { font?: FontRole; weight?: number }, base: TextStyle): IdRun {
    const r: IdRun = { start, length };
    if (s.color) r.color = cssColor(s.color)?.hex;
    if (s.font || s.weight !== undefined || s.italic !== undefined) {
      const f = resolveFont(s.font ?? base.font, s.weight ?? base.weight, s.italic ?? !!base.italic, this.fontMap);
      this.fonts.set(`${f.family}\t${f.fontStyle}`, f);
      r.family = f.family;
      r.fontStyle = f.fontStyle;
    }
    if (s.size) r.size = round2(s.size);
    return r;
  }

  link(assetId: string | null | undefined): string | null {
    const asset = findImage(assetId, this.uploads);
    if (!asset) return null;
    const path = linkName(asset);
    const contentType = asset.source === "sample" ? "image/svg+xml" : asset.src?.slice(5, asset.src.indexOf(";")) || "image/jpeg";
    this.links.set(path, { path, assetId: asset.id, source: asset.source, contentType });
    return path;
  }
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const style = (id: string, over: Partial<TextStyle> = {}): TextStyle => ({ ...paragraphStyles[id], ...over });

export function buildInDesignManifestV2(ctx: LayoutContext, uploads: ImageAsset[], pageNumbers: number[], opts: ManifestOptions = {}): InDesignManifestV2 {
  const b = new Builder(ctx, uploads, opts.fontMap ?? {});
  const pub = ctx.publication;
  const { width: W, height: H } = pub.trim;
  const g = { ...ctx.settings.page, ...pub.grid };
  const pages = ctx.pages.filter((p) => pageNumbers.includes(p.number)).sort((a, b) => a.number - b.number);
  const resolved = pages.map((p) => resolvePage(ctx, p));
  const stories = new Map<string, IdStory>();
  const parents = new Map<string, IdParent>();

  const outPages: IdPage[] = resolved.map((r) => {
    const items: IdItem[] = [];
    const pid = r.page.id;
    const add = (it: IdItem) => items.push(withLayer(it));
    // Planned pages have no layout yet: they go out blank (the QA screen already flags them).
    if (!r.template || r.page.status === "planned") {
      return { number: r.page.number, side: r.isLeft ? "left" : "right", pageId: pid, title: r.page.title, parent: null, items };
    }
    const bg = cssColor(r.template.background);
    const elements = [...r.elements].sort((a, c) => (a.frame.z ?? 0) - (c.frame.z ?? 0));
    for (const el of elements) emitElement(b, ctx, r, el, add, stories);
    // Recurring furniture lives on parent pages (one per section and furniture kind).
    const parent = r.template.furniture !== "none" ? ensureParent(b, ctx, r, parents, r.template.furniture === "folio") : null;
    return {
      number: r.page.number,
      side: r.isLeft ? "left" : "right",
      pageId: pid,
      title: r.page.title,
      background: bg && bg.hex !== "#ffffff" ? bg.hex : undefined,
      parent,
      items,
    };
  });

  return {
    schema: MANIFEST_SCHEMA,
    generatedAt: new Date().toISOString(),
    publication: { id: pub.id, title: pub.title, issue: pub.issueLabel },
    document: {
      name: `${pub.masthead}-${pub.issueLabel}`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, ""),
      widthPt: pt(W),
      heightPt: pt(H),
      bleedPt: pt(pub.bleed),
      facingPages: true,
      margins: { top: pt(g.marginTop), bottom: pt(g.marginBottom), inside: pt(g.marginInside), outside: pt(g.marginOutside) },
      columns: g.columns,
      gutterPt: pt(g.gutter),
    },
    fonts: [...b.fonts.values()],
    paragraphStyles: b.styles,
    parents: [...parents.values()],
    layers: ["Background", "Images", "Text", "Furniture"],
    pages: outPages,
    stories: [...stories.values()].filter((s) => s.frames.length),
    links: [...b.links.values()],
  };
}

/* --------------------------------------------------------- elements */

type Add = (it: IdItem) => void;

/** Default layer and object name by item type. */
function withLayer(it: IdItem): IdItem {
  return { name: it.label, layer: it.type === "image" ? "Images" : it.type === "text" ? "Text" : "Background", ...it };
}

function textItem(id: string, label: string, el: { x: number; y: number; w: number; h: number }, extra: Partial<IdText> = {}): IdText {
  return { type: "text", id, label, bounds: box(el.x, el.y, el.w, el.h), columns: 1, gutter: 0, inset: [0, 0, 0, 0], ...extra };
}

function emitElement(b: Builder, ctx: LayoutContext, r: ResolvedPage, el: ResolvedElement, add: Add, stories: Map<string, IdStory>) {
  const f = el.frame;
  const id = `${r.page.id}:${el.id}`;
  const geo = { x: el.x, y: el.y, w: el.w, h: el.h };
  switch (el.kind) {
    case "shape": {
      const gradient = cssGradient(el.background);
      const c = cssColor(el.background ?? el.fill);
      if (!c && !gradient) return;
      add({
        type: "rect",
        id,
        label: f.label,
        bounds: box(geo.x, geo.y, geo.w, Math.max(geo.h, 0.1)),
        fill: gradient ? undefined : c!.hex,
        gradient,
        opacity: gradient ? Math.round((f.opacity ?? 1) * 100) : Math.round(c!.opacity * (f.opacity ?? 1)),
        radius: f.radius ? pt(f.radius) : undefined,
      });
      return;
    }
    case "image": {
      if (el.empty && f.optional) return;
      add({ type: "image", id, label: f.label, bounds: box(geo.x, geo.y, geo.w, geo.h), link: b.link(el.imageId), fit: el.imageFit === "contain" ? "fit" : "fill", focusX: el.focusX, focusY: el.focusY, required: !f.optional });
      return;
    }
    case "text":
      if (f.bind === "body") return emitBody(b, ctx, r, el, add, stories);
      if (f.bind === "facts") return emitFacts(b, r, el, add);
      if (storyBind(f.bind)?.field === "body") return emitBrief(b, ctx, r, el, add);
      if (el.empty) return;
      if (f.role === "pullquote") {
        const serif = el.style.font === "serif";
        const text = `“${el.text.replace(/^[“"]|[”"]$/g, "")}”`;
        if (!serif) add({ type: "rect", id: `${id}:rule`, label: `${f.label} rule`, bounds: box(geo.x, geo.y, geo.w, 0.8), fill: r.accent });
        add(textItem(id, f.label, geo, { inset: [serif ? 0 : pt(3), 0, 0, 0], paragraphs: [{ style: b.style("PF/Pull Quote", el.style), text }], reportOverset: true }));
        return;
      }
      add(
        textItem(id, f.label, geo, {
          inset: f.inset ? [pt(f.inset), pt(f.inset), pt(f.inset), pt(f.inset)] : [0, 0, 0, 0],
          fill: cssColor(el.fill)?.hex,
          radius: f.radius ? pt(f.radius) : undefined,
          // The browser already shrank auto-fit lines; InDesign re-checks with its own composer.
          autoFit: !!f.autoFit,
          reportOverset: true,
          paragraphs: [{ style: b.style(hintFor(f.styleId, f.role, r.page.pageType === "cover"), el.style), text: el.text.replace(/\r/g, "") }],
        }),
      );
      return;
    case "masthead":
      return emitMasthead(b, ctx, el, id, add);
    case "toc":
      return emitToc(b, ctx, el, id, add);
    case "stats":
      return emitStats(b, r, el, id, add);
    case "chart":
      return emitChart(b, r, el, id, add);
  }
}

/** Conventional InDesign style names per element role (variants get " 2", " 3"… when definitions differ). */
const ROLE_STYLE: Record<string, string> = {
  headline: "Headline",
  deck: "Deck",
  kicker: "Kicker",
  intro: "Standfirst",
  author: "Name",
  designation: "Designation",
  byline: "Byline",
  caption: "Caption",
  pullquote: "Pull Quote",
  "section-label": "Running Head",
  folio: "Page Number",
  facts: "Facts",
  signature: "Signature",
  body: "Body",
};

function hintFor(styleId: string | undefined, role: string, cover = false) {
  if (cover && role === "headline") return "PF/Cover Title";
  const byRole = ROLE_STYLE[role];
  if (byRole) return `PF/${byRole}`;
  const name = styleId ? paragraphStyles[styleId]?.indesignName : undefined;
  return name ? `PF/${name}` : `PF/${role}`;
}

/** A news brief: its own (unthreaded) story in one frame. */
function emitBrief(b: Builder, ctx: LayoutContext, r: ResolvedPage, el: ResolvedElement, add: Add) {
  const sb = storyBind(el.frame.bind)!;
  const article = storyArticle(ctx, r.page, sb.n);
  const body = r.page.contentOverrides[el.frame.bind!] ?? article?.body;
  if (!body) return;
  const base = el.style;
  const bodyName = b.style("PF/Body", base);
  const hName = b.style("PF/Subheading", { ...base, size: base.size + 2, leading: base.leading + 2, weight: 700, color: r.accent, align: "left", spaceAfter: 3 }, { hyphenate: false, keepWithNext: 1 });
  const paragraphs: IdParagraph[] = parseBody(body).map((p) => ({ style: p.kind === "h" ? hName : bodyName, text: p.words.join(" ") }));
  add(textItem(`${r.page.id}:${el.id}`, el.frame.label, el, { columns: el.columns, gutter: pt(el.gutter), paragraphs, reportOverset: true }));
}

function emitBody(b: Builder, ctx: LayoutContext, r: ResolvedPage, el: ResolvedElement, add: Add, stories: Map<string, IdStory>) {
  const article = r.article;
  if (!article) return;
  const sid = `story-${article.id}`;
  const id = `${r.page.id}:${el.id}`;
  add(textItem(id, el.frame.label, el, { columns: el.columns, gutter: pt(el.gutter), story: sid }));
  let story = stories.get(sid);
  if (!story) {
    const base = el.style;
    const accent = r.accent;
    const interview = article.contentType === "interview";
    const bodyName = b.style("PF/Body", base);
    const qName = b.style("PF/Body Question", { ...base, weight: 700, color: interview ? accent : base.color, align: base.align === "justify" ? "left" : base.align, spaceAfter: 3 }, { hyphenate: false, keepWithNext: 1 });
    const hName = b.style("PF/Subheading", { ...base, size: base.size + 2, leading: base.leading + 2, weight: 700, color: accent, align: "left", spaceAfter: 3 }, { hyphenate: false, spaceBefore: round2(base.leading * 0.5), keepWithNext: 1 });
    const dropCap = !!el.slices?.[0]?.dropCap;
    const firstName = dropCap ? b.style("PF/Body First", base, { dropCap: { lines: DROP_CAP_LINES, chars: 1 } }) : bodyName;
    const paras = parseBody(storyBody(ctx.pages, article));
    const paragraphs: IdParagraph[] = paras.map((p, i) => {
      const text = p.words.join(" ");
      if (p.kind === "h") return { style: hName, text };
      if (p.kind === "q") return { style: qName, text };
      if (i === 0 && dropCap) return { style: firstName, text, runs: [b.run(0, 1, { color: accent, weight: 700 }, base)] };
      return { style: bodyName, text };
    });
    story = { id: sid, title: article.title, frames: [], paragraphs };
    stories.set(sid, story);
  }
  story.frames.push(id);
}

function emitFacts(b: Builder, r: ResolvedPage, el: ResolvedElement, add: Add) {
  const facts = r.article?.facts ?? [];
  if (!facts.length) return;
  const s = el.style;
  const inset = el.frame.inset ? pt(el.frame.inset) : 0;
  const paragraphs: IdParagraph[] = [];
  if (el.frame.inset) paragraphs.push({ style: b.style("PF/Facts Heading", { ...s, size: 7, leading: 9, weight: 700, uppercase: true, tracking: 80, color: r.accent, align: "left", spaceAfter: 7 }), text: "Key facts" });
  facts.forEach((f, i) => {
    paragraphs.push({ style: b.style("PF/Facts Value", { ...s, font: "display", weight: 400, size: 21, leading: 20, color: r.accent, tracking: 10, align: "left", spaceAfter: 2.3 }), text: f.value });
    const last = i === facts.length - 1;
    paragraphs.push({
      style: b.style("PF/Facts Label", { ...s, size: 7.4, leading: 9.4, align: "left", spaceAfter: last ? 0 : 10.2 }, last ? {} : { ruleBelow: { color: ink.rule, weight: 0.5, offset: 4.5 } }),
      text: f.label,
    });
  });
  add(textItem(`${r.page.id}:${el.id}`, el.frame.label, el, { inset: [inset, inset, inset, inset], fill: cssColor(el.fill)?.hex, paragraphs, reportOverset: true }));
}

/* ---------------------------------------------------------- masthead */

function emitMasthead(b: Builder, ctx: LayoutContext, el: ResolvedElement, id: string, add: Add) {
  const variant = el.frame.variant ?? "logo";
  const name = ctx.publication.masthead;
  if (variant === "logo" || variant === "light") {
    const light = variant === "light";
    const base = style("headline-m", { font: "sans", weight: 800, size: light ? 34 : 44, leading: light ? 36 : 46, tracking: -20, align: "center", color: light ? "#ffffff" : ink.navy });
    const runs: IdRun[] = [];
    if (name === "TechMahaImpact") {
      runs.push(b.run(4, 4, { color: ink.orange }, base));
      runs.push(b.run(8, 6, { color: light ? "#ffffff" : ink.blue }, base));
    }
    add(textItem(id, el.frame.label, el, { verticalAlign: "center", autoFit: true, paragraphs: [{ style: b.style("PF/Masthead", base), text: name, runs }] }));
    return;
  }
  if (variant === "badge") {
    emitBadge(b, id, el.x + el.w, el.y + (el.h - 11) / 2, 11, add);
    return;
  }
  // partners strip: three columns
  const colW = el.w / 3;
  const label = style("caption", { font: "sans", size: 5.5, leading: 7, italic: false, color: "#5b6475" });
  const cols: { title: string; align: "left" | "center" | "right" }[] = [
    { title: "Organised by", align: "left" },
    { title: "An Initiative By", align: "center" },
    { title: "Strategic Partner", align: "right" },
  ];
  cols.forEach((c, i) => {
    const x = el.x + colW * i;
    add(textItem(`${id}:label-${i}`, `${c.title} label`, { x, y: el.y, w: colW, h: 3 }, { paragraphs: [{ style: b.style("PF/Partner Label", { ...label, align: c.align }), text: c.title }] }));
  });
  const elets = style("headline-m", { font: "sans", weight: 800, size: 13, leading: 15, tracking: -30, color: "#141b2b", align: "left" });
  add(textItem(`${id}:elets`, "Organiser mark", { x: el.x, y: el.y + 4.2, w: colW, h: 6 }, { paragraphs: [{ style: b.style("PF/Organiser Mark", elets), text: "elets", runs: [b.run(0, 1, { color: "#d4161d" }, elets)] }] }));
  const initiative = style("caption", { font: "sans", italic: false, size: 6.2, leading: 7.8, weight: 700, color: ink.navy, align: "center" });
  add(
    textItem(`${id}:initiative`, "Initiative", { x: el.x + colW, y: el.y + 4.2, w: colW, h: 8 }, {
      paragraphs: [
        { style: b.style("PF/Initiative", initiative), text: "DEPARTMENT OF INFORMATION TECHNOLOGY" },
        { style: b.style("PF/Initiative Sub", { ...initiative, weight: 400, color: "#5b6475" }), text: "State IT Corporation (sample)" },
      ],
    }),
  );
  emitBadge(b, `${id}:partner`, el.x + el.w, el.y + 4.2, 5.5, add);
}

/** The eGov badge: two coloured boxes with white lettering, right-aligned at `right`. */
function emitBadge(b: Builder, id: string, right: number, y: number, h: number, add: Add) {
  const sizePt = (h * 0.72) / MM_PER_PT;
  const wE = h * 0.74;
  const wGov = h * 1.86;
  const x0 = right - wE - wGov;
  const s = style("headline-m", { font: "sans", weight: 800, size: round2(sizePt), leading: round2(sizePt), tracking: 0, color: "#ffffff", align: "center" });
  const name = b.style("PF/Badge", s);
  add({ type: "rect", id: `${id}:e-bg`, label: "Badge e", bounds: box(x0, y, wE, h), fill: "#d4161d" });
  add({ type: "rect", id: `${id}:gov-bg`, label: "Badge gov", bounds: box(x0 + wE, y, wGov, h), fill: "#141b2b" });
  add(textItem(`${id}:e`, "Badge e text", { x: x0, y, w: wE, h }, { verticalAlign: "center", paragraphs: [{ style: name, text: "e" }] }));
  add(textItem(`${id}:gov`, "Badge gov text", { x: x0 + wE, y, w: wGov, h }, { verticalAlign: "center", paragraphs: [{ style: name, text: "gov" }] }));
}

/* --------------------------------------------------------------- TOC */

function emitToc(b: Builder, ctx: LayoutContext, el: ResolvedElement, id: string, add: Add) {
  const entries = tocEntries(ctx);
  const variant = el.frame.variant ?? "list";
  const body = style("body", { align: "left", spaceAfter: 0 });
  if (variant === "feature") {
    const e = entries.find((x) => x.section === "Cover Story") ?? entries[0];
    if (!e) return;
    add({ type: "rect", id: `${id}:bg`, label: "Feature panel", bounds: box(el.x, el.y, el.w, el.h), fill: "#ffffff" });
    add({ type: "rect", id: `${id}:bar`, label: "Feature bar", bounds: box(el.x, el.y, 1.2, el.h), fill: ink.orange });
    const num = style("headline-m", { weight: 800, size: 18, leading: 20, color: ink.navy, align: "left" });
    const numText = String(e.number).padStart(2, "0");
    const kicker = "  COVER STORY";
    add(
      textItem(`${id}:text`, "Feature text", { x: el.x + 1.2, y: el.y, w: el.w - 1.2, h: el.h }, {
        inset: [pt(2.5), pt(4), pt(2), pt(4)],
        paragraphs: [
          { style: b.style("PF/TOC Feature Number", num), text: numText + kicker, runs: [b.run(numText.length, kicker.length, { font: "body", weight: 700, size: 6.5, color: "#5b6475" }, num)] },
          { style: b.style("PF/TOC Feature Title", style("headline-m", { weight: 700, size: 10.5, leading: 12.5, color: ink.orange, align: "left" })), text: e.title },
        ],
        reportOverset: true,
      }),
    );
    return;
  }
  if (variant === "people") {
    const people = entries.filter((e) => (e.type === "interview" || e.type === "leadership-message") && e.imageId).slice(0, 4);
    const colW = (el.w - 15) / 4;
    people.forEach((p, i) => {
      const x = el.x + i * (colW + 5);
      add({ type: "image", id: `${id}:img-${i}`, label: `Portrait ${p.number}`, bounds: box(x, el.y, colW, 32), link: b.link(p.imageId), fit: "fill", focusX: 50, focusY: 20, required: false, fill: "#eef0f4" });
      add(
        textItem(`${id}:txt-${i}`, `Person ${p.number}`, { x, y: el.y + 33.5, w: colW, h: el.h - 33.5 }, {
          paragraphs: [
            { style: b.style("PF/TOC Person Page", { ...body, weight: 700, size: 11, leading: 13, color: p.color }), text: String(p.number) },
            { style: b.style("PF/TOC Person Name", { ...body, weight: 700, size: 7, leading: 8.75, color: "#1f2633" }), text: p.name ?? "" },
            { style: b.style("PF/TOC Person Role", { ...body, size: 6.2, leading: 7.75, color: "#5b6475" }), text: p.role ?? "" },
          ],
        }),
      );
    });
    return;
  }
  const list = entries.filter((e) => e.type !== "leadership-message" && e.section !== "Cover Story").slice(0, 12);
  add({ type: "rect", id: `${id}:rule`, label: "Contents rule", bounds: box(el.x, el.y, el.w, 0.5), fill: ink.navy });
  const colW = (el.w - 10) / 3;
  const rowH = Math.min(11, (el.h - 3) / Math.max(1, Math.ceil(list.length / 3)) - 2.6);
  list.forEach((e, i) => {
    const x = el.x + (i % 3) * (colW + 5);
    const y = el.y + 3 + Math.floor(i / 3) * (rowH + 2.6);
    add(textItem(`${id}:n-${i}`, `Contents ${e.number} number`, { x, y, w: 8, h: rowH }, { paragraphs: [{ style: b.style("PF/TOC Number", style("headline-m", { weight: 800, size: 13, leading: 14, color: e.color, align: "left" })), text: String(e.number).padStart(2, "0") }] }));
    add(
      textItem(`${id}:t-${i}`, `Contents ${e.number}`, { x: x + 9.5, y, w: colW - 9.5, h: rowH }, {
        paragraphs: [
          { style: b.style("PF/TOC Section", { ...body, size: 5.8, leading: 7.2, uppercase: true, tracking: 60, color: "#5b6475" }), text: e.section },
          { style: b.style("PF/TOC Title", { ...body, size: 8, leading: 10, weight: 500, color: "#1f2633" }), text: e.title },
        ],
        reportOverset: true,
      }),
    );
  });
}

/* ------------------------------------------------------- stats/chart */

function emitStats(b: Builder, r: ResolvedPage, el: ResolvedElement, id: string, add: Add) {
  const facts = (r.article?.facts ?? []).slice(0, 6);
  if (!facts.length) return;
  const tones = [ink.navy, r.accent, ink.orange, ink.green, ink.blue, "#6b3fa0"];
  const rows = Math.ceil(facts.length / 3);
  const tileW = (el.w - 8) / 3;
  const tileH = (el.h - 4 * (rows - 1)) / rows;
  facts.forEach((f, i) => {
    const x = el.x + (i % 3) * (tileW + 4);
    const y = el.y + Math.floor(i / 3) * (tileH + 4);
    const tone = cssColor(tones[i % tones.length])!.hex;
    add({ type: "rect", id: `${id}:tile-${i}`, label: `Stat tile ${i + 1}`, bounds: box(x, y, tileW, tileH), fill: i % 2 === 0 ? "#f4f6fa" : "#ffffff", stroke: { color: ink.rule, weight: 0.5 } });
    add({ type: "rect", id: `${id}:bar-${i}`, label: `Stat bar ${i + 1}`, bounds: box(x, y, tileW, 1.2), fill: tone });
    const value = style("display", { size: 36, leading: 34, color: tone, tracking: 10, align: "left" });
    add(textItem(`${id}:value-${i}`, `Stat value ${i + 1}`, { x: x + 4, y: y + 5.2, w: tileW - 8, h: 14 }, { autoFit: true, paragraphs: [{ style: b.style("PF/Stat Value", value), text: f.value }] }));
    add(textItem(`${id}:label-${i}`, `Stat label ${i + 1}`, { x: x + 4, y: y + tileH - 14, w: tileW - 8, h: 10 }, { verticalAlign: "bottom", paragraphs: [{ style: b.style("PF/Stat Label", style("body", { size: 8, leading: 10.4, weight: 500, color: "#1f2633", align: "left", spaceAfter: 0 })), text: f.label }], reportOverset: true }));
  });
}

function emitChart(b: Builder, r: ResolvedPage, el: ResolvedElement, id: string, add: Add) {
  const [title, data] = (el.frame.text ?? "").split("|");
  const rows = (data ?? "").split(",").filter(Boolean).map((d) => {
    const [k, v] = d.split(":");
    return { k, v: Number(v) || 0 };
  });
  if (!rows.length) return;
  const max = Math.max(1, ...rows.map((x) => x.v));
  const titleH = 6;
  const labelH = 4;
  const areaTop = el.y + titleH;
  const areaH = el.h - titleH - labelH - 1.2;
  const gap = 3;
  const barW = (el.w - gap * (rows.length - 1)) / rows.length;
  const small = style("body", { size: 7, leading: 8.5, color: "#5b6475", align: "center", spaceAfter: 0 });
  add(textItem(`${id}:title`, "Chart title", { x: el.x, y: el.y, w: el.w, h: titleH }, { paragraphs: [{ style: b.style("PF/Chart Title", style("body", { size: 7.5, leading: 9, weight: 700, uppercase: true, tracking: 60, color: "#1f2633", align: "left", spaceAfter: 0 })), text: title }] }));
  rows.forEach((row, i) => {
    const x = el.x + i * (barW + gap);
    const h = (row.v / max) * areaH * 0.78;
    const last = i === rows.length - 1;
    const fill = last ? ink.orange : cssColor(r.accent)!.hex;
    add({ type: "rect", id: `${id}:bar-${i}`, label: `Bar ${row.k}`, bounds: box(x, areaTop + areaH - h, barW, h), fill, opacity: last ? 100 : Math.round((0.55 + (i / rows.length) * 0.45) * 100) });
    add(textItem(`${id}:value-${i}`, `Value ${row.k}`, { x, y: areaTop + areaH - h - 4.5, w: barW, h: 4 }, { verticalAlign: "bottom", paragraphs: [{ style: b.style("PF/Chart Value", style("headline-m", { weight: 700, size: 8.5, leading: 10, color: "#1f2633", align: "center" })), text: String(row.v) }] }));
    add(textItem(`${id}:label-${i}`, `Label ${row.k}`, { x, y: areaTop + areaH + 1.2, w: barW, h: labelH }, { paragraphs: [{ style: b.style("PF/Chart Label", small), text: row.k }] }));
  });
  add({ type: "rect", id: `${id}:axis`, label: "Chart axis", bounds: box(el.x, areaTop + areaH, el.w, 0.26), fill: "#1f2633" });
}

/* ------------------------------------------------- parent pages (furniture) */

/**
 * Recurring furniture — section tab, running head, folio with InDesign's
 * automatic page number, issue label and tagline — goes on a parent page per
 * section (and per furniture kind), so designers edit it once in InDesign.
 */
function ensureParent(b: Builder, ctx: LayoutContext, r: ResolvedPage, parents: Map<string, IdParent>, folioOnly: boolean): string {
  const label = r.section?.id === "sec-front" ? "" : r.section?.name ?? "";
  const key = `${folioOnly ? "folio" : "full"}:${label || "front"}`;
  const existing = parents.get(key);
  if (existing) return existing.id;
  const prefix = String.fromCharCode(66 + (parents.size % 25)); // B, C, D… (A is InDesign's default)
  const name = folioOnly ? "Folio only" : label || "Front matter";
  const parent: IdParent = { id: key, prefix, name, left: [], right: [] };
  for (const side of ["left", "right"] as const) {
    const items = parent[side];
    emitFurniture(b, ctx, r, side === "left", (it) => items.push({ name: it.label, layer: "Furniture", ...it }), folioOnly, label, key);
  }
  parents.set(key, parent);
  return key;
}

function emitFurniture(b: Builder, ctx: LayoutContext, r: ResolvedPage, left: boolean, add: Add, folioOnly: boolean, label: string, key: string) {
  const pub = ctx.publication;
  const { width: W, height: H } = pub.trim;
  const id = `parent:${key}:${left ? "L" : "R"}`;
  const accent = cssColor(r.accent)!.hex;
  if (!folioOnly && label) {
    add({ type: "rect", id: `${id}:tab`, label: "Section tab", bounds: box(left ? -5 : W - 8, -5, 13, 20), fill: accent });
    const headStyle = style("running-head", { size: 7, leading: 8, tracking: 40, uppercase: true, color: "#3a4253", align: left ? "left" : "right" });
    const textW = measureMm(label, headStyle) + 1.5;
    add(textItem(`${id}:head`, "Running head", { x: left ? 15 : W - 15 - textW, y: 10.2, w: textW, h: 3.2 }, { paragraphs: [{ style: b.style("PF/Running Head", headStyle), text: label }] }));
    const ruleX = left ? 15 + textW + 2 : 15;
    add({ type: "rect", id: `${id}:rule`, label: "Running head rule", bounds: box(ruleX, 11.45, W - 30 - textW - 2, 0.13), fill: "#9aa1ae" });
  }
  // Folio block (extends into the bleed on the outside edge).
  const top = H - 13;
  add({ type: "rect", id: `${id}:folio-tab`, label: "Folio tab", bounds: box(left ? -5 : W - 12, top + 1, 17, 17), fill: "#33363d" });
  const arrow = style("body", { weight: 700, size: 11, leading: 12, color: accent === ink.navy ? ink.orange : "#f6b44c", align: "center", spaceAfter: 0 });
  add(textItem(`${id}:arrow`, "Folio arrow", { x: left ? -5 : W - 12, y: top + 1, w: 17, h: 11 }, { verticalAlign: "center", paragraphs: [{ style: b.style("PF/Folio Arrow", arrow), text: left ? ">" : "<" }] }));
  const num = style("body", { weight: 700, size: 11, leading: 12, color: "#1f2633", align: left ? "left" : "right", spaceAfter: 0 });
  const numW = measureMm("000", num) + 1;
  const small = style("body", { size: 6, leading: 7, color: "#3a4253", align: left ? "left" : "right", spaceAfter: 0 });
  const issue = pub.issueLabel.toUpperCase();
  const issueW = measureMm(issue, small) + 1.5;
  const x0 = left ? 15 : W - 15 - numW;
  add(textItem(`${id}:number`, "Page number", { x: x0, y: top + 2.2, w: numW, h: 5 }, { verticalAlign: "center", autoPageNumber: true, paragraphs: [{ style: b.style("PF/Page Number", num), text: "0" }] }));
  const divX = left ? x0 + numW + 2.2 : x0 - 2.2 - 0.15;
  add({ type: "rect", id: `${id}:divider`, label: "Folio divider", bounds: box(divX, top + 2.2, 0.15, 5), fill: "#9aa1ae" });
  add(textItem(`${id}:issue`, "Folio issue", { x: left ? divX + 2.35 : divX - 2.2 - issueW, y: top + 2.2, w: issueW, h: 5 }, { verticalAlign: "center", paragraphs: [{ style: b.style("PF/Folio Issue", small), text: issue }] }));
  const tag = left ? `[ ${pub.website} ]  ${pub.tagline}` : "Connect with us on  @eletsonline  ·  @egovonline  ·  Elets Governance  ·  eletsvideos";
  const tagX = left ? W * 0.34 : 30;
  const tagStyle = { ...small, align: "left" as const };
  add(
    textItem(`${id}:tagline`, "Folio tagline", { x: tagX, y: top + 3.1, w: W - 15 - tagX - (left ? 0 : numW + issueW + 8), h: 3 }, {
      paragraphs: [{ style: b.style("PF/Folio Tagline", tagStyle), text: tag, runs: left ? [b.run(0, pub.website.length + 4, { color: "#c2410c" }, tagStyle)] : undefined }],
    }),
  );
}
