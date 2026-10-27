import { sections as houseSections } from "@/data/seed";
import { ACCENT, ink } from "../design-tokens";
import { templateCapacity } from "../layout-engine";
import { builtInTemplates } from "../templates";
import { countWords } from "../text-engine";
import type {
  Article,
  ContentType,
  FrameSpec,
  Page,
  PageType,
  Publication,
  ReferenceProfile,
  RefPage,
  RefPageType,
  RefRect,
  RefTextBlock,
  Section,
  Settings,
  Template,
  TextStyle,
} from "../types";
import { fontRole, isFurniture, rankedPages, representatives } from "./analyze";

/**
 * "Create like this": turns a measured reference profile into templates and a
 * new publication. Where a representative page has clear structure, frame
 * geometry is taken from it directly ("geometry"); otherwise the matching
 * house template is rescaled to the reference trim and restyled ("adapted").
 */

export const REF_TYPE_LABELS: Record<RefPageType, string> = {
  cover: "Cover",
  contents: "Contents",
  message: "Leadership message",
  interview: "Interview",
  "feature-opener": "Feature opener",
  article: "Article",
  infographic: "Infographic",
  advertisement: "Advertisement",
  other: "Other",
};

const PAGE_TYPE: Record<RefPageType, PageType> = {
  cover: "cover",
  contents: "contents",
  message: "leadership-message",
  interview: "interview",
  "feature-opener": "feature",
  article: "article",
  infographic: "infographic",
  advertisement: "advertisement",
  other: "article",
};

const CONTENT_TYPES: Partial<Record<RefPageType, ContentType[]>> = {
  article: ["feature", "news-report", "case-study", "event-report", "editorial"],
  interview: ["interview"],
  message: ["leadership-message"],
  "feature-opener": ["feature"],
  infographic: ["feature"],
};

export const FALLBACK: Record<RefPageType, string> = {
  cover: "tpl-cover",
  contents: "tpl-contents",
  message: "tpl-message",
  interview: "tpl-interview-classic",
  "feature-opener": "tpl-feature-opener",
  article: "tpl-article-standard",
  infographic: "tpl-infographic",
  advertisement: "tpl-advertisement",
  other: "tpl-article-standard",
};

/** Page types whose geometry we try to derive from the reference. */
export const DERIVABLE: RefPageType[] = ["article", "interview", "message", "feature-opener"];

const r1 = (v: number) => Math.round(v * 10) / 10;
const overlapX = (a: RefRect, b: RefRect) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
const union = (rs: RefRect[]): RefRect => {
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
};

/* ------------------------------------------------------------- styles */

export function referenceBodyStyle(p: ReferenceProfile): Partial<TextStyle> {
  return { font: p.body.role, size: p.body.size, leading: p.body.leading, align: p.body.align, weight: 400 };
}

/** CSS weight implied by a font's name (e.g. "GoodPro-Black" → 900). */
export function weightFromName(name: string): number {
  const n = name.toLowerCase();
  if (/black|heavy|ultra/.test(n)) return 900;
  if (/extra ?bold/.test(n)) return 800;
  if (/semi ?bold|demi/.test(n)) return 600;
  if (/bold/.test(n)) return 700;
  if (/medium/.test(n)) return 500;
  if (/light|thin/.test(n)) return 300;
  return 400;
}

function styleFor(b: RefTextBlock, extra: Partial<TextStyle> = {}): Partial<TextStyle> {
  const role = fontRole(b.font);
  return {
    font: role,
    size: r1(b.size),
    leading: r1(b.leading > 0 ? b.leading : b.size * (b.size > 20 ? 1.02 : 1.25)),
    // Substitute faces: Bebas Neue has one weight, Roboto Condensed tops out at 800.
    weight: role === "display" ? 400 : role === "headline" ? Math.min(800, weightFromName(b.font)) : weightFromName(b.font),
    ...extra,
  };
}

/* ----------------------------------------------------------- geometry */

export interface Derived {
  template: Template;
  notes: string[];
}

