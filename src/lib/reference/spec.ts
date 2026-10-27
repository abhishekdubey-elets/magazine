import { ink } from "../design-tokens";
import type { DesignSpec, EditorialFormat, Finding, FindingSource, FurnitureSpec, LayoutSpec, ReferenceProfile, RefPage, RefPageType, TypeSpec } from "../types";
import { DESIGN_SPEC_SCHEMA } from "../types";
import { fontRole, isFurniture, rankedPages } from "./analyze";
import { deriveTemplate, weightFromName } from "./derive";

/**
 * Design specification: the reusable design system learnt from a reference
 * magazine. Every property is a Finding — its value, how confident the
 * measurement is, whether it was extracted from the PDF, inferred by a rule or
 * filled with a default, and which pages support it. Editors confirm or
 * correct findings before the spec drives an issue.
 */

export const FORMATS: EditorialFormat[] = ["interview", "feature", "government-perspective", "event-report", "news-page", "company-profile"];

export const FORMAT_LABEL: Record<EditorialFormat, string> = {
  interview: "Interview",
  feature: "Feature article",
  "government-perspective": "Government perspective",
  "event-report": "Event report",
  "news-page": "News page",
  "company-profile": "Company profile",
};

/** Formats whose frame geometry can be measured from one reference page; news pages and profiles always use the house layout in the reference's style. */
export const MEASURABLE_FORMATS: EditorialFormat[] = ["interview", "feature", "government-perspective", "event-report"];

