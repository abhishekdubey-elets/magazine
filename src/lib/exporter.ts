"use client";

import { MM_PER_PT, paragraphStyles } from "./design-tokens";
import { fontDisplayNames } from "./fonts";
import { findImage, linkName } from "./images";
import { renderSampleSvg } from "./artwork";
import { resolvePage, storyPages, storyBody, type LayoutContext, type ResolvedPage } from "./layout-engine";
import { buildInDesignManifest } from "@/services/indesign";
import type { ExportSettings, ImageAsset, QAIssue } from "./types";

/* ------------------------------------------------------------ page range */

export function parseRange(spec: string, max: number): number[] {
  const out = new Set<number>();
  for (const part of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*(?:-|–)\s*(\d+)$/);
    if (m) {
      const [a, b] = [Number(m[1]), Number(m[2])].sort((x, y) => x - y);
      for (let i = a; i <= b; i++) if (i >= 1 && i <= max) out.add(i);
    } else if (/^\d+$/.test(part)) {
      const n = Number(part);
      if (n >= 1 && n <= max) out.add(n);
    } else {
      throw new Error(`“${part}” is not a valid page or range.`);
    }
  }
  return [...out].sort((a, b) => a - b);
}

export function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");

/* ---------------------------------------------------- structured package */

function serializeElement(r: ResolvedPage, el: ResolvedPage["elements"][number], uploads: ImageAsset[]) {
  const asset = el.kind === "image" ? findImage(el.imageId, uploads) : undefined;
  return {
    id: el.id,
    kind: el.kind,
    role: el.role,
    label: el.frame.label,
    bind: el.frame.bind ?? null,
    geometryMm: { x: el.x, y: el.y, width: el.w, height: el.h },
    columns: el.columns,
    gutterMm: el.gutter,
    paragraphStyle: el.frame.styleId ? paragraphStyles[el.frame.styleId]?.indesignName : null,
    style: el.kind === "text" ? { ...el.style, fontFamily: fontDisplayNames[el.style.font] } : undefined,
    text: el.kind === "text" && el.frame.bind !== "body" ? el.text : undefined,
    paragraphs: el.slices?.map((s) => ({ kind: s.kind, text: s.text, continued: s.continued, continues: s.split })),
    oversetWords: el.oversetWords ?? 0,
    image: asset ? { id: asset.id, name: asset.name, fit: el.imageFit, focus: { x: el.focusX, y: el.focusY }, link: linkName(asset) } : el.kind === "image" ? null : undefined,
    fill: el.fill ?? el.background ?? undefined,
    overridden: el.overridden || el.textOverridden,
    pageOverride: el.textOverridden || undefined,
    page: r.page.number,
  };
}

export function buildContentPackage(ctx: LayoutContext, uploads: ImageAsset[], pageNumbers: number[], qa: QAIssue[], includeQa: boolean) {
  const pages = ctx.pages.filter((p) => pageNumbers.includes(p.number)).sort((a, b) => a.number - b.number);
  const resolved = pages.map((p) => resolvePage(ctx, p));
  const articleIds = new Set(pages.map((p) => p.articleId).filter(Boolean) as string[]);
  const templateIds = new Set(pages.map((p) => p.templateId).filter(Boolean) as string[]);
  const imageIds = new Set(resolved.flatMap((r) => r.elements.map((e) => e.imageId)).filter(Boolean) as string[]);
  return {
    schema: "pressflow.content-package/1",
    generatedAt: new Date().toISOString(),
    generator: "Elets PressFlow AI — browser demo",
    note: "Structured page definitions produced by the browser layout engine. This is not an InDesign document.",
    publication: {
      id: ctx.publication.id,
      title: ctx.publication.title,
      issue: ctx.publication.issueLabel,
      trimMm: ctx.publication.trim,
      bleedMm: ctx.publication.bleed,
      sections: ctx.publication.sections,
    },
    pages: resolved.map((r) => ({
      id: r.page.id,
      number: r.page.number,
      side: r.isLeft ? "verso" : "recto",
      type: r.page.pageType,
      status: r.page.status,
      section: r.section?.name ?? null,
      template: r.template ? { id: r.template.id, name: r.template.name, furniture: r.template.furniture } : null,
      articleId: r.page.articleId ?? null,
      storyContinuesFrom: r.continuesFrom ?? null,
      storyContinuesTo: r.continuesTo ?? null,
      elements: r.elements.map((el) => serializeElement(r, el, uploads)),
    })),
    articles: ctx.pages.length
      ? [...articleIds].map((id) => {
          const a = ctx.articles[id];
          return { ...a, storyText: storyBody(ctx.pages, a), storyPages: storyPages(ctx.pages, id).map((p) => p.number) };
        })
      : [],
    templates: [...templateIds].map((id) => ctx.templates[id]),
    images: [...imageIds].map((id) => {
      const a = findImage(id, uploads);
      return a ? { id: a.id, name: a.name, source: a.source, widthPx: a.width, heightPx: a.height, vector: !!a.vector, link: linkName(a) } : { id, missing: true };
    }),
    paragraphStyles: Object.values(paragraphStyles).map((p) => ({ ...p, fontFamily: fontDisplayNames[p.font] })),
    qa: includeQa ? qa.filter((i) => pageNumbers.includes(i.pageNumber) && i.severity !== "passed") : undefined,
  };
}