export function deriveTemplate(profile: ReferenceProfile, page: RefPage, kind: RefPageType, id: string): Derived | null {
  const W = profile.trim.width;
  const H = profile.trim.height;
  const bleed = Math.max(profile.bleed, 3);
  // Some page types (messages, editorials) run larger text than the magazine body: use the
  // size carrying most running text on this page when it is plausibly body copy.
  const running = page.blocks.filter((b) => b.lines >= 2 && b.size < profile.headline.size * 0.7);
  const bySize = new Map<number, number>();
  for (const b of running) bySize.set(Math.round(b.size * 4) / 4, (bySize.get(Math.round(b.size * 4) / 4) ?? 0) + b.chars);
  const pageBody = bySize.size ? [...bySize.entries()].sort((a, b) => b[1] - a[1])[0][0] : profile.body.size;
  const body = pageBody >= profile.body.size * 0.85 && pageBody <= profile.body.size * 1.6 ? pageBody : profile.body.size;
  const bodyStyle: Partial<TextStyle> = { ...referenceBodyStyle(profile) };
  if (body !== profile.body.size) {
    const lead = running.filter((b) => Math.abs(b.size - body) < 0.3 && b.leading > 0).map((b) => b.leading);
    Object.assign(bodyStyle, { size: r1(body), leading: r1(lead.length ? lead.sort((a, b) => a - b)[lead.length >> 1] : body * 1.35) });
  }
  const content = page.blocks.filter((b) => !isFurniture(b, profile.body.size, H) && b.chars >= 2);
  const used = new Set<RefTextBlock>();
  const frames: FrameSpec[] = [];
  const notes: string[] = [];
  const centred = (r: RefRect) => Math.abs(r.x + r.w / 2 - W / 2) < 8 && r.w < W * 0.9;

  // Images (largest first). Full-page images are kept only where the page is image-led.
  const imgs = page.images
    .filter((r) => r.w * r.h >= 500 && r.w >= 18 && r.h >= 18 && Math.max(r.w / r.h, r.h / r.w) < 5)
    .filter((r) => kind === "feature-opener" || r.w * r.h < W * H * 0.9)
    .slice(0, 3);
  imgs.forEach((r, i) => {
    const x = Math.max(-bleed, r.x);
    const y = Math.max(-bleed, r.y);
    const rr = { x, y, w: Math.min(W + bleed, r.x + r.w) - x, h: Math.min(H + bleed, r.y + r.h) - y };
    frames.push({
      id: i === 0 ? "image" : `image-${i + 1}`,
      kind: "image",
      role: "image",
      label: i === 0 ? (kind === "interview" || kind === "message" ? "Portrait" : "Lead image") : `Image ${i + 1}`,
      ...roundRect(rr),
      bind: `image.${i}` as FrameSpec["bind"],
      imageFit: "cover",
      bleeds: rr.x < 0 || rr.y < 0 || rr.x + rr.w > W || rr.y + rr.h > H,
      optional: i > 0,
      focusY: kind === "interview" || kind === "message" ? 20 : 45,
    });
  });

  // Headline: the largest type on the page, merged with neighbouring display lines.
  const big = content.filter((b) => b.size >= body * 1.6 && b.chars >= 3).sort((a, b) => b.size - a.size);
  // A usable model has a real headline: large type in the top half (openers may sit lower).
  const head = big.find((b) => b.size >= profile.body.size * 1.8 && (kind === "feature-opener" || b.y < H * 0.5));
  let title: RefRect | undefined;
  if (head) {
    const group = [head, ...big.slice(1).filter((b) => b.size >= head.size * 0.55 && b.y < head.y + head.h + head.size * 0.7 && b.y + b.h > head.y - head.size * 0.9 && overlapX(b, head) > -10)];
    group.forEach((b) => used.add(b));
    title = union(group);
    const style = styleFor(head, { color: ACCENT, align: centred(title) ? "center" : "left" });
    if (kind === "feature-opener" && imgs[0] && overlapsArea(title, imgs[0]) > 0.5) style.color = "#ffffff";
    frames.push({ id: "headline", kind: "text", role: "headline", label: "Headline", ...roundRect(pad(title, 0, 0, 0, title.h * 0.18)), bind: "title", styleId: "headline-l", style, autoFit: true, z: 2 });
    notes.push(`Headline ${r1(head.size)}pt ${head.font}`);
  }

  // Kicker above the headline.
  if (title) {
    const k = content.find((b) => !used.has(b) && b.size <= body * 1.4 && b.chars <= 40 && b.y + b.h <= title!.y + 2 && b.y + b.h > title!.y - 22 && overlapX(b, title!) > 0);
    if (k) {
      used.add(k);
      frames.push({ id: "kicker", kind: "text", role: "kicker", label: "Kicker", ...roundRect(pad(k, 0, 0, Math.max(0, title.x + title.w - k.x - k.w), 1)), bind: kind === "interview" ? "static" : "section", text: kind === "interview" ? "Interview" : undefined, styleId: "kicker", style: { size: r1(Math.min(k.size, 9)), align: centred(k) ? "center" : "left" }, z: 2 });
    }
  }

  // Deck under (or over) the headline.
  if (title && head) {
    const d = content
      .filter((b) => !used.has(b) && b.size > body * 1.1 && b.size < head.size * 0.75 && b.chars >= 12 && b.lines <= 5 && Math.abs(b.y - (title!.y + title!.h)) < 45)
      .sort((a, b) => Math.abs(a.y - title!.y - title!.h) - Math.abs(b.y - title!.y - title!.h))[0];
    if (d) {
      used.add(d);
      frames.push({ id: "deck", kind: "text", role: "deck", label: "Deck", ...roundRect(pad(d, 0, 0, 0, d.h * 0.25)), bind: "subtitle", styleId: "deck", style: styleFor(d, { weight: d.bold ? 700 : 300, color: kind === "feature-opener" && title && imgs[0] && overlapsArea(d, imgs[0]) > 0.5 ? "#e2e7f2" : "#3a4253", align: centred(d) ? "center" : "left" }), optional: true, autoFit: true, z: 2 });
    }
  }

  // Name / designation near the portrait (interviews, messages).
  if ((kind === "interview" || kind === "message") && imgs[0]) {
    const img = imgs[0];
    const near = (b: RefTextBlock) => overlapX(b, img) > Math.min(b.w, img.w) * 0.5 && b.y > img.y + img.h * 0.5 && b.y < img.y + img.h + 30;
    const name = content.filter((b) => !used.has(b) && near(b) && b.size >= body * 1.05 && b.size <= body * 2.6 && b.chars <= 45 && b.lines <= 2).sort((a, b) => b.size - a.size)[0];
    if (name) {
      used.add(name);
      const role = content.filter((b) => !used.has(b) && near(b) && b.y >= name.y + name.h - 1 && b.y < name.y + name.h + 14 && b.size < name.size).sort((a, b) => a.y - b.y)[0];
      if (role) used.add(role);
      const band = union([name, ...(role ? [role] : [])]);
      // Names set on, or butting up to, the portrait sit on a coloured band in the reference.
      const light = band.y < img.y + img.h + 4;
      if (light) {
        const top = Math.min(band.y - 2.5, Math.max(img.y, img.y + img.h - 1));
        const shape = { x: img.x, y: top, w: img.w, h: band.y + band.h + 2.5 - top };
        frames.push({ id: "band", kind: "shape", role: "decor", label: "Name band", ...roundRect(shape), fill: profile.palette[0] ?? ink.navy, optional: true });
      }
      // Names and designations vary in length between issues: the frames auto-fit (InDesign re-checks) and the designation gets a second line.
      frames.push({ id: "name", kind: "text", role: "author", label: "Name", ...roundRect(pad(name, 0, 0, 0, 1)), bind: "author.name", styleId: "name", style: styleFor(name, { color: light ? "#ffffff" : ink.navy, align: centred(name) || Math.abs(name.x + name.w / 2 - (img.x + img.w / 2)) < 6 ? "center" : "left" }), autoFit: true, z: 2 });
      if (role) frames.push({ id: "designation", kind: "text", role: "designation", label: "Designation", ...roundRect(pad(role, 0, 0, 0, Math.max(role.h * 0.4, role.size * 0.3528 * 1.3))), bind: "author.role", styleId: "designation", style: styleFor(role, { color: light ? "#e8ecf4" : ink.muted, weight: 400, align: Math.abs(role.x + role.w / 2 - (img.x + img.w / 2)) < 6 ? "center" : "left" }), autoFit: true, z: 2 });
    }
  }

  // Captions next to images.
  imgs.forEach((img, i) => {
    const c = content.find((b) => !used.has(b) && b.size <= body * 0.95 && b.size >= body * 0.55 && b.chars >= 12 && b.lines <= 4 && overlapX(b, img) > Math.min(b.w, img.w) * 0.5 && ((b.y >= img.y + img.h - 2 && b.y < img.y + img.h + 10) || (b.y + b.h <= img.y + 2 && b.y + b.h > img.y - 10)));
    if (c) {
      used.add(c);
      frames.push({ id: i === 0 ? "caption" : `caption-${i + 1}`, kind: "text", role: "caption", label: `Caption ${i + 1}`, ...roundRect(pad(c, 0, 0, 0, 2)), bind: `caption.${i}` as FrameSpec["bind"], styleId: "caption", style: styleFor(c, { italic: /italic|oblique/i.test(c.font), weight: 400, color: ink.muted }), optional: i > 0 });
    }
  });

  // Body text: column segments of body-size blocks, threaded in reading order.
  const bodyBlocks = content.filter((b) => !used.has(b) && Math.abs(b.size - body) <= body * 0.13 && (b.lines >= 2 || b.chars > 60));
  const clusters: RefTextBlock[][] = [];
  for (const b of [...bodyBlocks].sort((a, c) => a.x - c.x)) {
    const c = clusters.find((cl) => Math.abs(cl[0].x - b.x) < 4 && Math.abs(cl[0].w - b.w) < 8);
    if (c) c.push(b);
    else clusters.push([b]);
  }
  let segs: RefRect[] = [];
  for (const cl of clusters) {
    cl.sort((a, b) => a.y - b.y);
    let cur: RefTextBlock[] = [];
    for (const b of cl) {
      const prev = cur[cur.length - 1];
      // Split a column only where something else (a photo) occupies the gap, or the gap is huge;
      // sub-heads and spacing between paragraphs stay inside one threaded frame.
      const gapTop = prev ? prev.y + prev.h : 0;
      const photoInGap = prev ? imgs.some((r) => r.y < b.y && r.y + r.h > gapTop && r.x < b.x + b.w && r.x + r.w > b.x) : false;
      if (prev && b.y - gapTop > 4 && (photoInGap || b.y - gapTop > 40)) {
        segs.push(union(cur));
        cur = [];
      }
      cur.push(b);
    }
    if (cur.length) segs.push(union(cur));
  }
  segs = segs.filter((s) => s.h >= 12 && s.w >= 25);
  // Merge side-by-side segments with matching top/bottom into multi-column frames.
  segs.sort((a, b) => a.y - b.y || a.x - b.x);
  const merged: { r: RefRect; cols: number; gutter: number }[] = [];
  for (const s of segs.sort((a, b) => a.x - b.x)) {
    const m = merged.find((g) => {
      const colW = (g.r.w - g.gutter * (g.cols - 1)) / g.cols;
      const gap = s.x - (g.r.x + g.r.w);
      return gap > 1 && gap < 14 && Math.abs(s.y - g.r.y) < 6 && Math.abs(s.y + s.h - (g.r.y + g.r.h)) < 10 && Math.abs(s.w - colW) < 5;
    });
    if (m) {
      const gap = s.x - (m.r.x + m.r.w);
      m.gutter = (m.gutter * (m.cols - 1) + gap) / m.cols;
      m.cols += 1;
      m.r = union([m.r, s]);
    } else merged.push({ r: s, cols: 1, gutter: profile.gutter });
  }
  merged.sort((a, b) => Math.round(a.r.x / 12) - Math.round(b.r.x / 12) || a.r.y - b.r.y);
  merged.forEach((m, i) => {
    frames.push({
      id: i === 0 ? "body" : `body-${i + 1}`,
      kind: "text",
      role: "body",
      label: m.cols > 1 ? `Body — ${m.cols} columns` : `Body ${i + 1}`,
      ...roundRect(pad(m.r, 0, 0, 0, (bodyStyle.leading ?? profile.body.leading) * 0.35)),
      bind: "body",
      styleId: "body",
      style: bodyStyle,
      columns: m.cols,
      gutter: r1(m.gutter),
    });
  });
  if (merged.length) notes.push(`${merged.length} threaded body frame${merged.length > 1 ? "s" : ""}, ${merged.reduce((n, m) => n + m.cols, 0)} columns`);

  // Standfirst between deck and body (bold, slightly larger than body).
  const firstBody = merged[0]?.r;
  if (title && firstBody) {
    const sf = content.find((b) => !used.has(b) && b.size >= body * 0.98 && b.size <= body * 1.45 && b.lines >= 2 && b.y > title!.y && b.y + b.h <= firstBody.y + 2 && (b.bold || b.size > body * 1.08));
    if (sf) {
      used.add(sf);
      frames.push({ id: "intro", kind: "text", role: "intro", label: "Standfirst", ...roundRect(pad(sf, 0, 0, 0, sf.h * 0.3)), bind: "summary", styleId: "intro-bold", style: styleFor(sf, { color: ACCENT, align: "left" }), optional: true });
    }
  }

  // One pull quote: mid-size type that is not deck, standfirst or caption.
  if (head) {
    const pq = content.find((b) => !used.has(b) && b.size >= body * 1.25 && b.size < head.size * 0.85 && b.lines >= 2 && b.lines <= 7 && b.chars >= 30);
    if (pq) {
      used.add(pq);
      frames.push({ id: "quote", kind: "text", role: "pullquote", label: "Pull quote", ...roundRect(pad(pq, 0, 0, 0, pq.h * 0.3)), bind: "pullquote.0", styleId: "pullquote", style: styleFor(pq, { color: ACCENT }), optional: true });
    }
  }

  // Byline.
  const by = content.find((b) => !used.has(b) && b.size <= body * 1.05 && b.chars <= 90 && /^\s*(by\b|in conversation|interview(ed)? by|text:)/i.test(b.text));
  if (by) {
    used.add(by);
    frames.push({ id: "byline", kind: "text", role: "byline", label: "Byline", ...roundRect(pad(by, 0, 0, 0, 1)), bind: "byline", styleId: "byline", optional: true });
  }

  if (kind === "message" && merged.length && !frames.some((f) => f.bind === "author.name")) {
    const last = merged.reduce((m, g) => (g.r.y + g.r.h > m.r.y + m.r.h ? g : m)).r;
    const y = Math.min(last.y + last.h + 6, H - 34);
    frames.push({ id: "name", kind: "text", role: "author", label: "Name", x: r1(last.x), y: r1(y), w: r1(Math.min(last.w, 110)), h: 7, bind: "author.name", styleId: "name", style: { color: ink.navy } });
    frames.push({ id: "designation", kind: "text", role: "designation", label: "Designation", x: r1(last.x), y: r1(y + 7.5), w: r1(Math.min(last.w, 110)), h: 10, bind: "author.role", styleId: "designation" });
    notes.push("Sign-off added below the message");
  }

  // Room to grow: headline and deck frames span the live area unless something sits beside them.
  const liveL = Math.min(profile.margins.inside, profile.margins.outside);
  const liveR = W - liveL;
  const blocked = (f: FrameSpec, x0: number, x1: number) =>
    frames.some((o) => o !== f && o.kind !== "shape" && o.role !== "decor" && Math.min(o.y + o.h, f.y + f.h) - Math.max(o.y, f.y) > 2 && o.x < x1 && o.x + o.w > x0 && !(o.x >= f.x && o.x + o.w <= f.x + f.w));
  for (const id of ["headline", "deck"]) {
    const f = frames.find((x) => x.id === id);
    if (!f || f.x + f.w >= liveR - 1) continue;
    if (f.style?.align === "center") {
      const half = Math.min(f.x - liveL, liveR - (f.x + f.w));
      if (half > 0 && !blocked(f, f.x - half, f.x + f.w + half)) Object.assign(f, { x: r1(f.x - half), w: r1(f.w + half * 2) });
    } else if (!blocked(f, f.x, liveR)) f.w = r1(liveR - f.x);
  }

  // One spare line under display text so slightly longer copy still fits.
  for (const id of ["headline", "deck", "intro"]) {
    const f = frames.find((x) => x.id === id);
    if (!f) continue;
    const extra = ((f.style?.leading ?? (f.style?.size ?? 12) * 1.2) * 0.3528) * (id === "intro" ? 2 : 1);
    const clear = !frames.some((o) => o !== f && o.kind !== "shape" && o.x < f.x + f.w && o.x + o.w > f.x && o.y >= f.y + f.h - 0.5 && o.y < f.y + f.h + extra);
    if (clear && f.y + f.h + extra < H - 12) f.h = r1(f.h + extra);
  }

  // Text never runs underneath a photo: trim body frames that overlap an image.
  for (const f of frames.filter((x) => x.bind === "body")) {
    for (const img of frames.filter((x) => x.kind === "image" && x.w * x.h < W * H * 0.8)) {
      const ox = Math.min(f.x + f.w, img.x + img.w) - Math.max(f.x, img.x);
      const oy = Math.min(f.y + f.h, img.y + img.h) - Math.max(f.y, img.y);
      if (ox <= 1 || oy <= 1) continue;
      if (ox > f.w * 0.6) {
        if (img.y + img.h / 2 < f.y + f.h / 2) {
          const bottom = f.y + f.h;
          f.y = r1(img.y + img.h + 4);
          f.h = r1(Math.max(10, bottom - f.y));
        } else f.h = r1(Math.max(10, img.y - 4 - f.y));
      } else if (img.x > f.x) f.w = r1(Math.max(20, img.x - 4 - f.x));
      else {
        const right = f.x + f.w;
        f.x = r1(img.x + img.w + 4);
        f.w = r1(Math.max(20, right - f.x));
      }
    }
  }

  const needsBody = kind !== "feature-opener";
  if (!title || (needsBody && !merged.length) || (kind === "feature-opener" && !imgs.length)) return null;
  if (kind === "feature-opener" && !frames.some((f) => f.bind === "summary")) {
    // Openers carry the standfirst; give it a home below the deck if none was found.
    const below = frames.filter((f) => f.kind === "text").reduce((y, f) => Math.max(y, f.y + f.h), title.y + title.h);
    const slot = { x: title.x, y: below + 4, w: Math.min(title.w, W * 0.62), h: 28 };
    const onPhoto = imgs.some((r) => overlapsArea(slot, r) > 0.2) && !(imgs[0] && overlapsArea(title, imgs[0]) > 0.5);
    if (below + 30 < H - 15 && !onPhoto) frames.push({ id: "intro", kind: "text", role: "intro", label: "Standfirst", x: title.x, y: r1(below + 4), w: r1(Math.min(title.w, W * 0.62)), h: 28, bind: "summary", styleId: "intro", style: { color: imgs[0] && overlapsArea(title, imgs[0]) > 0.5 ? "#f1f3f8" : ink.text }, optional: true });
  }
  // Text after images so it renders on top.
  frames.sort((a, b) => (a.kind === "image" ? 0 : a.kind === "shape" ? 1 : 2) - (b.kind === "image" ? 0 : b.kind === "shape" ? 1 : 2));

  return {
    template: {
      id,
      name: `${REF_TYPE_LABELS[kind]} — from p.${page.number}`,
      pageType: PAGE_TYPE[kind],
      contentTypes: CONTENT_TYPES[kind] ?? [],
      description: `Frame geometry measured from page ${page.number} of “${profile.name}”: ${notes.join(" · ")}.`,
      columns: Math.max(1, merged.reduce((n, m) => n + m.cols, 0)),
      imagePattern: imgs.length ? `${imgs.length} image frame${imgs.length > 1 ? "s" : ""} as in the reference` : "No images",
      hierarchy: frames.filter((f) => f.kind === "text").map((f) => f.label).slice(0, 5).join(" › "),
      status: "active",
      updatedAt: new Date().toISOString(),
      builtIn: false,
      furniture: kind === "feature-opener" ? "none" : "full",
      wordRange: [0, 0],
      frames,
      trim: { ...profile.trim },
      referenceId: profile.id,
      derivation: "geometry",
      sourcePage: page.number,
    },
    notes,
  };
}

