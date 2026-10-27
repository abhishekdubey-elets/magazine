import type { BulkOpKey } from "./issue-qa";
import { resolvePage, storyPages, type LayoutContext } from "./layout-engine";
import type { ElementRole, Page, Template } from "./types";

/**
 * Bulk corrections: operations applied to many pages at once. Each operation
 * is previewed (which pages, what changes) before it is applied, returns new
 * page objects (the store keeps the previous ones for undo), and never
 * touches article text, photographs or fonts. Approved pages that change are
 * sent back to review.
 */

export type BulkOperation =
  | { type: "reset-styles"; roles?: ElementRole[] }
  | { type: "reset-geometry" }
  | { type: "fill-frames" }
  | { type: "add-continuations" }
  | { type: "regenerate" }
  | { type: "reapply-templates"; templateId?: string };

export const BULK_LABEL: Record<BulkOpKey, string> = {
  "reset-styles": "Reapply paragraph styles",
  "reset-geometry": "Reapply grid & margins",
  "fill-frames": "Fill image frames",
  "add-continuations": "Reflow overset stories onto continuation pages",
  regenerate: "Regenerate pages (clear overrides)",
  "reapply-templates": "Replace templates",
};

export const BULK_HELP: Record<BulkOpKey, string> = {
  "reset-styles": "Removes local type overrides so headlines, body, captions and quotes use the house paragraph styles again. Text is not changed.",
  "reset-geometry": "Removes frame position and size overrides so frames snap back to the template grid and margins.",
  "fill-frames": "Sets every placed image to fill its frame proportionally (intentional crops; no stretching).",
  "add-continuations": "Adds a continuation page after each story that is overset, renumbering later pages. Nothing is cut.",
  regenerate: "Clears text, image and frame overrides on the selected pages and re-applies their templates. Article copy is not changed.",
  "reapply-templates": "Switches the selected pages to the chosen template and clears frame overrides.",
};

export interface BulkChange {
  pageId: string;
  number: number;
  title: string;
  changes: string[];
  /** The page was approved and will go back to review. */
  reopens: boolean;
}

export interface BulkPreview {
  op: BulkOperation;
  scope: string[];
  affected: BulkChange[];
  untouched: number;
  summary: string;
}

const now = () => new Date().toISOString();

function reopen(p: Page, note: string): Page {
  if (p.status !== "approved") return p;
  return { ...p, status: "in-review", reviewNote: note, approvedAt: undefined, approvedBy: undefined, approvedRefs: undefined };
}

/** Compute what an operation would change on the selected pages (nothing is applied). */
export function previewBulk(ctx: LayoutContext, pageIds: string[], op: BulkOperation): BulkPreview {
  const pages = ctx.pages.filter((p) => pageIds.includes(p.id)).sort((a, b) => a.number - b.number);
  const affected: BulkChange[] = [];
  for (const p of pages) {
    const t = p.templateId ? ctx.templates[p.templateId] : undefined;
    const changes: string[] = [];
    switch (op.type) {
      case "reset-styles":
        for (const [frameId, o] of Object.entries(p.frameOverrides)) {
          if (!o.style) continue;
          const f = t?.frames.find((x) => x.id === frameId);
          if (op.roles?.length && f && !op.roles.includes(f.role)) continue;
          changes.push(`${f?.label ?? frameId}: back to ${f?.styleId ?? "house"} style`);
        }
        break;
      case "reset-geometry":
        for (const [frameId, o] of Object.entries(p.frameOverrides)) {
          if (o.x === undefined && o.y === undefined && o.w === undefined && o.h === undefined && o.columns === undefined) continue;
          changes.push(`${t?.frames.find((x) => x.id === frameId)?.label ?? frameId}: back to the template grid`);
        }
        break;
      case "fill-frames": {
        const r = resolvePage(ctx, p);
        for (const el of r.elements) if (el.kind === "image" && !el.empty && el.imageFit !== "cover") changes.push(`${el.frame.label}: fill frame proportionally`);
        break;
      }
      case "add-continuations": {
        if (!p.articleId) break;
        const story = storyPages(ctx.pages, p.articleId);
        if (story[story.length - 1]?.id !== p.id) break;
        const r = resolvePage(ctx, p);
        if (r.storyOversetWords > 0) changes.push(`Add a continuation page after page ${p.number} (≈ ${r.storyOversetWords} words overset)`);
        break;
      }
      case "regenerate":
        if (Object.keys(p.contentOverrides).length) changes.push(`${Object.keys(p.contentOverrides).length} text edit${Object.keys(p.contentOverrides).length > 1 ? "s" : ""} in Layout Studio discarded (article copy unchanged)`);
        if (Object.keys(p.imageOverrides).length) changes.push(`${Object.keys(p.imageOverrides).length} image replacement${Object.keys(p.imageOverrides).length > 1 ? "s" : ""} discarded`);
        if (Object.keys(p.frameOverrides).length) changes.push(`${Object.keys(p.frameOverrides).length} frame override${Object.keys(p.frameOverrides).length > 1 ? "s" : ""} discarded`);
        if (p.status === "planned" && p.articleId) changes.push("Layout generated");
        break;
      case "reapply-templates":
        if (op.templateId && p.templateId !== op.templateId) changes.push(`Template → ${ctx.templates[op.templateId]?.name ?? op.templateId}`);
        if (Object.keys(p.frameOverrides).length) changes.push("Frame overrides cleared");
        break;
    }
    if (changes.length) affected.push({ pageId: p.id, number: p.number, title: p.title, changes, reopens: p.status === "approved" });
  }
  const reopens = affected.filter((a) => a.reopens).length;
  return {
    op,
    scope: pages.map((p) => `p.${p.number}`),
    affected,
    untouched: pages.length - affected.length,
    summary: affected.length ? `${affected.length} of ${pages.length} selected page${pages.length === 1 ? "" : "s"} change${reopens ? `; ${reopens} approved page${reopens > 1 ? "s" : ""} will go back to review` : ""}.` : "Nothing to change on the selected pages.",
  };
}