/* -------------------------------------------------------- handoff (zip) */

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const [, b64] = dataUrl.split(",");
  if (dataUrl.includes(";base64,")) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new TextEncoder().encode(decodeURIComponent(b64));
}

export async function buildHandoffZip(ctx: LayoutContext, uploads: ImageAsset[], pageNumbers: number[], qa: QAIssue[], settings: ExportSettings) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const pkg = buildContentPackage(ctx, uploads, pageNumbers, qa, true);
  const manifest = buildInDesignManifest(ctx, uploads, pageNumbers, { bleed: settings.bleed });
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("content-package.json", JSON.stringify(pkg, null, 2));
  for (const story of manifest.stories) zip.file(`stories/${story.id}.txt`, story.taggedText);
  for (const img of pkg.images) {
    if ("missing" in img) continue;
    const asset = findImage(img.id, uploads)!;
    if (asset.source === "sample") zip.file(img.link, renderSampleSvg(asset.id));
    else if (asset.src) zip.file(img.link, dataUrlToBytes(asset.src));
  }
  zip.file(
    "README.md",
    [
      `# InDesign handoff package — ${ctx.publication.title}, ${ctx.publication.issueLabel}`,
      "",
      "Generated by Elets PressFlow AI (browser demo mode).",
      "",
      "**This package does not contain an .indd file.** It is a structured, script-ready description of the",
      "pages so that a connected InDesign service (desktop ExtendScript/UXP or InDesign Server) can build",
      "native documents with real paragraph styles, threaded text frames and linked images.",
      "",
      "## Contents",
      "- `manifest.json` — document setup (trim, bleed, margins, columns), paragraph-style mapping, and every page's frames in points with threading order.",
      "- `stories/*.txt` — story text tagged with paragraph style names (`<ps:Body/Justified>`).",
      "- `links/` — image assets referenced by image frames (sample artwork is SVG).",
      "- `content-package.json` — the full browser page model, articles and QA findings.",
      "",
      "## Status",
      `- Pages: ${pageNumbers.join(", ")}`,
      `- Open QA errors: ${qa.filter((i) => i.severity === "error" && pageNumbers.includes(i.pageNumber)).length}; warnings: ${qa.filter((i) => i.severity === "warning" && pageNumbers.includes(i.pageNumber)).length}`,
      "- Fonts are referenced by family name only; licensed font files are not included.",
      "",
      "See `src/services/indesign.ts` in the PressFlow codebase for the integration boundary.",
    ].join("\n"),
  );
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

/* ------------------------------------------------------- raster outputs */

export type Quality = ExportSettings["quality"];
export const PIXEL_RATIO: Record<Quality, number> = { draft: 1, standard: 1.5, high: 2.5 };
/** Effective resolution: 4 CSS px per mm at 1× ≈ 101.6 ppi. */
export const ppiFor = (q: Quality) => Math.round(PIXEL_RATIO[q] * 4 * 25.4);

