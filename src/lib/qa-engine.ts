import { paragraphStyles } from "./design-tokens";
import { effectivePpi, findImage } from "./images";
import { resolvePage, templateCapacity, storyPages, type LayoutContext, type ResolvedPage } from "./layout-engine";
import { compatibleTemplates } from "./templates";
import { countWords } from "./text-engine";
import type { ImageAsset, QAFix, QAIssue, Severity } from "./types";

/**
 * Browser preflight. Every check is derived from the live page model
 * (template geometry, article content, page overrides and text-fit
 * measurements). It approximates — and does not replace — an InDesign
 * preflight profile or a print-production PDF/X validation.
 */

export const CHECK_LABELS: Record<QAIssue["check"], string> = {
  overflow: "Text overflow",
  "missing-image": "Missing image",
  "missing-headline": "Missing headline",
  "missing-author": "Missing author",
  "missing-designation": "Missing designation",
  "empty-caption": "Empty caption",
  "incomplete-content": "Incomplete content",
  "image-resolution": "Image resolution",
  "image-fill": "Image frame fill",
  "font-consistency": "Font-size consistency",
  "margin-alignment": "Margins & alignment",
  "awaiting-approval": "Awaiting approval",
  "not-generated": "Layout not generated",
  imposition: "Imposition",
};

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2, passed: 3 };