/** Which reference page types can serve as a model for each editorial format, best first. */
export const FORMAT_MODELS: Record<EditorialFormat, RefPageType[]> = {
  interview: ["interview"],
  feature: ["feature-opener", "article"],
  "government-perspective": ["message", "interview"],
  "event-report": ["article", "feature-opener"],
  "news-page": ["article"],
  "company-profile": ["article", "advertisement"],
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

function finding<T>(value: T, confidence: number, source: FindingSource, evidence: number[] = [], note?: string): Finding<T> {
  return { value, confidence: Math.round(clamp(confidence) * 100) / 100, source, evidence: [...new Set(evidence)].sort((a, b) => a - b).slice(0, 24), ...(note ? { note } : {}) };
}

/** Confidence that grows with the number of independent measurements. */
const bySamples = (n: number, full = 8, floor = 0.35) => (n <= 0 ? 0 : clamp(floor + (1 - floor) * Math.min(1, n / full)));

function typeSpec(t: { font: string; role: TypeSpec["role"]; size: number; leading?: number; align?: TypeSpec["align"] }, defaultLeading: number): TypeSpec {
  return {
    font: t.font,
    role: t.role,
    size: r1(t.size),
    leading: r1(t.leading ?? defaultLeading),
    weight: t.role === "display" ? 400 : Math.min(t.role === "headline" ? 800 : 900, weightFromName(t.font)),
    ...(t.align ? { align: t.align } : {}),
  };
}

const ASPECT_LABELS: { label: string; ratio: number }[] = [
  { label: "Tall portrait 2:3", ratio: 2 / 3 },
  { label: "Portrait 3:4", ratio: 3 / 4 },
  { label: "Square", ratio: 1 },
  { label: "Landscape 4:3", ratio: 4 / 3 },
  { label: "Landscape 3:2", ratio: 3 / 2 },
  { label: "Wide 16:9", ratio: 16 / 9 },
  { label: "Panorama", ratio: 2.6 },
];

function imagesFinding(profile: ReferenceProfile) {
  const { width: W, height: H } = profile.trim;
  const all = profile.pages.flatMap((p) => p.images.map((r) => ({ r, page: p.number }))).filter(({ r }) => r.w >= 15 && r.h >= 15);
  const counts = new Map<string, { n: number; pages: number[] }>();
  let fullBleed = 0;
  for (const { r, page } of all) {
    const ratio = r.w / r.h;
    const best = ASPECT_LABELS.reduce((a, b) => (Math.abs(Math.log(b.ratio / ratio)) < Math.abs(Math.log(a.ratio / ratio)) ? b : a));
    const e = counts.get(best.label) ?? { n: 0, pages: [] };
    e.n++;
    e.pages.push(page);
    counts.set(best.label, e);
    if (r.x <= 0.5 || r.y <= 0.5 || r.x + r.w >= W - 0.5 || r.y + r.h >= H - 0.5) fullBleed++;
  }
  const ratios = [...counts.entries()]
    .map(([label, e]) => ({ label, ratio: r1(ASPECT_LABELS.find((a) => a.label === label)!.ratio * 100) / 100, share: Math.round((e.n / Math.max(1, all.length)) * 100), pages: e.pages }))
    .sort((a, b) => b.share - a.share);
  const coverage = profile.pages.map((p) => p.imageCoverage);
  const avg = coverage.length ? coverage.reduce((a, b) => a + b, 0) / coverage.length : 0;
  const density: "sparse" | "balanced" | "dense" = avg < 0.22 ? "sparse" : avg > 0.45 ? "dense" : "balanced";
  return {
    aspectRatios: finding(
      ratios.map(({ label, ratio, share }) => ({ label, ratio, share })),
      bySamples(all.length, 12),
      all.length ? "extracted" : "default",
      ratios.flatMap((r) => r.pages).slice(0, 24),
      all.length ? `${all.length} image placements measured` : "No image placements found",
    ),
    fullBleedShare: finding(Math.round((fullBleed / Math.max(1, all.length)) * 100), bySamples(all.length, 12), all.length ? "extracted" : "default"),
    density: finding(density, bySamples(coverage.length, 10), "inferred", profile.pages.map((p) => p.number), `Average image coverage ${Math.round(avg * 100)}%`),
  };
}

function furnitureFinding(profile: ReferenceProfile): Finding<FurnitureSpec> {
  const { width: W, height: H } = profile.trim;
  const body = profile.body.size;
  const heads: { page: number; outside: boolean; center: boolean; y: number }[] = [];
  const folios: { page: number; outside: boolean; center: boolean; y: number }[] = [];
  for (const p of profile.pages) {
    const even = p.number % 2 === 0;
    for (const b of p.blocks) {
      if (!isFurniture(b, body, H)) continue;
      const cx = b.x + b.w / 2;
      const center = Math.abs(cx - W / 2) < W * 0.12;
      const left = cx < W / 2;
      const outside = even ? left : !left;
      if (b.y < H * 0.085 && /[A-Za-z]{3}/.test(b.text)) heads.push({ page: p.number, outside, center, y: r1(b.y) });
      else if (b.y + b.h > H * 0.925 && /^\s*\d{1,3}\s*$/.test(b.text)) folios.push({ page: p.number, outside, center, y: r1(H - (b.y + b.h)) });
    }
  }
  const pick = <T extends { outside: boolean; center: boolean }>(xs: T[]) => {
    if (!xs.length) return "none" as const;
    const c = xs.filter((x) => x.center).length;
    const o = xs.filter((x) => x.outside).length;
    if (c > xs.length / 2) return "center" as const;
    return o >= xs.length / 2 ? ("outside" as const) : ("inside" as const);
  };
  const rh = pick(heads);
  const fo = pick(folios);
  const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[xs.length >> 1] : 0);
  const value: FurnitureSpec = {
    runningHead: rh === "none" ? "none" : (`top-${rh}` as FurnitureSpec["runningHead"]),
    folio: fo === "none" ? "none" : (`bottom-${fo}` as FurnitureSpec["folio"]),
    headY: r1(median(heads.map((h) => h.y)) || 10),
    folioY: r1(median(folios.map((f) => f.y)) || 8),
  };
  const n = heads.length + folios.length;
  return finding(value, n ? bySamples(n, 10, 0.45) : 0.3, n ? "inferred" : "default", [...heads, ...folios].map((x) => x.page), n ? `${heads.length} running heads and ${folios.length} folios found in the page furniture` : "No running heads or folios detected — default furniture");
}