export async function capturePages(
  nodes: HTMLElement[],
  quality: Quality,
  format: "png" | "jpeg",
  onProgress: (i: number) => void,
): Promise<string[]> {
  const { toJpeg, toPng, getFontEmbedCSS } = await import("html-to-image");
  // html-to-image waits for an animation frame after decoding each image; frames never
  // fire while the tab is in the background, so use a timer for the duration of the export.
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(performance.now()), 0);
  try {
    const fontEmbedCSS = nodes[0] ? await getFontEmbedCSS(nodes[0]) : undefined;
    // html-to-image floors copied font sizes (and subtracts 0.1px), which shrinks point-based
    // type by ~6% and changes line breaks. Page elements carry exact inline font sizes, so
    // copy every computed property except font-size.
    const includeStyleProperties = Array.from(window.getComputedStyle(document.documentElement)).filter((p) => p !== "font-size");
    const out: string[] = [];
    for (let i = 0; i < nodes.length; i++) {
      onProgress(i);
      const opts = { pixelRatio: PIXEL_RATIO[quality], cacheBust: false, fontEmbedCSS, includeStyleProperties, backgroundColor: "#ffffff", skipAutoScale: true };
      out.push(format === "png" ? await toPng(nodes[i], opts) : await toJpeg(nodes[i], { ...opts, quality: quality === "draft" ? 0.72 : 0.88 }));
    }
    onProgress(nodes.length);
    return out;
  } finally {
    window.requestAnimationFrame = raf;
  }
}

export async function buildPdf(
  images: string[],
  pageNumbers: number[],
  ctx: LayoutContext,
  opts: { bleed: boolean; cropMarks: boolean; format: "jpeg" | "png"; title: string },
) {
  const { jsPDF } = await import("jspdf");
  const { width, height } = ctx.publication.trim;
  const bleed = opts.bleed ? ctx.publication.bleed : 0;
  const slugArea = opts.cropMarks ? 12 : 0;
  const pw = width + bleed * 2 + slugArea * 2;
  const ph = height + bleed * 2 + slugArea * 2;
  const doc = new jsPDF({ unit: "mm", format: [pw, ph], orientation: "portrait", compress: true });
  doc.setProperties({ title: opts.title, creator: "Elets PressFlow AI (browser demo)", subject: "Browser-rendered proof — not a print-certified PDF/X file" });
  images.forEach((img, i) => {
    if (i > 0) doc.addPage([pw, ph], "portrait");
    doc.addImage(img, opts.format === "png" ? "PNG" : "JPEG", slugArea, slugArea, width + bleed * 2, height + bleed * 2, undefined, "FAST");
    if (opts.cropMarks) {
      const x0 = slugArea + bleed;
      const y0 = slugArea + bleed;
      const x1 = x0 + width;
      const y1 = y0 + height;
      const off = bleed + 1;
      const len = 6;
      doc.setLineWidth(0.25 * MM_PER_PT * 1);
      doc.setDrawColor(0);
      for (const [x, y, sx, sy] of [
        [x0, y0, -1, -1],
        [x1, y0, 1, -1],
        [x0, y1, -1, 1],
        [x1, y1, 1, 1],
      ] as const) {
        doc.line(x + sx * off, y, x + sx * (off + len), y);
        doc.line(x, y + sy * off, x, y + sy * (off + len));
      }
      doc.setFontSize(6);
      doc.setTextColor(60);
      doc.text(`${ctx.publication.title} — ${ctx.publication.issueLabel} · Page ${pageNumbers[i]} · PressFlow browser proof (RGB raster, not for press)`, slugArea, ph - 4);
    }
  });
  return doc.output("blob");
}

export async function buildPngZip(images: string[], pageNumbers: number[], base: string) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  images.forEach((img, i) => zip.file(`${base}-page-${String(pageNumbers[i]).padStart(2, "0")}.png`, dataUrlToBytes(img)));
  return zip.generateAsync({ type: "blob" });
}

