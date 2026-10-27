import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { GateCheck, GateResult, GateStatus, InDesignManifestV2, IdImage, IdItem } from "@/lib/indesign/manifest-types";
import type { ImageAsset, Page } from "@/lib/types";
import { env } from "../config";
import { db } from "../db";
import { contentHash } from "../workspace/rules";
import { tableOf } from "../workspace/sync";
import { fontLibrary, missingFaces } from "./fonts";

/**
 * Quality gates checked on the server before an InDesign print build is
 * started. A "print" build (release candidate) is refused if any gate blocks;
 * a "documents" build (working INDD/IDML) reports the same findings as warnings.
 *
 * Everything is checked against the server's own records — never against what
 * the browser claims — so what prints is exactly what editors approved.
 */

export type { GateCheck, GateResult, GateStatus };

const MM = 72 / 25.4;

/** Effective resolution of an image in a frame, from the original's pixels (InDesign places raw pixels). */
export function effectivePpi(pxW: number, pxH: number, frameWpt: number, frameHpt: number, fit: IdImage["fit"]) {
  const sx = frameWpt / pxW;
  const sy = frameHpt / pxH;
  const ptPerPx = fit === "fill" ? Math.max(sx, sy) : Math.min(sx, sy);
  return 72 / ptPerPx;
}

function* imagesOf(items: IdItem[]): Generator<IdImage> {
  for (const it of items) if (it.type === "image") yield it;
}