function subheadingFinding(profile: ReferenceProfile): Finding<TypeSpec | null> {
  const body = profile.body.size;
  const H = profile.trim.height;
  const cands = profile.pages.flatMap((p) =>
    p.blocks
      .filter((b) => !isFurniture(b, body, H) && b.bold && b.size > body * 1.02 && b.size < body * 1.6 && b.lines <= 2 && b.chars >= 8 && b.chars <= 70)
      .map((b) => ({ b, page: p.number })),
  );
  if (cands.length < 2) return finding(null, 0.3, "default", [], "No bold sub-headings found between body size and 1.6× body — the house subheading style will be used");
  const sizes = cands.map((c) => Math.round(c.b.size * 2) / 2);
  const size = sizes.sort((a, b) => sizes.filter((x) => x === b).length - sizes.filter((x) => x === a).length)[0];
  const sample = cands.find((c) => Math.round(c.b.size * 2) / 2 === size)!.b;
  return finding(typeSpec({ font: sample.font, role: fontRole(sample.font), size, leading: sample.leading || size * 1.2, align: "left" }, size * 1.2), bySamples(cands.length, 8), "inferred", cands.map((c) => c.page), `${cands.length} bold sub-headings at ~${size} pt`);
}

function quoteFinding(profile: ReferenceProfile): Finding<TypeSpec | null> {
  const body = profile.body.size;
  const head = profile.headline.size;
  const H = profile.trim.height;
  const cands = profile.pages.flatMap((p) =>
    p.blocks
      .filter((b) => !isFurniture(b, body, H) && b.size >= body * 1.3 && b.size < head * 0.8 && b.lines >= 2 && b.lines <= 8 && b.chars >= 40 && b.chars <= 320 && !/\?$/.test(b.text.trim()))
      .map((b) => ({ b, page: p.number })),
  );
  if (cands.length < 2) return finding(null, 0.3, "default", [], "No pull-quote sized text found — the house pull quote style will be used");
  const sizes = cands.map((c) => Math.round(c.b.size));
  const size = sizes.sort((a, b) => sizes.filter((x) => x === b).length - sizes.filter((x) => x === a).length)[0];
  const sample = cands.find((c) => Math.round(c.b.size) === size)!.b;
  return finding(typeSpec({ font: sample.font, role: fontRole(sample.font), size, leading: sample.leading || size * 1.2, align: "left" }, size * 1.2), bySamples(cands.length, 6, 0.4), "inferred", cands.map((c) => c.page), `${cands.length} candidate blocks at ~${size} pt`);
}

function logoFinding(profile: ReferenceProfile): Finding<"top-left" | "top-center" | "top-right" | "none"> {
  const cover = profile.pages.find((p) => p.number === 1);
  const { width: W, height: H } = profile.trim;
  const small = cover?.images.filter((r) => r.y < H * 0.2 && r.w < W * 0.5 && r.h < H * 0.15 && r.w * r.h > 150) ?? [];
  if (!small.length) return finding("none", 0.3, "inferred", cover ? [1] : [], "No small image in the top fifth of the cover — the masthead may be set as text");
  const cx = small[0].x + small[0].w / 2;
  const pos = cx < W * 0.38 ? "top-left" : cx > W * 0.62 ? "top-right" : "top-center";
  return finding(pos, 0.55, "inferred", [1], `Small graphic (${Math.round(small[0].w)} × ${Math.round(small[0].h)} mm) near the top of the cover`);
}

/** Model pages per editorial format: best reference page of a compatible type whose structure can be measured. */
export function layoutModels(profile: ReferenceProfile): Record<EditorialFormat, { page?: RefPage; kind?: RefPageType; derived: boolean; examples: number[] }> {
  const ranked = rankedPages(profile.pages, profile.body.size, profile.columns);
  const out = {} as Record<EditorialFormat, { page?: RefPage; kind?: RefPageType; derived: boolean; examples: number[] }>;
  for (const f of FORMATS) {
    let best: { page: RefPage; kind: RefPageType; derived: boolean } | undefined;
    const examples: number[] = [];
    for (const kind of FORMAT_MODELS[f]) {
      const nums = ranked[kind] ?? [];
      examples.push(...nums);
      if (best) continue;
      for (const n of nums) {
        const page = profile.pages.find((p) => p.number === n)!;
        const derivable = MEASURABLE_FORMATS.includes(f) && (["article", "interview", "message", "feature-opener"] as RefPageType[]).includes(kind);
        if (derivable && deriveTemplate(profile, page, kind, "probe")) {
          best = { page, kind, derived: true };
          break;
        }
        best ??= { page, kind, derived: false };
      }
    }
    out[f] = { page: best?.page, kind: best?.kind, derived: !!best?.derived, examples: [...new Set(examples)].slice(0, 8) };
  }
  return out;
}