export function checkPage(ctx: LayoutContext, r: ResolvedPage, uploads: ImageAsset[]): QAIssue[] {
  const { page, template, article } = r;
  const issues: QAIssue[] = [];
  const add = (
    check: QAIssue["check"],
    severity: Severity,
    title: string,
    description: string,
    opts: { suggestion?: string; frameId?: string; fixes?: QAFix[] } = {},
  ) =>
    issues.push({
      id: `${page.id}:${check}:${opts.frameId ?? ""}`,
      pageId: page.id,
      pageNumber: page.number,
      check,
      severity,
      title,
      description,
      suggestion: opts.suggestion,
      frameId: opts.frameId,
      fixes: opts.fixes ?? [],
    });

  if (!template || page.status === "planned") {
    add(
      "not-generated",
      article ? "warning" : "info",
      `Page ${page.number}: layout not generated`,
      article
        ? `“${article.title}” is assigned but no layout has been generated yet.`
        : "No content or template is assigned to this page.",
      { suggestion: "Open the page in Layout Studio and run Generate Layout.", fixes: article ? [{ type: "generate-layout" }] : [] },
    );
    return issues;
  }

  const passed = { content: true, fit: true, images: true, type: true, geometry: true };
  const dims = { ...ctx.settings.page, ...ctx.publication.grid, ...ctx.publication.trim };

  for (const el of r.elements) {
    const f = el.frame;
    /* ---- required content */
    if (f.kind === "text" && f.bind === "title" && el.empty) {
      passed.content = false;
      add("missing-headline", "error", `Page ${page.number}: headline is empty`, "The headline frame has no text.", {
        frameId: f.id,
        suggestion: "Add a headline in Layout Studio or use Suggest Headlines in AI Content Preparation.",
      });
    }
    if (f.kind === "image" && el.empty && !f.optional) {
      passed.images = false;
      passed.content = false;
      add("missing-image", "error", `Page ${page.number}: missing image content`, `The “${f.label}” frame has no image placed${article ? ` for “${article.title}”` : ""}.`, {
        frameId: f.id,
        suggestion: "Place the supplied photograph, or choose a sample image as a temporary FPO.",
        fixes: [{ type: "assign-image", bind: f.bind ?? "image.0" }],
      });
    }
    if (f.kind === "text" && f.bind === "author.name" && el.empty && article) {
      passed.content = false;
      add("missing-author", "warning", `Page ${page.number}: author name missing`, "The name frame is empty.", {
        frameId: f.id,
        fixes: [{ type: "add-author", articleId: article.id }],
      });
    }
    if (f.kind === "text" && (f.bind === "author.role" || f.bind === "author.designation") && article && !article.author.designation?.trim()) {
      passed.content = false;
      add("missing-designation", "warning", `Page ${page.number}: author designation missing`, `${article.author.name || "The author"} has no designation on record.`, {
        frameId: f.id,
        suggestion: "Add the designation in the article metadata.",
        fixes: [{ type: "add-designation", articleId: article.id }],
      });
    }
    if (f.kind === "text" && f.bind === "byline" && article && !article.interviewer && !article.author.designation?.trim() && article.author.name) {
      if (!issues.some((i) => i.check === "missing-designation")) {
        passed.content = false;
        add("missing-designation", "warning", `Page ${page.number}: author designation missing`, `The byline for ${article.author.name} has no designation.`, {
          frameId: f.id,
          fixes: [{ type: "add-designation", articleId: article.id }],
        });
      }
    }
    if (f.kind === "text" && f.bind?.startsWith("caption.") && el.empty && !f.optional && article) {
      const idx = Number(f.bind.split(".")[1]);
      const imageEl = r.elements.find((e) => e.kind === "image" && e.frame.bind === `image.${idx}`);
      if (imageEl && !imageEl.empty) {
        passed.content = false;
        add("empty-caption", "warning", `Page ${page.number}: empty caption`, "An image is placed but its caption is empty.", {
          frameId: f.id,
          fixes: [{ type: "add-caption", articleId: article.id, index: idx }],
        });
      }
    }
    if (f.kind === "text" && f.bind === "summary" && el.empty && !f.optional && article) {
      passed.content = false;
      add("incomplete-content", "warning", `Page ${page.number}: standfirst missing`, "The template expects an introductory summary, but the article has none.", {
        frameId: f.id,
        suggestion: "Use Generate Summary in AI Content Preparation and accept the suggestion.",
      });
    }
    if ((f.kind === "stats" || (f.kind === "text" && f.bind === "facts")) && el.empty && !f.optional) {
      passed.content = false;
      add("incomplete-content", "warning", `Page ${page.number}: key facts missing`, "This template displays key facts, but none are recorded for the article.", { frameId: f.id });
    }

    /* ---- text fit (non-body frames) */
    if (f.kind === "text" && f.bind !== "body" && (el.fit ?? 0) > 1.02) {
      passed.fit = false;
      add("overflow", "warning", `Page ${page.number}: ${f.label.toLowerCase()} is overset`, `Text needs about ${Math.round((el.fit ?? 0) * 100)}% of the frame height.`, {
        frameId: f.id,
        suggestion: "Shorten the copy or enlarge the frame — text is never cut automatically.",
        fixes: page.frameOverrides[f.id]?.style ? [{ type: "reset-style", frameId: f.id }] : [],
      });
    }

    /* ---- images */
    if (f.kind === "image" && el.imageId) {
      const asset = findImage(el.imageId, uploads);
      if (!asset) {
        passed.images = false;
        add("missing-image", "error", `Page ${page.number}: image link missing`, "The placed image could not be found in the asset library.", {
          frameId: f.id,
          fixes: [{ type: "assign-image", bind: f.bind ?? "image.0" }],
        });
      } else {
        const ppi = effectivePpi(asset, el.w, el.h, el.imageFit);
        if (ppi < ctx.settings.images.minEffectivePpi) {
          passed.images = false;
          add("image-resolution", ppi < 120 ? "error" : "warning", `Page ${page.number}: low-resolution image`, `“${asset.name}” prints at ${Math.round(ppi)} ppi effective (minimum ${ctx.settings.images.minEffectivePpi}).`, {
            frameId: f.id,
            suggestion: "Request a higher-resolution original or reduce the frame size.",
            fixes: [{ type: "assign-image", bind: f.bind ?? "image.0" }],
          });
        }
        const mismatch = Math.abs(asset.width / asset.height / (el.w / el.h) - 1);
        if (el.imageFit === "contain" && mismatch > 0.08) {
          passed.images = false;
          add("image-fill", "warning", `Page ${page.number}: image does not fill its frame`, `“${f.label}” is set to Fit proportionally and leaves visible gaps.`, {
            frameId: f.id,
            fixes: [{ type: "fill-frame", frameId: f.id }],
          });
        }
      }
    }

    /* ---- typography consistency */
    const o = page.frameOverrides[f.id];
    if (f.kind === "text" && o?.style) {
      const base = { ...(f.styleId ? paragraphStyles[f.styleId] : paragraphStyles.body), ...f.style };
      const changed = (["size", "leading", "font", "weight"] as const).filter((k) => o.style![k] !== undefined && o.style![k] !== base[k]);
      if (changed.length) {
        passed.type = false;
        const isBody = f.bind === "body";
        add("font-consistency", isBody ? "warning" : "info", `Page ${page.number}: ${f.label.toLowerCase()} deviates from house style`, `Local formatting overrides ${changed.join(", ")} of “${base && f.styleId ? paragraphStyles[f.styleId].indesignName : "Body"}” (${base.size}pt/${base.leading}pt → ${o.style.size ?? base.size}pt/${o.style.leading ?? base.leading}pt).`, {
          frameId: f.id,
          suggestion: "Reset to the paragraph style so the page matches the rest of the issue.",
          fixes: [{ type: "reset-style", frameId: f.id }],
        });
      }
    }

    /* ---- geometry */
    if (o && (o.x !== undefined || o.y !== undefined || o.w !== undefined || o.h !== undefined) && !f.bleeds) {
      const outside =
        el.x < dims.marginOutside - 0.5 ||
        el.x + el.w > dims.width - dims.marginOutside + 0.5 ||
        el.y < dims.marginTop - 2 ||
        el.y + el.h > dims.height - dims.marginBottom + 0.5;
      const edges = new Set(template.frames.flatMap((t) => [t.x, t.x + t.w].map((v) => Math.round(v * 2) / 2)));
      const offGrid = ![el.x, el.x + el.w].some((v) => edges.has(Math.round(v * 2) / 2));
      if (outside || offGrid) {
        passed.geometry = false;
        add("margin-alignment", outside ? "warning" : "info", `Page ${page.number}: ${f.label.toLowerCase()} ${outside ? "crosses the margins" : "is off the column grid"}`, outside ? "The frame extends outside the live area defined in Settings." : "Neither edge aligns with the template's column grid.", {
          frameId: f.id,
          fixes: [{ type: "reset-geometry", frameId: f.id }],
        });
      }
    }
  }

  /* ---- story overflow */
  if (r.storyOversetWords > 0 && article) {
    passed.fit = false;
    const story = storyPages(ctx.pages, article.id);
    const fixes: QAFix[] = [];
    if (story.length === 1) {
      const total = countWords(page.contentOverrides.body ?? article.body);
      const options = compatibleTemplates(Object.values(ctx.templates), article.contentType, ctx.publication.trim)
        .filter((t) => t.id !== template.id)
        .map((t) => ({ t, cap: templateCapacity(t, { ...article, body: page.contentOverrides.body ?? article.body }, ctx.settings) }))
        .filter((o) => o.cap >= total)
        .sort((a, b) => a.cap - b.cap);
      if (options[0]) fixes.push({ type: "switch-template", templateId: options[0].t.id });
    }
    fixes.push({ type: "add-continuation", afterPageId: page.id });
    fixes.push({ type: "suggest-trim", articleId: article.id });
    const bodyFrame = [...r.elements].reverse().find((e) => e.frame.bind === "body");
    add(
      "overflow",
      r.storyOversetWords > 120 ? "error" : "warning",
      `Page ${page.number}: more text than the template can accommodate`,
      `About ${r.storyOversetWords} words of “${article.title}” are overset (not visible). Nothing has been removed from the story.`,
      {
        frameId: bodyFrame?.id,
        suggestion: "Switch to a roomier template, add a continuation page, or review a suggested trim with the editor.",
        fixes,
      },
    );
  }

  /* ---- editorial status */
  if (article && article.status !== "approved") {
    add("incomplete-content", "info", `Page ${page.number}: copy not yet approved`, `“${article.title}” is ${article.status.replace("-", " ")} in the Content Library.`, {
      suggestion: "Confirm final copy with the section editor before sign-off.",
    });
  }
  if (page.status !== "approved") {
    add("awaiting-approval", "info", `Page ${page.number}: awaiting human approval`, `Status is “${page.status.replace("-", " ")}”. Pages must be signed off by an editor before print.`, {
      fixes: [{ type: "approve-page" }],
    });
  }

  /* ---- passed checks */
  const pass = (check: QAIssue["check"], title: string, description: string) =>
    add(check, "passed", `Page ${page.number}: ${title}`, description);
  if (passed.content) pass("incomplete-content", "all required content fields present", "Headline, author, images and captions are complete.");
  if (passed.fit) pass("overflow", "no overset text", "All text fits its frames.");
  if (passed.images && r.elements.some((e) => e.kind === "image" && !e.empty)) pass("image-resolution", "images fill frames at print resolution", "Placed images meet the minimum effective resolution.");
  if (passed.type) pass("font-consistency", "typography matches house styles", "No local formatting overrides.");
  if (passed.geometry) pass("margin-alignment", "frames within margins", "All frames sit on the template grid.");
  return issues;
}