function pad(r: RefRect, l: number, t: number, rr: number, b: number): RefRect {
  return { x: r.x - l, y: r.y - t, w: r.w + l + rr, h: r.h + t + b };
}
function roundRect(r: RefRect) {
  return { x: r1(r.x), y: r1(r.y), w: r1(r.w), h: r1(r.h) };
}
function overlapsArea(a: RefRect, b: RefRect) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? (w * h) / (a.w * a.h) : 0;
}

/* -------------------------------------------------------------- adapt */

/** Rescale a house template to the reference trim and apply its type styles. */
export function adaptTemplate(base: Template, profile: ReferenceProfile, id: string, label?: string): Template {
  const sx = profile.trim.width / 205;
  const sy = profile.trim.height / 278;
  const k = Math.min(sx, sy);
  const body = referenceBodyStyle(profile);
  return {
    ...structuredClone(base),
    id,
    name: `${label ?? base.name} — adapted`,
    description: `${base.description} Rescaled to ${profile.trim.width} × ${profile.trim.height} mm and set in the reference body style.`,
    builtIn: false,
    status: "active",
    updatedAt: new Date().toISOString(),
    trim: { ...profile.trim },
    referenceId: profile.id,
    derivation: "adapted",
    duplicatedFrom: base.id,
    frames: base.frames.map((f) => {
      const g = { x: r1(f.x * sx), y: r1(f.y * sy), w: r1(f.w * sx), h: r1(f.h * sy) };
      if (f.kind !== "text") return { ...f, ...g };
      if (f.bind === "body") return { ...f, ...g, style: { ...f.style, ...body }, gutter: profile.gutter };
      if (f.role === "caption" && profile.caption) return { ...f, ...g, style: { ...f.style, size: profile.caption.size, leading: r1(profile.caption.size * 1.3) } };
      const size = f.style?.size;
      return { ...f, ...g, style: size && k !== 1 ? { ...f.style, size: r1(size * k), leading: f.style?.leading ? r1(f.style.leading * k) : undefined } : f.style };
    }),
  };
}