/** Build (or rebuild) the design specification from a measured reference. */
export function deriveDesignSpec(profile: ReferenceProfile, previous?: DesignSpec): DesignSpec {
  const ev = profile.evidence;
  const now = new Date().toISOString();
  const allPages = profile.pages.map((p) => p.number);
  const gridPages = ev?.gridPages ?? [];
  const fonts = profile.fonts.map((f) => ({ name: f.name, share: f.share, substitute: f.substitute, available: sameFamily(f.name, f.substitute) }));
  const models = layoutModels(profile);
  const layouts: LayoutSpec[] = FORMATS.map((format) => {
    const m = models[format];
    const derivation: LayoutSpec["derivation"] = m.page ? (m.derived ? "geometry" : "adapted") : "inferred";
    return {
      format,
      templateId: `tpl-${profile.id}-${format}`,
      derivation,
      sourcePage: m.page?.number,
      examples: m.examples,
      confidence: derivation === "geometry" ? clamp(0.55 + (m.page?.confidence ?? 0) * 0.4) : derivation === "adapted" ? 0.5 : 0.3,
      note:
        derivation === "geometry"
          ? `Frame geometry measured from reference page ${m.page!.number} (${m.kind}${m.page!.ai?.adopted ? ", type recognised by the AI" : ""})`
          : derivation === "adapted"
            ? MEASURABLE_FORMATS.includes(format)
              ? `Reference page ${m.page!.number} (${m.kind}) has no clear headline/body structure — the house template is rescaled and restyled`
              : `${FORMAT_LABEL[format]} pages hold several stories or structured panels; the house layout is set in the reference's grid, type and colour (reference page ${m.page!.number} shown for comparison)`
            : `The reference has no ${FORMAT_LABEL[format].toLowerCase()} page — a compatible house template is styled from this design system`,
    };
  });

  const typo = profile.typeScale;
  const spec: DesignSpec = {
    schema: DESIGN_SPEC_SCHEMA,
    id: previous?.id ?? `spec-${profile.id}`,
    referenceId: profile.id,
    version: (previous?.version ?? 0) + 1,
    name: profile.name,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    identity: {
      palette: finding(profile.palette.length ? profile.palette : [ink.blue, ink.orange, ink.navy], profile.palette.length ? 0.7 : 0.2, profile.palette.length ? "inferred" : "default", allPages, profile.palette.length ? "Dominant flat colours of the rendered pages" : "No distinct accent colours found — house palette"),
      accent: finding(profile.palette[0] ?? ink.blue, profile.palette.length ? 0.6 : 0.2, profile.palette.length ? "inferred" : "default", allPages),
      logoPlacement: logoFinding(profile),
    },
    page: {
      trim: finding({ ...profile.trim }, profile.trimSource === "trimbox" ? 0.97 : 0.6, "extracted", [1], profile.trimSource === "trimbox" ? "From the PDF TrimBox" : "No TrimBox — the page box is treated as the trim size"),
      orientation: profile.trim.width > profile.trim.height ? "landscape" : "portrait",
      bleed: finding(profile.bleed || 3, profile.bleedSource === "bleedbox" ? 0.92 : profile.bleedSource === "default" ? 0.5 : 0.3, profile.bleedSource === "bleedbox" ? "extracted" : profile.bleedSource === "default" ? "inferred" : "default", [1], profile.bleedSource === "bleedbox" ? "From the PDF BleedBox" : profile.bleedSource === "default" ? "Estimated from the page box around the trim" : "Not specified in the PDF — 3 mm assumed"),
      margins: finding({ ...profile.margins }, ev ? bySamples(Math.min(ev.marginSamples.top, ev.marginSamples.inside, ev.marginSamples.outside, ev.marginSamples.bottom), 6) : 0.5, gridPages.length ? "extracted" : "default", gridPages, gridPages.length ? `Measured from body text on ${gridPages.length} text-heavy page${gridPages.length === 1 ? "" : "s"}` : "No text-heavy pages — default margins"),
      columns: finding(profile.columns, gridPages.length ? bySamples(gridPages.length, 6) : 0.4, gridPages.length ? "extracted" : "default", gridPages),
      gutter: finding(profile.gutter, ev ? bySamples(ev.gutterSamples, 8) : 0.5, ev?.gutterSamples ? "extracted" : "default", gridPages),
      furniture: furnitureFinding(profile),
    },
    typography: {
      body: finding(typeSpec({ ...profile.body }, profile.body.leading), ev ? bySamples(ev.bodyBlocks, 30) : 0.5, profile.hasTextLayer ? "extracted" : "default", allPages, profile.hasTextLayer ? `${ev?.bodyBlocks ?? "?"} body text blocks` : "No live text — house body style"),
      headline: finding(typeSpec({ ...profile.headline, leading: profile.headline.size * 1.02, align: "left" }, profile.headline.size * 1.02), ev ? bySamples(ev.headlineSamples, 8) : 0.5, profile.hasTextLayer ? "extracted" : "default", allPages, ev ? `Median of the largest type on ${ev.headlineSamples} pages` : undefined),
      deck: finding(profile.deck ? typeSpec({ ...profile.deck, leading: profile.deck.size * 1.25, align: "left" }, profile.deck.size * 1.25) : null, profile.deck ? bySamples(ev?.deckSamples ?? 2, 8) : 0.3, profile.deck ? "inferred" : "default", allPages, profile.deck ? undefined : "No deck-sized text found — house deck style"),
      caption: finding(profile.caption ? typeSpec({ ...profile.caption, leading: profile.caption.size * 1.3, align: "left" }, profile.caption.size * 1.3) : null, profile.caption ? bySamples(ev?.captionSamples ?? 2, 8) : 0.3, profile.caption ? "inferred" : "default", allPages, profile.caption ? undefined : "No caption-sized text found — house caption style"),
      quote: quoteFinding(profile),
      subheading: subheadingFinding(profile),
      fonts,
      styleNames: ["Cover Title", "Headline", "Deck", "Standfirst", "Body", "Body First", "Body Question", "Subheading", "Caption", "Pull Quote", "Byline", "Name", "Designation", "Kicker", "Running Head", "Page Number", "Facts"],
    },
    images: imagesFinding(profile),
    structure: {
      sections: finding(
        profile.sections,
        profile.sections.length ? bySamples(profile.sections.reduce((n, s) => n + s.pages.length, 0), 10, 0.45) : 0.2,
        profile.sections.length ? (profile.ai && profile.pages.some((p) => p.ai?.section && p.runningHead === p.ai.section) ? "ai" : "inferred") : "default",
        profile.sections.flatMap((s) => s.pages),
        profile.sections.length ? (profile.ai ? "Running heads measured from the pages and section names read by the AI" : "Repeated running heads") : "No repeating running heads — house sections",
      ),
      pageTypes: (Object.keys(models) as EditorialFormat[]).length
        ? [...new Set(profile.pages.map((p) => p.type))].map((type) => ({ type, pages: profile.pages.filter((p) => p.type === type).map((p) => p.number) }))
        : [],
      order: [...profile.pages].sort((a, b) => a.number - b.number).map((p) => p.type),
    },
    layouts,
    print: { pdfPreset: "[PDF/X-4:2008]", minPpi: 200, targetPpi: 300 },
    review: {
      status: "draft",
      edited: [],
      warnings: [
        ...(profile.hasTextLayer ? [] : ["The PDF has little or no live text (scanned or outlined). Typography and grid are defaults — confirm them by hand."]),
        ...(profile.trimSource === "mediabox" ? ["No TrimBox in the PDF: the page size may include bleed or slug. Confirm the trim size."] : []),
        ...(profile.oddSizes?.length ? [`${profile.oddSizes.length} page(s) have a different size from page 1 (e.g. p.${profile.oddSizes[0].number}: ${profile.oddSizes[0].width} × ${profile.oddSizes[0].height} mm). Gatefolds or inserts are not reproduced.`] : []),
        ...(ev?.blankPages?.length ? [`Blank pages in the reference: ${ev.blankPages.join(", ")}.`] : []),
        ...layouts.filter((l) => l.derivation === "inferred").map((l) => `${FORMAT_LABEL[l.format]}: no example in the reference — the layout is inferred from the design system.`),
      ],
    },
  };
  if (typo.length === 0 && profile.hasTextLayer) spec.review.warnings.push("No type scale could be measured.");
  // Keep an editor's confirmed values when the spec is rebuilt.
  if (previous) {
    for (const path of previous.review.edited) {
      const prev = getFinding(previous, path);
      const cur = getFinding(spec, path);
      if (prev && cur) Object.assign(cur, { value: prev.value, source: "confirmed", confidence: 1, detected: cur.detected ?? cur.value, note: prev.note });
    }
    spec.review = { ...spec.review, status: previous.review.status, confirmedBy: previous.review.confirmedBy, confirmedAt: previous.review.confirmedAt, edited: [...previous.review.edited] };
  }
  return spec;
}