export function runQa(ctx: LayoutContext, uploads: ImageAsset[]): { issues: QAIssue[]; resolved: Record<string, ResolvedPage> } {
  const resolved: Record<string, ResolvedPage> = {};
  const issues: QAIssue[] = [];
  const pages = ctx.pages.filter((p) => p.publicationId === ctx.publication.id).sort((a, b) => a.number - b.number);
  for (const p of pages) {
    const r = resolvePage(ctx, p);
    resolved[p.id] = r;
    issues.push(...checkPage(ctx, r, uploads));
  }
  const last = pages[pages.length - 1];
  if (last && pages.length % 4 !== 0) {
    issues.push({
      id: `${ctx.publication.id}:imposition`,
      pageId: last.id,
      pageNumber: last.number,
      check: "imposition",
      severity: "info",
      title: `Issue has ${pages.length} pages — not a multiple of 4`,
      description: `Saddle-stitched printing needs page counts in multiples of 4. Add ${4 - (pages.length % 4)} page(s) or remove ${pages.length % 4} before imposition.`,
      fixes: [],
    });
  }
  issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.pageNumber - b.pageNumber);
  return { issues, resolved };
}

export function summarize(issues: QAIssue[]) {
  const count = (s: Severity) => issues.filter((i) => i.severity === s).length;
  return { errors: count("error"), warnings: count("warning"), infos: count("info"), passed: count("passed") };
}
