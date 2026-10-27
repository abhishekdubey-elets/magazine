import type { BuildReport, GateResult } from "./indesign/manifest-types";
import { effectivePpi, findImage } from "./images";
import { resolvePage, storyBody, storyPages, type LayoutContext, type ResolvedPage } from "./layout-engine";
import { runQa } from "./qa-engine";
import { countWords, parseBody } from "./text-engine";
import type { DesignSpec, ImageAsset, IssuePlan, Page, QAFix, QAIssue, ResolvedElement } from "./types";

/**
 * Issue-level quality assurance for Reference-to-Magazine Studio.
 *
 * Runs the per-page browser preflight and adds checks that only make sense for
 * the whole issue: content accounting (every planned article present, every
 * paragraph placed or reported as overset, no duplicates), reserved
 * placements, layout integrity (overlaps, blank pages, continuation chains,
 * trim), print readiness (page size, bleed, preset, resolution; InDesign's own
 * report when a build has run) and deterministic visual checks (whitespace,
 * column balance, headline hierarchy, crop consistency).
 *
 * Findings are classified blocker / warning / info. Blockers prevent release.
 * No vision model is used; `visualInspection` says so.
 */

export type IssueSeverity = "blocker" | "warning" | "info";
export type IssueCategory = "content" | "layout" | "print" | "visual" | "approval";

export interface IssueFinding {
  id: string;
  category: IssueCategory;
  severity: IssueSeverity;
  /** Short check name (stable; used to group bulk fixes). */
  check: string;
  title: string;
  detail: string;
  pageNumbers: number[];
  pageId?: string;
  frameId?: string;
  fixes: QAFix[];
  /** Bulk operation that addresses this finding across pages, if any. */
  bulk?: BulkOpKey;
}

export type BulkOpKey = "reset-styles" | "reset-geometry" | "fill-frames" | "add-continuations" | "regenerate" | "reapply-templates";

export interface IssueReport {
  generatedAt: string;
  publicationId: string;
  pages: number;
  blockers: number;
  warnings: number;
  infos: number;
  findings: IssueFinding[];
  perPage: Record<string, { number: number; blockers: number; warnings: number; infos: number }>;
  /** Blockers = 0. Release still needs the server print gates, InDesign's report and an editor's sign-off. */
  releasable: boolean;
  /** How visual checks were made. */
  visualInspection: "deterministic";
  /** What was not checked here and where it is checked instead. */
  deferred: string[];
}

export interface IssueQaOptions {
  plan?: IssuePlan;
  spec?: DesignSpec;
  pdfPreset?: string;
  minPpi?: number;
  targetPpi?: number;
  /** Server print gates (server mode). */
  gates?: GateResult;
  /** InDesign build report, when a build has run. */
  indesignReport?: BuildReport;
  /** Pages expected in the InDesign output (same selection as the build). */
  builtPages?: number[];
}

const SEV: Record<QAIssue["severity"], IssueSeverity | null> = { error: "blocker", warning: "warning", info: "info", passed: null };

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const overlapArea = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

