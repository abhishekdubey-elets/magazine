import type { ContentType, DesignSpec, EditorialFormat, FrameSpec, ReferenceProfile, RefPageType, Template, TextStyle } from "../types";
import { adaptTemplate, deriveTemplate, tpl } from "./derive";
import { FORMAT_LABEL, FORMATS, MEASURABLE_FORMATS } from "./spec";

/**
 * The six reusable editorial templates, styled from a design specification.
 * Where the reference contains a page of the right kind with measurable
 * structure, the frame geometry is taken from it; otherwise the house template
 * for the format is rescaled to the reference trim and set in its type styles
 * (labelled "adapted" or, when the reference has no such page, "inferred").
 */

export const FORMAT_HOUSE: Record<EditorialFormat, string> = {
  interview: "tpl-interview-classic",
  feature: "tpl-feature-hero",
  "government-perspective": "tpl-government-perspective",
  "event-report": "tpl-event-report",
  "news-page": "tpl-news-page",
  "company-profile": "tpl-company-profile",
};

export const FORMAT_CONTENT: Record<EditorialFormat, ContentType[]> = {
  interview: ["interview"],
  feature: ["feature", "case-study", "editorial"],
  "government-perspective": ["government-perspective", "leadership-message"],
  "event-report": ["event-report", "news-report"],
  "news-page": ["news-report"],
  "company-profile": ["company-profile", "case-study"],
};


/** Editorial format for a content type (used when the editor has not chosen one). */
export function formatFor(type: ContentType): EditorialFormat {
  switch (type) {
    case "interview":
      return "interview";
    case "leadership-message":
    case "government-perspective":
      return "government-perspective";
    case "event-report":
      return "event-report";
    case "news-report":
      return "news-page";
    case "company-profile":
      return "company-profile";
    default:
      return "feature";
  }
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Apply the spec's type styles to a template's frames (keeps frame sizes). */
function restyle(t: Template, spec: DesignSpec): Template {
  const ty = spec.typography;
  const apply = (f: FrameSpec, s: Partial<TextStyle>): FrameSpec => ({ ...f, style: { ...f.style, ...s } });
  return {
    ...t,
    frames: t.frames.map((f) => {
      if (f.kind !== "text") return f;
      switch (f.role) {
        case "headline":
          return apply(f, { font: ty.headline.value.role, weight: ty.headline.value.weight });
        case "deck":
          return ty.deck.value ? apply(f, { font: ty.deck.value.role, weight: ty.deck.value.weight }) : f;
        case "caption":
          return ty.caption.value ? apply(f, { size: r1(ty.caption.value.size), leading: r1(ty.caption.value.leading) }) : f;
        case "pullquote":
          return ty.quote.value ? apply(f, { font: ty.quote.value.role, size: r1(Math.min(ty.quote.value.size, (f.style?.size ?? 15) * 1.15)), leading: r1(Math.min(ty.quote.value.leading, (f.style?.leading ?? 18) * 1.15)) }) : f;
        case "body":
          return apply(f, { font: ty.body.value.role, size: ty.body.value.size, leading: ty.body.value.leading, align: ty.body.value.align ?? "justify" });
        default:
          return f;
      }
    }),
  };
}

export interface FormatTemplates {
  templates: Template[];
  byFormat: Record<EditorialFormat, Template>;
  /** Supporting templates: cover, contents, continuation, advertisement, closing. */
  support: Record<"cover" | "contents" | "continuation" | "advertisement" | "closing" | "infographic", Template>;
  notes: string[];
}

/** Build the format templates (and supporting page templates) for a profile + spec. */
export function buildFormatTemplates(profile: ReferenceProfile, spec: DesignSpec): FormatTemplates {
  const prefix = `tpl-${profile.id}`;
  const notes: string[] = [];
  const byFormat = {} as Record<EditorialFormat, Template>;
  const templates: Template[] = [];

  for (const format of FORMATS) {
    const layout = spec.layouts.find((l) => l.format === format);
    const id = `${prefix}-${format}`;
    let t: Template | null = null;
    if (layout?.derivation === "geometry" && layout.sourcePage && MEASURABLE_FORMATS.includes(format)) {
      const page = profile.pages.find((p) => p.number === layout.sourcePage);
      const kind = (page?.type ?? "article") as RefPageType;
      const d = page ? deriveTemplate(profile, page, kind, id) : null;
      if (d) {
        t = { ...d.template, name: `${FORMAT_LABEL[format]} — from p.${page!.number}`, description: `${FORMAT_LABEL[format]}. ${d.template.description}` };
        notes.push(`${FORMAT_LABEL[format]}: geometry measured from reference page ${page!.number} (${d.notes.join(", ")}).`);
      }
    }
    if (!t) {
      const base = tpl(FORMAT_HOUSE[format]);
      t = adaptTemplate(base, profile, id, FORMAT_LABEL[format]);
      t.derivation = "adapted";
      const inferred = layout?.derivation === "inferred" || !layout?.sourcePage;
      t.name = `${FORMAT_LABEL[format]} — ${inferred ? "inferred" : "adapted"}`;
      t.description = inferred
        ? `${base.description} The reference has no ${FORMAT_LABEL[format].toLowerCase()} page, so this layout is inferred from its design system (trim, grid, type and colour).`
        : `${base.description} Rescaled to the reference trim and set in its type styles (reference page ${layout?.sourcePage} did not yield measurable frames).`;
      notes.push(inferred ? `${FORMAT_LABEL[format]}: no example in the reference — inferred from the design system.` : `${FORMAT_LABEL[format]}: adapted house template (reference page ${layout?.sourcePage} had no clear structure).`);
    }
    t = restyle(t, spec);
    t.format = format;
    t.contentTypes = FORMAT_CONTENT[format];
    t.fidelity = layout?.confidence ?? 0.3;
    t.referenceId = profile.id;
    t.status = "active";
    byFormat[format] = t;
    templates.push(t);
  }

  const support = {} as FormatTemplates["support"];
  for (const [key, base, label] of [
    ["cover", "tpl-cover", "Cover"],
    ["contents", "tpl-contents", "Contents"],
    ["continuation", "tpl-continuation", "Continuation"],
    ["advertisement", "tpl-advertisement", "Advertisement"],
    ["closing", "tpl-closing", "Back cover"],
    ["infographic", "tpl-infographic", "Infographic"],
  ] as const) {
    const t = restyle(adaptTemplate(tpl(base), profile, `${prefix}-${key}`, label), spec);
    t.referenceId = profile.id;
    support[key] = t;
    templates.push(t);
  }
  return { templates, byFormat, support, notes };
}