/** Dotted path into the spec's findings, e.g. "page.margins" or "typography.body". */
export function getFinding(spec: DesignSpec, path: string): Finding<unknown> | undefined {
  const [group, key] = path.split(".");
  const g = (spec as unknown as Record<string, Record<string, unknown>>)[group];
  const f = g?.[key];
  return f && typeof f === "object" && "confidence" in (f as object) ? (f as Finding<unknown>) : undefined;
}

/** An editor sets or confirms a finding. Returns a new spec version. */
export function confirmFinding(spec: DesignSpec, path: string, value?: unknown, by?: string): DesignSpec {
  const next = structuredClone(spec);
  const f = getFinding(next, path);
  if (!f) throw new Error(`Unknown finding ${path}`);
  if (value !== undefined && JSON.stringify(value) !== JSON.stringify(f.value)) {
    f.detected ??= f.value;
    f.value = value;
    if (!next.review.edited.includes(path)) next.review.edited.push(path);
  }
  f.source = "confirmed";
  f.confidence = 1;
  f.note = by ? `Confirmed by ${by}` : "Confirmed by an editor";
  next.version += 1;
  next.updatedAt = new Date().toISOString();
  return next;
}

export function confirmSpec(spec: DesignSpec, by: string): DesignSpec {
  return { ...spec, version: spec.version + 1, updatedAt: new Date().toISOString(), review: { ...spec.review, status: "confirmed", confirmedBy: by, confirmedAt: new Date().toISOString() } };
}