/**
 * Default model page per derivable type: the best-ranked page whose structure can actually be
 * measured into a template (falls back to the top-ranked page).
 */
export function bestModels(profile: ReferenceProfile): Partial<Record<RefPageType, number>> {
  const ranked = rankedPages(profile.pages, profile.body.size, profile.columns);
  const out: Partial<Record<RefPageType, number>> = { ...representatives(profile.pages, profile.body.size, profile.columns) };
  for (const kind of DERIVABLE) {
    const ok = (ranked[kind] ?? []).find((n) => deriveTemplate(profile, profile.pages.find((p) => p.number === n)!, kind, "probe"));
    if (ok) out[kind] = ok;
  }
  return out;
}

/** Template for one page type: measured from the model page when possible, adapted otherwise. */
export function modelTemplate(profile: ReferenceProfile, kind: RefPageType, pageNumber: number | undefined, id: string) {
  const page = profile.pages.find((p) => p.number === pageNumber);
  const d = page ? deriveTemplate(profile, page, kind, id) : null;
  if (d) return { template: d.template, derived: true, notes: d.notes, page };
  return {
    template: adaptTemplate(tpl(FALLBACK[kind]), profile, id, REF_TYPE_LABELS[kind]),
    derived: false,
    notes: [page ? `Page ${page.number} had no clear headline/body structure` : "No model page of this type"],
    page,
  };
}