const norm = (s: string) =>
  s
    .replace(/[“”"]/g, "")
    .replace(/[‘’']/g, "")
    .replace(/[–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export function runIssueQa(ctx: LayoutContext, uploads: ImageAsset[], opts: IssueQaOptions = {}): IssueReport {
  const pub = ctx.publication;
  const pages = [...ctx.pages].filter((p) => p.publicationId === pub.id).sort((a, b) => a.number - b.number);
  const findings: IssueFinding[] = [];
  const deferred: string[] = [];
  let n = 0;
  const add = (f: Omit<IssueFinding, "id" | "fixes"> & { fixes?: QAFix[] }) => findings.push({ id: `iq-${++n}`, fixes: [], ...f });
  const minPpi = opts.minPpi ?? ctx.settings.images.minEffectivePpi ?? 200;
  const targetPpi = opts.targetPpi ?? 300;

  /* ---- per-page browser preflight (already classified) */
  const { issues, resolved } = runQa(ctx, uploads);
  for (const i of issues) {
    const sev = SEV[i.severity];
    if (!sev) continue;
    const category: IssueCategory = i.check === "awaiting-approval" ? "approval" : i.check === "image-resolution" ? "print" : ["overflow", "image-fill", "margin-alignment", "font-consistency", "not-generated", "imposition"].includes(i.check) ? "layout" : "content";
    const bulk: BulkOpKey | undefined = i.check === "font-consistency" ? "reset-styles" : i.check === "margin-alignment" ? "reset-geometry" : i.check === "image-fill" ? "fill-frames" : i.check === "overflow" && i.fixes.some((f) => f.type === "add-continuation") ? "add-continuations" : undefined;
    add({ category, severity: i.check === "overflow" ? "blocker" : sev, check: i.check, title: i.title, detail: i.description + (i.suggestion ? ` ${i.suggestion}` : ""), pageNumbers: [i.pageNumber], pageId: i.pageId, frameId: i.frameId, fixes: i.fixes, bulk });
  }

  /* ---- content accounting */
  const byArticle = new Map<string, Page[]>();
  for (const p of pages) if (p.articleId) byArticle.set(p.articleId, [...(byArticle.get(p.articleId) ?? []), p]);
  for (const [articleId, ps] of byArticle) {
    const article = ctx.articles[articleId];
    if (!article) {
      add({ category: "content", severity: "blocker", check: "missing-article", title: `Pages ${ps.map((p) => p.number).join(", ")}: article not found`, detail: `Article ${articleId} is assigned but no longer exists in the Content Library.`, pageNumbers: ps.map((p) => p.number), pageId: ps[0].id });
      continue;
    }
    const story = storyPages(pages, articleId);
    if (!story.length) continue;
    const expected = countWords(storyBody(pages, article));
    let placed = 0;
    let overset = 0;
    for (const p of story) {
      const r = resolved[p.id] ?? resolvePage(ctx, p);
      for (const el of r.elements) if (el.frame.bind === "body") placed += countWords(el.text);
      overset = Math.max(overset, r.storyOversetWords);
    }
    const nums = story.map((p) => p.number);
    if (placed + overset < expected * 0.97 - 2) {
      add({ category: "content", severity: "blocker", check: "text-unaccounted", title: `“${article.title}”: text unaccounted for`, detail: `${expected} words in the article, ${placed} placed and ${overset} reported overset — ${expected - placed - overset} words are missing from the layout. Regenerate the pages.`, pageNumbers: nums, pageId: story[0].id, bulk: "regenerate" });
    } else if (overset === 0) {
      add({ category: "content", severity: "info", check: "text-accounted", title: `“${article.title}”: every paragraph placed`, detail: `${parseBody(storyBody(pages, article)).length} paragraphs, ${expected} words, on page${nums.length > 1 ? "s" : ""} ${nums.join(", ")}. Nothing was truncated.`, pageNumbers: nums, pageId: story[0].id });
    }
    // Pages carrying the story must be consecutive (a continuation chain).
    for (let k = 1; k < nums.length; k++) {
      if (nums[k] !== nums[k - 1] + 1) {
        add({ category: "layout", severity: "warning", check: "broken-continuation", title: `“${article.title}” jumps from page ${nums[k - 1]} to ${nums[k]}`, detail: "A story should continue on the next page; readers lose the thread across a gap.", pageNumbers: [nums[k - 1], nums[k]], pageId: story[k].id });
      }
    }
    // Pull quotes must be the article's own words.
    const body = norm(article.body);
    for (const q of article.pullQuotes) {
      const qn = norm(q);
      if (qn.length >= 12 && !body.includes(qn.slice(0, Math.min(qn.length, 60)))) {
        add({ category: "content", severity: "warning", check: "quote-not-verbatim", title: `“${article.title}”: pull quote not found in the article`, detail: `“${q.slice(0, 80)}${q.length > 80 ? "…" : ""}” does not appear word-for-word in the body. Pull quotes must not change what was said.`, pageNumbers: nums, pageId: story[0].id });
      }
    }
  }
  // Duplicate stories.
  const seenStory = new Map<string, number[]>();
  for (const p of pages) {
    for (const id of p.storyIds ?? []) seenStory.set(id, [...(seenStory.get(id) ?? []), p.number]);
    if (p.storyIds?.includes(p.articleId ?? "")) add({ category: "content", severity: "blocker", check: "duplicate-story", title: `Page ${p.number}: lead story repeated as a brief`, detail: "The same article is both the lead and a brief on this page.", pageNumbers: [p.number], pageId: p.id });
  }
  for (const [id, nums] of seenStory) {
    const also = byArticle.get(id)?.map((p) => p.number) ?? [];
    if (nums.length > 1 || also.length) add({ category: "content", severity: "blocker", check: "duplicate-story", title: `“${ctx.articles[id]?.title ?? id}” appears more than once`, detail: `Used as a news brief on page${nums.length > 1 ? "s" : ""} ${nums.join(", ")}${also.length ? ` and as a story on page${also.length > 1 ? "s" : ""} ${also.join(", ")}` : ""}.`, pageNumbers: [...nums, ...also], pageId: pages.find((p) => p.number === nums[0])?.id });
  }
  // Plan: every article and reserved placement present.
  if (opts.plan) {
    for (const e of opts.plan.entries) {
      if (e.kind === "continuation") continue;
      if (e.articleId && !pages.some((p) => p.articleId === e.articleId || p.storyIds?.includes(e.articleId!))) {
        add({ category: "content", severity: "blocker", check: "planned-article-missing", title: `Planned article missing: “${e.title}”`, detail: `The issue plan places it on page ${e.number}, but no page carries it.`, pageNumbers: [e.number] });
      }
      if (e.reserved && e.kind === "advertisement" && !pages.some((p) => p.number === e.number && p.pageType === "advertisement")) {
        add({ category: "content", severity: "blocker", check: "reserved-placement", title: `Reserved advertisement on page ${e.number} is gone`, detail: "The plan reserves this page for an advertisement, but the page is no longer an advertisement.", pageNumbers: [e.number], pageId: pages.find((p) => p.number === e.number)?.id });
      }
      for (const sid of e.storyIds ?? []) {
        if (!pages.some((p) => p.storyIds?.includes(sid))) add({ category: "content", severity: "blocker", check: "planned-article-missing", title: `Planned news brief missing: “${ctx.articles[sid]?.title ?? sid}”`, detail: `Planned on page ${e.number}.`, pageNumbers: [e.number] });
      }
    }
  }

  /* ---- layout integrity */
  const trim = pub.trim;
  const grid = { ...ctx.settings.page, ...pub.grid };
  for (const p of pages) {
    const r = resolved[p.id] ?? resolvePage(ctx, p);
    if (!r.template) continue;
    const t = r.template;
    if (t.trim && (Math.abs(t.trim.width - trim.width) > 0.5 || Math.abs(t.trim.height - trim.height) > 0.5)) {
      add({ category: "layout", severity: "blocker", check: "trim-mismatch", title: `Page ${p.number}: template is for a different page size`, detail: `“${t.name}” was designed for ${t.trim.width} × ${t.trim.height} mm; this issue is ${trim.width} × ${trim.height} mm.`, pageNumbers: [p.number], pageId: p.id, bulk: "reapply-templates" });
    }
    const content = r.elements.filter((e) => e.kind !== "shape" && !e.empty);
    if (!content.length && p.pageType !== "advertisement") {
      add({ category: "layout", severity: "blocker", check: "blank-page", title: `Page ${p.number} is blank`, detail: "No text or images are placed on this page. Assign content or remove the page.", pageNumbers: [p.number], pageId: p.id, fixes: p.articleId ? [{ type: "generate-layout" }] : [] });
    }
    // Overlaps between text frames, and between text and non-bleeding images, unless the template stacks them on purpose (z).
    const solid = r.elements.filter((e) => (e.kind === "text" || e.kind === "image") && !e.empty && !(e.frame.z && e.frame.z > 0) && !e.frame.bleeds);
    for (let i = 0; i < solid.length; i++) {
      for (let j = i + 1; j < solid.length; j++) {
        const a = solid[i];
        const b = solid[j];
        if (a.kind === "image" && b.kind === "image") continue;
        const area = overlapArea(a, b);
        const min = Math.min(a.w * a.h, b.w * b.h);
        if (min > 0 && area / min > 0.04) {
          add({ category: "layout", severity: "warning", check: "overlap", title: `Page ${p.number}: ${a.frame.label.toLowerCase()} overlaps ${b.frame.label.toLowerCase()}`, detail: `${Math.round((area / min) * 100)}% of the smaller frame is covered. Check the frames in Layout Studio.`, pageNumbers: [p.number], pageId: p.id, frameId: b.id, fixes: p.frameOverrides[b.id] ? [{ type: "reset-geometry", frameId: b.id }] : [], bulk: "reset-geometry" });
        }
      }
    }
    // Live area: text frames should sit inside the margins unless the template bleeds them.
    for (const el of r.elements) {
      if (el.kind !== "text" || el.empty || el.frame.bleeds || el.role === "folio" || el.role === "section-label") continue;
      const left = r.isLeft ? grid.marginOutside : grid.marginInside;
      const right = trim.width - (r.isLeft ? grid.marginInside : grid.marginOutside);
      if (el.x < left - 2 || el.x + el.w > right + 2 || el.y < grid.marginTop - 4 || el.y + el.h > trim.height - grid.marginBottom + 2) {
        if (p.frameOverrides[el.id]) continue; // reported by the page preflight
        add({ category: "layout", severity: "info", check: "outside-margins", title: `Page ${p.number}: ${el.frame.label.toLowerCase()} sits outside the margins`, detail: "The template places this frame beyond the live area measured from the reference.", pageNumbers: [p.number], pageId: p.id, frameId: el.id });
      }
    }
    // Readability: body copy below 8 pt or display lines shrunk a lot.
    for (const el of r.elements) {
      if (el.kind !== "text" || el.empty) continue;
      const isBody = el.frame.bind === "body" || el.frame.bind?.endsWith(".body");
      if (isBody && el.style.size < 8) add({ category: "layout", severity: "warning", check: "readability", title: `Page ${p.number}: body text at ${el.style.size} pt`, detail: "Body copy under 8 pt is hard to read in print. Use the house body size.", pageNumbers: [p.number], pageId: p.id, frameId: el.id, fixes: p.frameOverrides[el.id]?.style ? [{ type: "reset-style", frameId: el.id }] : [], bulk: "reset-styles" });
      const designed = el.frame.style?.size;
      if (el.frame.autoFit && designed && el.style.size < designed * 0.7) add({ category: "layout", severity: "warning", check: "compressed-display", title: `Page ${p.number}: ${el.frame.label.toLowerCase()} shrunk to ${Math.round((el.style.size / designed) * 100)}%`, detail: `The copy is long for the frame, so the type was reduced from ${designed} pt to ${el.style.size.toFixed(1)} pt. Shorten the copy or enlarge the frame.`, pageNumbers: [p.number], pageId: p.id, frameId: el.id });
    }
    // Multi-story briefs that overflow are hidden text.
    for (const el of r.elements) {
      if (el.frame.bind?.startsWith("story.") && (el.oversetWords ?? 0) > 0) {
        add({ category: "layout", severity: "blocker", check: "overflow", title: `Page ${p.number}: ${el.frame.label.toLowerCase()} is overset`, detail: `About ${el.oversetWords} words of this brief do not fit. Shorten the brief with the editor or give it its own page.`, pageNumbers: [p.number], pageId: p.id, frameId: el.id });
      }
    }
    // Continuation page without a predecessor story.
    if (/\(continued\)$/.test(p.title) && (!p.articleId || !pages.some((x) => x.number === p.number - 1 && x.articleId === p.articleId))) {
      add({ category: "layout", severity: "warning", check: "broken-continuation", title: `Page ${p.number} is a continuation without a start`, detail: "The previous page does not carry the same story.", pageNumbers: [p.number], pageId: p.id });
    }
  }

  /* ---- print */
  if (opts.spec) {
    const st = opts.spec.page.trim.value;
    if (Math.abs(st.width - trim.width) > 0.5 || Math.abs(st.height - trim.height) > 0.5) {
      add({ category: "print", severity: "blocker", check: "page-size", title: "Page size differs from the design specification", detail: `Issue ${trim.width} × ${trim.height} mm, specification ${st.width} × ${st.height} mm.`, pageNumbers: [] });
    }
  }
  const orientation = trim.width > trim.height ? "landscape" : "portrait";
  add({ category: "print", severity: "info", check: "page-size", title: `Page size ${trim.width} × ${trim.height} mm, ${orientation}`, detail: `All ${pages.length} pages share the publication trim; ${pub.bleed} mm bleed.`, pageNumbers: [] });
  if (pub.bleed <= 0) add({ category: "print", severity: "blocker", check: "bleed", title: "No bleed", detail: "The printer needs at least 3 mm bleed on every side.", pageNumbers: [] });
  else if (pub.bleed < 3) add({ category: "print", severity: "warning", check: "bleed", title: `${pub.bleed} mm bleed`, detail: "Most printers ask for 3 mm or more.", pageNumbers: [] });
  const preset = opts.pdfPreset ?? ctx.settings.integration.pdfPreset ?? "[PDF/X-4:2008]";
  if (!/PDF\/X/i.test(preset)) add({ category: "print", severity: "warning", check: "pdf-preset", title: `PDF preset “${preset}” is not PDF/X`, detail: "Print PDFs should use PDF/X-4 or PDF/X-1a. Change it in Settings → InDesign integration.", pageNumbers: [] });
  else add({ category: "print", severity: "info", check: "pdf-preset", title: `PDF export preset ${preset}`, detail: "PDF/X compliance is verified by InDesign's export and preflight, not assumed from the preset name.", pageNumbers: [] });
  for (const p of pages) {
    const r = resolved[p.id] ?? resolvePage(ctx, p);
    for (const el of r.elements) {
      if (el.kind !== "image" || !el.imageId) continue;
      const asset = findImage(el.imageId, uploads);
      if (!asset || asset.vector) continue;
      const ppi = asset.original ? effectivePpi({ ...asset, width: asset.original.width, height: asset.original.height }, el.w, el.h, el.imageFit) : effectivePpi(asset, el.w, el.h, el.imageFit);
      if (ppi < minPpi) {
        if (!issues.some((i) => i.pageId === p.id && i.check === "image-resolution" && i.frameId === el.id)) add({ category: "print", severity: "blocker", check: "image-resolution", title: `Page ${p.number}: “${asset.name}” at ${Math.round(ppi)} ppi`, detail: `Below the ${minPpi} ppi minimum at the placed size.`, pageNumbers: [p.number], pageId: p.id, frameId: el.id, fixes: [{ type: "assign-image", bind: el.frame.bind ?? "image.0" }] });
      } else if (ppi < targetPpi) add({ category: "print", severity: "warning", check: "image-resolution", title: `Page ${p.number}: “${asset.name}” at ${Math.round(ppi)} ppi`, detail: `Below the ${targetPpi} ppi target; acceptable for most presses but check the proof.`, pageNumbers: [p.number], pageId: p.id, frameId: el.id });
      if (!asset.original && asset.source === "upload") add({ category: "print", severity: "warning", check: "original-missing", title: `Page ${p.number}: “${asset.name}” has no server original`, detail: "The image was added in browser demo mode (downscaled copy). Upload the original in server mode before print.", pageNumbers: [p.number], pageId: p.id, frameId: el.id });
    }
  }
  if (opts.gates) {
    for (const c of opts.gates.checks) {
      if (c.status === "pass") continue;
      add({ category: "print", severity: c.status === "block" ? "blocker" : "warning", check: `gate:${c.id}`, title: `Server gate — ${c.label}`, detail: `${c.detail}${c.items?.length ? ` (${c.items.slice(0, 3).join("; ")}${c.items.length > 3 ? "…" : ""})` : ""}`, pageNumbers: [] });
    }
  } else deferred.push("Licensed-font coverage, original-image checks and approval freshness are enforced by the server print gates (Export Center → Check print readiness).");
  if (opts.indesignReport) {
    const rep = opts.indesignReport;
    const expected = opts.builtPages?.length ?? pages.length;
    if (rep.pages !== expected) add({ category: "print", severity: "blocker", check: "output-pages", title: `InDesign produced ${rep.pages} pages, ${expected} expected`, detail: "The PDF does not contain every page of the issue.", pageNumbers: [] });
    else add({ category: "print", severity: "info", check: "output-pages", title: `InDesign produced all ${rep.pages} pages`, detail: "Page count of the build matches the issue.", pageNumbers: [] });
    for (const o of rep.overset) add({ category: "layout", severity: "blocker", check: "indesign-overset", title: `InDesign: ${o.label} overset on page ${o.page}`, detail: `${o.characters} characters hidden after InDesign's own composition.`, pageNumbers: [o.page] });
    for (const f of rep.missingFonts) add({ category: "print", severity: "blocker", check: "indesign-font", title: `InDesign: missing font ${f}`, detail: "Upload the licensed font file; fonts are never substituted for print.", pageNumbers: [] });
    for (const i of rep.images.filter((x) => x.status !== "placed" && x.link)) add({ category: "print", severity: "blocker", check: "indesign-image", title: `InDesign: image not placed on page ${i.page}`, detail: i.message ?? i.link ?? "", pageNumbers: [i.page] });
    if (!rep.preflight) add({ category: "print", severity: "blocker", check: "indesign-preflight", title: "InDesign preflight did not run", detail: "The build report has no preflight result.", pageNumbers: [] });
    else if (rep.preflight.errors > 0) add({ category: "print", severity: "blocker", check: "indesign-preflight", title: `InDesign preflight: ${rep.preflight.errors} error${rep.preflight.errors > 1 ? "s" : ""} (${rep.preflight.profile})`, detail: rep.preflight.results.slice(0, 5).join("; "), pageNumbers: [] });
    else add({ category: "print", severity: "info", check: "indesign-preflight", title: `InDesign preflight clean (${rep.preflight.profile})`, detail: "No errors reported by InDesign's preflight profile.", pageNumbers: [] });
  } else deferred.push("Overset text, font embedding, colour and PDF/X conformance of the final file are checked by InDesign's build report and preflight after a print build.");

  /* ---- visual (deterministic) */
  const sizes: Record<string, Set<string>> = {};
  for (const p of pages) {
    const r = resolved[p.id] ?? resolvePage(ctx, p);
    if (!r.template || p.pageType === "advertisement" || p.pageType === "cover") continue;
    const area = trim.width * trim.height;
    const filled = r.elements.filter((e) => (e.kind === "text" || e.kind === "image" || e.kind === "toc" || e.kind === "stats" || e.kind === "chart") && !e.empty).reduce((n, e) => n + Math.min(e.w, trim.width) * Math.min(e.h, trim.height), 0);
    const share = filled / area;
    if (share < 0.3) add({ category: "visual", severity: "warning", check: "sparse-page", title: `Page ${p.number} looks sparse`, detail: `Text and images cover about ${Math.round(share * 100)}% of the page. Consider a fuller layout or more content.`, pageNumbers: [p.number], pageId: p.id });
    else if (share > 0.93) add({ category: "visual", severity: "warning", check: "crowded-page", title: `Page ${p.number} looks crowded`, detail: `Text and images cover about ${Math.round(share * 100)}% of the page; there is little white space.`, pageNumbers: [p.number], pageId: p.id });
    const bodies = r.elements.filter((e) => e.frame.bind === "body" && e.slices);
    if (bodies.length > 1) {
      const fits = bodies.map((e) => e.fit ?? 0);
      const last = fits[fits.length - 1];
      if (fits.slice(0, -1).every((f) => f > 0.9) && last < 0.35 && !r.continuesTo) add({ category: "visual", severity: "info", check: "unbalanced-columns", title: `Page ${p.number}: last body frame only ${Math.round(last * 100)}% full`, detail: "Columns end unevenly. Adjust the frame or move a pull quote.", pageNumbers: [p.number], pageId: p.id, frameId: bodies[bodies.length - 1].id });
    }
    const head = r.elements.find((e) => e.role === "headline" && !e.empty);
    const body = bodies[0];
    if (head && body && head.style.size / body.style.size < 2) add({ category: "visual", severity: "warning", check: "weak-hierarchy", title: `Page ${p.number}: weak headline hierarchy`, detail: `Headline ${head.style.size.toFixed(1)} pt against ${body.style.size} pt body (less than 2×).`, pageNumbers: [p.number], pageId: p.id, frameId: head.id });
    for (const e of r.elements) {
      if (e.kind !== "image" || e.empty) continue;
      const key = `${r.template.id}:${e.id}`;
      (sizes[key] ??= new Set()).add(e.imageFit);
    }
  }
  for (const [key, set] of Object.entries(sizes)) if (set.size > 1) add({ category: "visual", severity: "info", check: "inconsistent-crops", title: `Inconsistent image fitting in ${key.split(":")[1]}`, detail: `The same frame uses ${[...set].join(" and ")} on different pages.`, pageNumbers: [] , bulk: "fill-frames" });
  deferred.push("Awkward line breaks and widows/orphans are judged on the InDesign page previews; no vision model is configured.");

  /* ---- approval summary */
  const unapproved = pages.filter((p) => p.status !== "approved");
  if (unapproved.length) add({ category: "approval", severity: "warning", check: "approval", title: `${unapproved.length} page${unapproved.length > 1 ? "s" : ""} not yet approved`, detail: "Every page needs an editor's approval before a print build is released.", pageNumbers: unapproved.map((p) => p.number) });

  const order: Record<IssueSeverity, number> = { blocker: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || (a.pageNumbers[0] ?? 0) - (b.pageNumbers[0] ?? 0));
  const perPage: IssueReport["perPage"] = {};
  for (const p of pages) perPage[p.id] = { number: p.number, blockers: 0, warnings: 0, infos: 0 };
  for (const f of findings) {
    if (!f.pageId || !perPage[f.pageId]) continue;
    if (f.severity === "blocker") perPage[f.pageId].blockers++;
    else if (f.severity === "warning") perPage[f.pageId].warnings++;
    else perPage[f.pageId].infos++;
  }
  const blockers = findings.filter((f) => f.severity === "blocker").length;
  return {
    generatedAt: new Date().toISOString(),
    publicationId: pub.id,
    pages: pages.length,
    blockers,
    warnings: findings.filter((f) => f.severity === "warning").length,
    infos: findings.filter((f) => f.severity === "info").length,
    findings,
    perPage,
    releasable: blockers === 0,
    visualInspection: "deterministic",
    deferred,
  };
}

/** Resolved elements helper for tests and tooling. */
export function elementsOf(r: ResolvedPage): ResolvedElement[] {
  return r.elements;
}