/** Findings below this confidence are shown as estimates to confirm. */
export const LOW_CONFIDENCE = 0.6;

export function lowConfidenceFindings(spec: DesignSpec): { path: string; label: string; finding: Finding<unknown> }[] {
  const out: { path: string; label: string; finding: Finding<unknown> }[] = [];
  for (const [path, label] of Object.entries(FINDING_LABELS)) {
    const f = getFinding(spec, path);
    if (f && f.confidence < LOW_CONFIDENCE && f.source !== "confirmed") out.push({ path, label, finding: f });
  }
  return out;
}

export const FINDING_LABELS: Record<string, string> = {
  "page.trim": "Trim size",
  "page.bleed": "Bleed",
  "page.margins": "Margins",
  "page.columns": "Columns",
  "page.gutter": "Gutter",
  "page.furniture": "Running heads & folios",
  "typography.body": "Body text",
  "typography.headline": "Headline",
  "typography.deck": "Deck",
  "typography.caption": "Caption",
  "typography.quote": "Pull quote",
  "typography.subheading": "Sub-heading",
  "identity.palette": "Colour palette",
  "identity.accent": "Accent colour",
  "identity.logoPlacement": "Logo placement",
  "images.aspectRatios": "Image aspect ratios",
  "images.fullBleedShare": "Full-bleed images",
  "images.density": "Image density",
  "structure.sections": "Sections",
};

/**
 * Apply the (possibly edited) spec back onto the profile so template
 * derivation and issue generation use the confirmed values.
 */