/* ------------------------------------------------------- publication */

export interface BuildOptions {
  title: string;
  issueLabel: string;
  pageCount: number;
  fill: boolean;
  includeAds: boolean;
  /** Representative page chosen per type (defaults to the detected best page). */
  models: Partial<Record<RefPageType, number>>;
}

export interface BuildResult {
  publication: Publication;
  pages: Page[];
  templates: Template[];
  report: string[];
}

type Slot = { type: RefPageType | "continuation" | "closing"; section?: string };

export function buildFromReference(profile: ReferenceProfile, articles: Article[], settings: Settings, opts: BuildOptions): BuildResult {
  const now = new Date().toISOString();
  const pubId = `pub-${Date.now().toString(36)}`;
  const prefix = `tpl-${profile.id}`;
  const report: string[] = [];
  const reps = { ...bestModels(profile), ...opts.models };

  // Templates: derive where possible, adapt house templates otherwise.
  const templates: Template[] = [];
  const byType: Partial<Record<RefPageType | "continuation" | "closing", Template>> = {};
  const present = new Set(profile.pages.map((p) => p.type));
  for (const kind of DERIVABLE) {
    if (!present.has(kind) && kind !== "article") continue;
    const m = modelTemplate(profile, kind, present.has(kind) ? reps[kind] : undefined, `${prefix}-${kind}`);
    report.push(
      m.derived
        ? `${REF_TYPE_LABELS[kind]}: geometry taken from reference page ${m.page!.number} (${m.notes.join(", ")}).`
        : `${REF_TYPE_LABELS[kind]}: ${m.notes[0].toLowerCase()} — adapted the house template.`,
    );
    templates.push(m.template);
    byType[kind] = m.template;
  }
  for (const [key, base, label] of [
    ["cover", "tpl-cover", "Cover"],
    ["contents", "tpl-contents", "Contents"],
    ["advertisement", "tpl-advertisement", "Advertisement"],
    ["continuation", "tpl-continuation", "Continuation"],
    ["closing", "tpl-closing", "Back cover"],
    ["infographic", "tpl-infographic", "Infographic"],
  ] as const) {
    const t = adaptTemplate(tpl(base), profile, `${prefix}-${key}`, label);
    templates.push(t);
    byType[key] = t;
  }
  for (const t of templates) {
    const sample = articles.find((a) => t.contentTypes.includes(a.contentType));
    if (sample && t.frames.some((f) => f.bind === "body")) {
      const cap = templateCapacity(t, sample, settings);
      t.wordRange = [Math.round(cap * 0.75), cap];
    }
  }

  // Sections from running heads, coloured with the reference palette.
  const palette = profile.palette.length ? profile.palette : [ink.blue, ink.orange, ink.green];
  const refSections: Section[] = profile.sections.slice(0, 10).map((s, i) => ({ id: `sec-${profile.id}-${i}`, name: s.name, color: palette[i % palette.length] }));
  const sectionFor = (name?: string) => refSections.find((s) => s.name === name)?.id;

  // Page plan: resample the reference's page sequence to the requested length.
  const seq = [...profile.pages].sort((a, b) => a.number - b.number);
  const N = Math.max(4, opts.pageCount);
  const slots: Slot[] = Array.from({ length: N }, (_, i) => {
    const p = seq[Math.round((i * (seq.length - 1)) / Math.max(1, N - 1))];
    return { type: p?.type === "other" ? "article" : p?.type ?? "article", section: sectionFor(p?.runningHead) };
  });
  slots.forEach((s, i) => {
    if (i > 0 && (s.type === "cover" || s.type === "contents")) s.type = "article";
    if (!opts.includeAds && s.type === "advertisement") s.type = "article";
  });
  slots[0] = { type: "cover" };
  if (N >= 8 && present.has("contents")) slots[2] = { type: "contents" };
  slots[N - 1] = { type: opts.includeAds && seq[seq.length - 1]?.type === "advertisement" ? "advertisement" : "closing" };
  // Every layout type the reference uses gets at least one page, near where it first appears.
  for (const t of ["message", "interview", "feature-opener", "infographic"] as RefPageType[]) {
    if (!present.has(t) || slots.some((s) => s.type === t) || N < 8) continue;
    const first = seq.findIndex((p) => p.type === t);
    const target = Math.min(N - 3, Math.max(3, Math.round((first * (N - 1)) / Math.max(1, seq.length - 1))));
    const free = slots
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => s.type === "article" && i > 2 && i < N - 2)
      .sort((a, b) => Math.abs(a.i - target) - Math.abs(b.i - target))[0];
    if (free) free.s.type = t;
  }
  for (let i = 1; i < N - 1; i++) {
    if (slots[i].type === "feature-opener") {
      if (i + 1 >= N - 1) slots[i].type = "article";
      else slots[i + 1] = { type: "continuation", section: slots[i].section };
    }
    if (!slots[i].section && i > 0) slots[i].section = slots[i - 1].section;
  }

  // Content: pick the best-fitting unused article for each slot.
  const usedArticles = new Set<string>();
  const pick = (types: ContentType[], t: Template | undefined, needImage = false): Article | undefined => {
    if (!opts.fill || !t) return undefined;
    const cap = t.wordRange[1] || 9999;
    // Templates with a required photo frame should get content that has a photo.
    const wantsImage = needImage || t.frames.some((f) => f.kind === "image" && !f.optional);
    const cands = articles
      .filter((a) => types.includes(a.contentType) && !usedArticles.has(a.id) && a.id !== "art-closing" && (!wantsImage || a.imageIds.length))
      .map((a) => {
        const w = countWords(a.body);
        const fit = w <= cap ? w / cap : 1 - (w - cap) / cap;
        return { a, score: fit + (a.status === "approved" ? 0.15 : 0) + (a.imageIds.length ? 0.1 : 0) };
      })
      .sort((x, y) => y.score - x.score);
    const a = cands[0]?.a;
    if (a) usedArticles.add(a.id);
    else if (wantsImage && !needImage) return pick(types, { ...t, frames: t.frames.filter((f) => f.kind !== "image") }, false);
    return a;
  };

  const pages: Page[] = [];
  const remaining = new Map<string, number>();
  let ad = 0;
  slots.forEach((slot, i) => {
    const n = i + 1;
    let template = byType[slot.type as keyof typeof byType];
    let article: Article | undefined;
    const imageOverrides: Record<string, string> = {};
    let title = "";
    switch (slot.type) {
      case "cover":
        title = "Front cover";
        break;
      case "contents":
        title = "Contents";
        break;
      case "advertisement":
        imageOverrides["image.0"] = ad++ % 2 ? "img-ad-bank" : "img-ad-cloud";
        title = "Advertisement";
        break;
      case "closing":
        article = articles.find((a) => a.id === "art-closing");
        title = "Back cover";
        break;
      case "continuation":
        article = pages[i - 1]?.articleId ? articles.find((a) => a.id === pages[i - 1].articleId) : undefined;
        title = `${pages[i - 1]?.title ?? "Story"} (continued)`;
        break;
      case "interview":
        article = pick(["interview"], template);
        break;
      case "message":
        article = pick(["leadership-message"], template);
        break;
      case "feature-opener":
        article = pick(["feature", "case-study"], template, true);
        break;
      case "infographic":
        article = articles.find((a) => !usedArticles.has(a.id) && (a.facts?.length ?? 0) >= 4 && a.contentType === "feature");
        if (article && opts.fill) usedArticles.add(article.id);
        else article = undefined;
        break;
      default:
        article = pick(["feature", "news-report", "case-study", "event-report"], template);
    }
    if (!template) template = byType.article;
    // Long stories continue overleaf, as the reference does, when the next slot is a plain article.
    if (article && slot.type !== "closing") {
      const cap = template?.wordRange[1] ?? 0;
      const left = (slot.type === "continuation" ? remaining.get(article.id) ?? countWords(article.body) : countWords(article.body)) - cap;
      remaining.set(article.id, left);
      if (left > 60 && slots[i + 1]?.type === "article" && i + 1 < N - 1) slots[i + 1] = { type: "continuation", section: slot.section };
    }
    if (!article && slot.type !== "cover" && slot.type !== "contents" && slot.type !== "advertisement") title ||= `Open slot — ${REF_TYPE_LABELS[slot.type as RefPageType] ?? "article"}`;
    const fixed = slot.type === "cover" || slot.type === "contents" || slot.type === "advertisement";
    const ready = fixed || !!article;
    pages.push({
      id: `${pubId}-p${n}`,
      publicationId: pubId,
      number: n,
      pageType: slot.type === "continuation" ? "article" : slot.type === "closing" ? "closing" : PAGE_TYPE[slot.type],
      title: title || article?.title || "Page",
      sectionId: fixed || slot.type === "closing" ? "sec-front" : slot.section,
      templateId: template?.id,
      articleId: article?.id,
      status: ready ? "draft" : "planned",
      contentOverrides: {},
      imageOverrides,
      frameOverrides: {},
      generatedAt: ready ? now : undefined,
      updatedAt: now,
    });
  });
  // A continuation without a story is just an open article slot.
  for (const p of pages) if (p.title.endsWith("(continued)") && !p.articleId) p.title = "Open slot — article";

  const filled = pages.filter((p) => p.articleId).length;
  report.push(`${N} pages planned from ${seq.length} analysed reference pages; ${filled} filled from the Content Library${opts.fill ? "" : " (filling disabled)"}.`);

  const g = profile.margins;
  const publication: Publication = {
    id: pubId,
    title: opts.title.trim() || profile.name,
    masthead: (opts.title.trim() || profile.name).replace(/\s+/g, ""),
    issueLabel: opts.issueLabel.trim() || "New issue",
    issueDate: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
    stage: "layout",
    description: `Modelled on “${profile.name}” (${profile.pageCount} pages, ${profile.trim.width} × ${profile.trim.height} mm) in the Design Studio.`,
    website: "egov.eletsonline.com",
    tagline: "The ultimate resource for Governance Innovations",
    sections: [...refSections, ...houseSections],
    pageIds: pages.map((p) => p.id),
    trim: { ...profile.trim },
    bleed: profile.bleed || 3,
    grid: { marginTop: g.top, marginBottom: g.bottom, marginInside: g.inside, marginOutside: g.outside, columns: profile.columns, gutter: profile.gutter },
    referenceId: profile.id,
    updatedAt: now,
    updatedBy: "Shyam Kishore",
    coverColor: palette[0],
  };
  return { publication, pages, templates, report };
}

export function tpl(id: string) {
  const t = builtInTemplates.find((x) => x.id === id);
  if (!t) throw new Error(`Missing house template ${id}`);
  return t;
}