export interface BulkResult {
  /** Pages before the operation (for undo). */
  before: Page[];
  /** Full page list after the operation. */
  pages: Page[];
  applied: number;
  log: string[];
}

/** Apply an operation to the selected pages. Pure: returns the new page list. */
export function applyBulk(ctx: LayoutContext, pageIds: string[], op: BulkOperation, templates?: Template[]): BulkResult {
  const preview = previewBulk(ctx, pageIds, op);
  const ids = new Set(preview.affected.map((a) => a.pageId));
  const before = ctx.pages.filter((p) => ids.has(p.id));
  const note = `Bulk correction: ${BULK_LABEL[op.type]} — needs approval again.`;
  let pages = ctx.pages.map((p): Page => {
    if (!ids.has(p.id)) return p;
    const t = p.templateId ? ctx.templates[p.templateId] : undefined;
    switch (op.type) {
      case "reset-styles": {
        const frameOverrides = { ...p.frameOverrides };
        for (const [frameId, o] of Object.entries(frameOverrides)) {
          const f = t?.frames.find((x) => x.id === frameId);
          if (op.roles?.length && f && !op.roles.includes(f.role)) continue;
          const rest = { ...o };
          delete rest.style;
          if (Object.keys(rest).length) frameOverrides[frameId] = rest;
          else delete frameOverrides[frameId];
        }
        return reopen({ ...p, frameOverrides, updatedAt: now() }, note);
      }
      case "reset-geometry": {
        const frameOverrides = { ...p.frameOverrides };
        for (const [frameId, o] of Object.entries(frameOverrides)) {
          const rest = { ...o };
          delete rest.x;
          delete rest.y;
          delete rest.w;
          delete rest.h;
          delete rest.columns;
          if (Object.keys(rest).length) frameOverrides[frameId] = rest;
          else delete frameOverrides[frameId];
        }
        return reopen({ ...p, frameOverrides, updatedAt: now() }, note);
      }
      case "fill-frames": {
        const frameOverrides = { ...p.frameOverrides };
        const r = resolvePage(ctx, p);
        for (const el of r.elements) if (el.kind === "image" && !el.empty && el.imageFit !== "cover") frameOverrides[el.id] = { ...frameOverrides[el.id], imageFit: "cover" };
        return reopen({ ...p, frameOverrides, updatedAt: now() }, note);
      }
      case "regenerate":
        return reopen({ ...p, contentOverrides: {}, imageOverrides: p.pageType === "advertisement" ? p.imageOverrides : {}, frameOverrides: {}, status: p.status === "planned" && p.articleId && p.templateId ? "draft" : p.status, generatedAt: now(), updatedAt: now() }, note);
      case "reapply-templates":
        return reopen({ ...p, templateId: op.templateId ?? p.templateId, frameOverrides: {}, updatedAt: now() }, note);
      default:
        return p;
    }
  });
  const log: string[] = preview.affected.map((a) => `Page ${a.number}: ${a.changes.join("; ")}`);
  if (op.type === "add-continuations") {
    // Insert a continuation page after each affected story end, renumbering later pages.
    const contTemplate = (templates ?? Object.values(ctx.templates)).find((t) => t.id.endsWith("continuation") && (!t.trim || (Math.abs(t.trim.width - ctx.publication.trim.width) < 1 && Math.abs(t.trim.height - ctx.publication.trim.height) < 1)));
    for (const a of [...preview.affected].sort((x, y) => y.number - x.number)) {
      const src = pages.find((p) => p.id === a.pageId)!;
      const page: Page = {
        id: `${src.id}-c${Date.now().toString(36)}`,
        publicationId: src.publicationId,
        number: src.number + 1,
        pageType: "article",
        title: `${src.title.replace(/ \(continued\)$/, "")} (continued)`,
        sectionId: src.sectionId,
        templateId: contTemplate?.id ?? "tpl-continuation",
        articleId: src.articleId,
        status: "draft",
        contentOverrides: {},
        imageOverrides: {},
        frameOverrides: {},
        generatedAt: now(),
        updatedAt: now(),
      };
      pages = [...pages.map((p) => (p.publicationId === src.publicationId && p.number > src.number ? { ...p, number: p.number + 1 } : p)), page];
    }
  }
  return { before, pages, applied: preview.affected.length, log };
}