export function applySpec(profile: ReferenceProfile, spec: DesignSpec): ReferenceProfile {
  const body = spec.typography.body.value;
  const head = spec.typography.headline.value;
  return {
    ...profile,
    trim: { ...spec.page.trim.value },
    bleed: spec.page.bleed.value,
    margins: { ...spec.page.margins.value },
    columns: spec.page.columns.value,
    gutter: spec.page.gutter.value,
    palette: [...spec.identity.palette.value],
    body: { font: body.font, role: body.role, size: body.size, leading: body.leading, align: body.align === "justify" ? "justify" : "left" },
    headline: { font: head.font, role: head.role, size: head.size },
    deck: spec.typography.deck.value ? { font: spec.typography.deck.value.font, role: spec.typography.deck.value.role, size: spec.typography.deck.value.size } : profile.deck,
    caption: spec.typography.caption.value ? { font: spec.typography.caption.value.font, role: spec.typography.caption.value.role, size: spec.typography.caption.value.size } : profile.caption,
    sections: spec.structure.sections.value,
    spec,
  };
}

/** True when a reference font is the same family as the browser substitute (no visual substitution). */
export function sameFamily(fontName: string, substitute: string) {
  const fam = fontName.split(/[-,]/)[0].toLowerCase().replace(/[\s_]/g, "");
  return fam.startsWith(substitute.toLowerCase().replace(/[\s_]/g, ""));
}

/** Human summary line for a finding's provenance. */
export function describeSource(f: Finding<unknown>): string {
  const pct = Math.round(f.confidence * 100);
  switch (f.source) {
    case "confirmed":
      return "Confirmed by an editor";
    case "extracted":
      return `Extracted from the PDF · ${pct}% confidence${f.evidence.length ? ` · p. ${f.evidence.slice(0, 6).join(", ")}${f.evidence.length > 6 ? "…" : ""}` : ""}`;
    case "inferred":
      return `Inferred from measurements · ${pct}% confidence${f.evidence.length ? ` · p. ${f.evidence.slice(0, 6).join(", ")}${f.evidence.length > 6 ? "…" : ""}` : ""}`;
    case "ai":
      return `Recognised by the AI from the page images · ${pct}% confidence${f.evidence.length ? ` · p. ${f.evidence.slice(0, 6).join(", ")}${f.evidence.length > 6 ? "…" : ""}` : ""}`;
    default:
      return `Default value (not found in the reference) · ${pct}% confidence`;
  }
}

/** An editor picks the reference page that models a format. Returns a new spec version. */
export function chooseLayoutModel(profile: ReferenceProfile, spec: DesignSpec, format: EditorialFormat, pageNumber: number): DesignSpec {
  const page = profile.pages.find((p) => p.number === pageNumber);
  if (!page) throw new Error(`Reference page ${pageNumber} was not measured`);
  const measurable = MEASURABLE_FORMATS.includes(format);
  const derivable = (["article", "interview", "message", "feature-opener"] as RefPageType[]).includes(page.type);
  const geometry = measurable && derivable && !!deriveTemplate(profile, page, page.type, "probe");
  const next = structuredClone(spec);
  const layout = next.layouts.find((l) => l.format === format)!;
  layout.sourcePage = pageNumber;
  layout.derivation = geometry ? "geometry" : "adapted";
  layout.confidence = geometry ? clamp(0.6 + page.confidence * 0.4) : 0.5;
  layout.note = geometry ? `Frame geometry measured from reference page ${pageNumber} (${page.type}), chosen by an editor` : `Reference page ${pageNumber} (${page.type}) chosen by an editor; its structure could not be measured, so the house template is adapted`;
  if (!layout.examples.includes(pageNumber)) layout.examples.unshift(pageNumber);
  const key = `layouts.${format}`;
  if (!next.review.edited.includes(key)) next.review.edited.push(key);
  next.version += 1;
  next.updatedAt = new Date().toISOString();
  return next;
}

/** Rebuild the spec after the reference was corrected (page types), keeping editor edits. */
export function rederiveSpec(profile: ReferenceProfile): DesignSpec {
  const next = deriveDesignSpec(profile, profile.spec);
  // Editor-chosen layout models survive a rebuild.
  for (const l of profile.spec?.layouts ?? []) {
    if (profile.spec!.review.edited.includes(`layouts.${l.format}`)) Object.assign(next.layouts.find((x) => x.format === l.format)!, l);
  }
  return next;
}