export async function runGates(
  manifest: InDesignManifestV2,
  opts: { kind: "print" | "documents"; pdfPreset?: string; pageVersions?: Record<string, number> },
): Promise<GateResult> {
  const d = await db();
  const severe: GateStatus = opts.kind === "print" ? "block" : "warn";
  const checks: GateCheck[] = [];

  /* 1. Pages: approved by an editor, unchanged since approval, matching the server copy. */
  const pageIds = manifest.pages.map((p) => p.pageId);
  const pt = tableOf("pages");
  const rows = pageIds.length ? await d.select().from(pt).where(and(eq(pt.orgId, env.orgId), inArray(pt.id, pageIds))) : [];
  const byId = new Map(rows.filter((r) => !r.deleted).map((r) => [r.id, r]));
  const unknown: string[] = [];
  const stale: string[] = [];
  const unapproved: string[] = [];
  const changedSince: string[] = [];
  const articleIds = new Set<string>();
  const templateIds = new Set<string>();
  for (const p of manifest.pages) {
    const row = byId.get(p.pageId);
    if (!row) {
      unknown.push(`Page ${p.number}`);
      continue;
    }
    const page = row.data as Page;
    if (opts.pageVersions && opts.pageVersions[p.pageId] !== row.version) stale.push(`Page ${p.number} — ${page.title}`);
    if (page.status !== "approved" || !page.approvedBy || !page.approvedRefs) unapproved.push(`Page ${p.number} — ${page.title} (${page.status === "approved" ? "approved before server sign-off" : page.status})`);
    else if (contentHash("pages", page as unknown as Record<string, unknown>) !== page.approvedRefs.page) changedSince.push(`Page ${p.number} — page content`);
    if (page.articleId) articleIds.add(page.articleId);
    if (page.templateId) templateIds.add(page.templateId);
  }
  const fetchMap = async (col: "articles" | "templates", ids: Set<string>) => {
    if (!ids.size) return new Map<string, Record<string, unknown>>();
    const t = tableOf(col);
    const r = await d.select().from(t).where(and(eq(t.orgId, env.orgId), inArray(t.id, [...ids])));
    return new Map(r.filter((x) => !x.deleted).map((x) => [x.id, x.data as Record<string, unknown>]));
  };
  const articles = await fetchMap("articles", articleIds);
  const templates = await fetchMap("templates", templateIds);
  const articleNotApproved: string[] = [];
  for (const p of manifest.pages) {
    const page = byId.get(p.pageId)?.data as Page | undefined;
    if (!page?.approvedRefs || page.status !== "approved") continue;
    const art = page.articleId ? articles.get(page.articleId) : null;
    const tpl = page.templateId ? templates.get(page.templateId) : null;
    if (page.articleId && contentHash("articles", art) !== page.approvedRefs.article) changedSince.push(`Page ${p.number} — article “${String(art?.title ?? page.articleId)}” changed after approval`);
    if (page.templateId && contentHash("templates", tpl) !== page.approvedRefs.template) changedSince.push(`Page ${p.number} — template “${String(tpl?.name ?? page.templateId)}” changed after approval`);
    if (art && art.status !== "approved") articleNotApproved.push(`“${String(art.title)}” (${String(art.status)})`);
  }
  const blankPages = manifest.pages.filter((p) => !p.items.length).map((p) => `Page ${p.number} — ${p.title}`);

  /* 0. Issues planned in Reference-to-Magazine Studio: the plan must have been approved and generated. */
  const pubIds = [...new Set(rows.map((r) => r.publicationId).filter((x): x is string => !!x))];
  if (pubIds.length) {
    const pubT = tableOf("publications");
    const pubs = await d.select().from(pubT).where(and(eq(pubT.orgId, env.orgId), inArray(pubT.id, pubIds)));
    for (const pub of pubs) {
      const plan = (pub.data as { plan?: { status?: string; approvedBy?: string; unresolved?: string[] } }).plan;
      if (!plan) continue;
      const ok = (plan.status === "approved" || plan.status === "generated") && !!plan.approvedBy && !(plan.unresolved?.length);
      checks.push(
        ok
          ? { id: "plan-approved", label: "Issue plan approved", status: "pass", detail: `Plan approved by ${plan.approvedBy} and generated without unresolved conflicts.` }
          : { id: "plan-approved", label: "Issue plan approved", status: severe, detail: plan.unresolved?.length ? "The issue plan still has unresolved conflicts." : "The issue plan was not approved by an editor before generation.", items: plan.unresolved ?? [] },
      );
    }
  }

  checks.push(
    unknown.length || stale.length
      ? { id: "pages-current", label: "Pages match the server", status: "block", detail: unknown.length ? "Some pages are not on the server." : "Pages changed since this build was prepared — reload and try again.", items: [...unknown, ...stale] }
      : { id: "pages-current", label: "Pages match the server", status: "pass", detail: `${manifest.pages.length} pages checked against the server copy.` },
  );
  checks.push(
    unapproved.length
      ? { id: "pages-approved", label: "Every page approved by an editor", status: severe, detail: `${unapproved.length} page(s) not approved.`, items: unapproved }
      : { id: "pages-approved", label: "Every page approved by an editor", status: "pass", detail: "All pages carry an editor's approval." },
  );
  checks.push(
    changedSince.length
      ? { id: "approval-fresh", label: "Nothing changed after approval", status: severe, detail: "Approve these pages again so the press gets what was signed off.", items: changedSince }
      : { id: "approval-fresh", label: "Nothing changed after approval", status: "pass", detail: "Pages, articles and templates are exactly as approved." },
  );
  checks.push(
    blankPages.length
      ? { id: "no-blank-pages", label: "No blank (planned) pages", status: severe, detail: "These pages have no layout yet.", items: blankPages }
      : { id: "no-blank-pages", label: "No blank (planned) pages", status: "pass", detail: "Every page has a layout." },
  );
  if (articleNotApproved.length) {
    checks.push({ id: "articles-approved", label: "Articles approved", status: "warn", detail: "The pages are approved but these articles are not marked approved.", items: articleNotApproved });
  }

  /* 2. Fonts: every family + style is in the licensed library (no substitution). */
  const library = await fontLibrary();
  const missing = missingFaces(manifest.fonts, library);
  const broken = library.filter((f) => f.error).map((f) => `${f.name}: ${f.error}`);
  checks.push(
    !library.length
      ? { id: "fonts", label: "Licensed fonts present", status: "block", detail: "No font files uploaded yet (Settings → Fonts). InDesign would substitute every font." }
      : missing.length
        ? { id: "fonts", label: "Licensed fonts present", status: severe, detail: `${missing.length} font style(s) used by the layout are not in the font library — InDesign would substitute them.`, items: missing }
        : { id: "fonts", label: "Licensed fonts present", status: "pass", detail: `${manifest.fonts.length} styles found in ${library.length} licensed font file(s).` },
  );
  if (broken.length) checks.push({ id: "font-files", label: "Font files readable", status: "warn", detail: "Some font files could not be read.", items: broken });

  /* 3. Images: originals present, enough resolution, sane colour. */
  const assetIds = new Set<string>();
  for (const l of manifest.links) if (l.source === "upload") assetIds.add(l.assetId);
  const at = tableOf("uploads");
  const assetRows = assetIds.size ? await d.select().from(at).where(and(eq(at.orgId, env.orgId), inArray(at.id, [...assetIds]))) : [];
  const assets = new Map(assetRows.filter((r) => !r.deleted).map((r) => [r.id, r.data as ImageAsset]));
  const linkAsset = new Map(manifest.links.map((l) => [l.path, l]));
  const lowBlock: string[] = [];
  const lowWarn: string[] = [];
  const empty: string[] = [];
  const noOriginal: string[] = [];
  const colour: string[] = [];
  const rotation: string[] = [];
  let placed = 0;
  for (const page of manifest.pages) {
    for (const img of imagesOf(page.items)) {
      const where = `Page ${page.number} · ${img.label}`;
      if (!img.link) {
        if (img.required) empty.push(where);
        continue;
      }
      const link = linkAsset.get(img.link);
      if (!link || link.source === "sample") {
        placed++;
        continue; // sample artwork is vector
      }
      const a = assets.get(link.assetId);
      const o = a?.original;
      if (!o) {
        noOriginal.push(`${where} — ${a?.name ?? link.assetId}`);
        continue;
      }
      placed++;
      if (a.vector || o.ext === "svg") continue;
      const [t, l, b, r] = img.bounds;
      const ppi = effectivePpi(o.width, o.height, r - l, b - t, img.fit);
      const msg = `${where} — ${a.name}: ${Math.round(ppi)} ppi (${o.width}×${o.height}px in ${Math.round((r - l) / MM)}×${Math.round((b - t) / MM)} mm)`;
      if (ppi < env.print.minPpi) lowBlock.push(msg);
      else if (ppi < env.print.targetPpi) lowWarn.push(msg);
      if (!["srgb", "rgb", "cmyk", "b-w", "grey16", "rgb16"].includes(o.colorSpace)) colour.push(`${a.name}: ${o.colorSpace} colour`);
      else if (!o.iccProfile && o.colorSpace !== "b-w") colour.push(`${a.name}: ${o.colorSpace.toUpperCase()} without an embedded profile (${o.colorSpace === "cmyk" ? "press profile assumed" : "treated as sRGB"})`);
      if ((o.orientation ?? 1) > 1) rotation.push(`${where} — ${a.name} (EXIF orientation ${o.orientation})`);
    }
  }
  checks.push(
    noOriginal.length
      ? { id: "originals", label: "Original image files", status: "block", detail: "These images have no original on the server (uploaded in demo mode?). Upload them again.", items: noOriginal }
      : { id: "originals", label: "Original image files", status: "pass", detail: `${placed} placed image(s) use untouched originals.` },
  );
  checks.push(
    empty.length
      ? { id: "empty-frames", label: "No empty image frames", status: severe, detail: "These image frames need a picture.", items: empty }
      : { id: "empty-frames", label: "No empty image frames", status: "pass", detail: "Every required image frame is filled." },
  );
  checks.push(
    lowBlock.length
      ? { id: "resolution", label: `Image resolution (min ${env.print.minPpi} ppi)`, status: severe, detail: "Too low for print at this size — use a larger original or a smaller frame.", items: [...lowBlock, ...lowWarn] }
      : lowWarn.length
        ? { id: "resolution", label: `Image resolution (target ${env.print.targetPpi} ppi)`, status: "warn", detail: "Below the 300 ppi target; check these in the proof.", items: lowWarn }
        : { id: "resolution", label: "Image resolution", status: "pass", detail: `All images at ${env.print.targetPpi} ppi or more at placed size.` },
  );
  if (colour.length) checks.push({ id: "colour", label: "Image colour", status: "warn", detail: "InDesign converts colour to the PDF output intent; check these in the proof.", items: colour });
  if (rotation.length) checks.push({ id: "rotation", label: "Image rotation", status: "warn", detail: "These photos rely on EXIF rotation. Check them in the page previews.", items: rotation });

  /* 4. Document: bleed and PDF standard. */
  const bleedMm = manifest.document.bleedPt / MM;
  checks.push(
    bleedMm <= 0
      ? { id: "bleed", label: "Bleed", status: severe, detail: "The document has no bleed; the printer needs at least 3 mm." }
      : bleedMm < 2.9
        ? { id: "bleed", label: "Bleed", status: "warn", detail: `${bleedMm.toFixed(1)} mm bleed — most printers ask for 3 mm or more.` }
        : { id: "bleed", label: "Bleed", status: "pass", detail: `${bleedMm.toFixed(1)} mm bleed on all sides.` },
  );
  if (opts.kind === "print" && opts.pdfPreset && !/PDF\/X/i.test(opts.pdfPreset)) {
    checks.push({ id: "pdf-standard", label: "PDF/X output", status: "warn", detail: `“${opts.pdfPreset}” is not a PDF/X preset. Printers expect PDF/X-4 or PDF/X-1a.` });
  }

  return { kind: opts.kind, ok: !checks.some((c) => c.status === "block"), checks, checkedAt: new Date().toISOString() };
}
