/**
 * Adobe InDesign integration boundary.
 *
 * In this demo, page generation runs in the browser (`layout-engine.ts`) and
 * nothing talks to InDesign. This module defines the contract a real
 * integration would implement — InDesign Server (SOAP/ExtendScript), a UXP
 * plugin in InDesign desktop, or Adobe's cloud InDesign APIs — and builds the
 * script-ready manifest that such a service would consume.
 *
 * No connection is ever simulated as successful: `testConnection` performs a
 * real HTTP request and reports exactly what happened.
 */

import { MM_PER_PT, paragraphStyles } from "@/lib/design-tokens";
import { fontDisplayNames } from "@/lib/fonts";
import { findImage, linkName } from "@/lib/images";
import { resolvePage, storyBody, storyPages, type LayoutContext } from "@/lib/layout-engine";
import { parseBody } from "@/lib/text-engine";
import type { ImageAsset, Settings } from "@/lib/types";

export type IntegrationMode = Settings["integration"]["mode"];

export interface IntegrationStatus {
  mode: IntegrationMode;
  connected: false | true;
  label: string;
  detail: string;
  nativeDocuments: boolean;
}

/** Operations a real InDesign service must provide to replace the browser engine. */
export interface InDesignService {
  /** Build or update native pages from a manifest; returns document/job identifiers. */
  buildDocument(manifest: InDesignManifest): Promise<{ jobId: string; documentUrl?: string }>;
  /** Run an InDesign preflight profile and return its findings. */
  preflight(jobId: string, profile: string): Promise<{ errors: number; warnings: number; report: unknown }>;
  /** Export PDF/X or packaged .indd from a built document. */
  exportDocument(jobId: string, preset: "PDF/X-1a:2001" | "PDF/X-4:2008" | "IDML" | "INDD-package"): Promise<{ downloadUrl: string }>;
}

export function integrationStatus(settings: Settings): IntegrationStatus {
  if (settings.integration.mode === "browser-demo" || !settings.integration.endpoint.trim()) {
    return {
      mode: "browser-demo",
      connected: false,
      label: "Browser demo mode",
      detail: "Layouts are generated and previewed in the browser. InDesign service not connected — native document generation unavailable.",
      nativeDocuments: false,
    };
  }
  return {
    mode: settings.integration.mode,
    connected: false,
    label: "Endpoint configured — not verified",
    detail: "An endpoint is saved but no successful handshake has been recorded. Use “Test connection”.",
    nativeDocuments: false,
  };
}

/** Real network check against `${endpoint}/health`. Never fabricates success. */
export async function testConnection(endpoint: string, timeoutMs = 5000): Promise<{ ok: boolean; message: string }> {
  let url: URL;
  try {
    url = new URL("health", endpoint.endsWith("/") ? endpoint : `${endpoint}/`);
  } catch {
    return { ok: false, message: "That is not a valid URL." };
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return { ok: false, message: `Service responded with HTTP ${res.status}.` };
    return { ok: true, message: `Health endpoint responded (HTTP ${res.status}). Document generation is still not wired in this demo build.` };
  } catch (e) {
    return { ok: false, message: e instanceof DOMException && e.name === "AbortError" ? "No response within 5 seconds." : "Could not reach the service (network error or CORS)." };
  } finally {
    clearTimeout(t);
  }
}

/* ------------------------------------------------------------- manifest */

const pt = (mm: number) => Math.round((mm / MM_PER_PT) * 100) / 100;

export interface InDesignManifest {
  schema: "pressflow.indesign-manifest/1";
  document: {
    name: string;
    pageWidthPt: number;
    pageHeightPt: number;
    bleedPt: number;
    exportWithBleed: boolean;
    facingPages: boolean;
    marginsPt: { top: number; bottom: number; inside: number; outside: number };
    columns: number;
    gutterPt: number;
    startPageNumber: number;
  };
  paragraphStyles: { name: string; fontFamily: string; fontStyle: string; pointSize: number; leading: number; tracking: number; justification: string; fillColor: string; capitalization: string }[];
  pages: {
    number: number;
    side: "left" | "right";
    master: string;
    frames: {
      id: string;
      type: "TextFrame" | "Rectangle" | "Graphic";
      label: string;
      boundsPt: [number, number, number, number];
      columns?: number;
      gutterPt?: number;
      story?: string;
      threadIndex?: number;
      contents?: string;
      appliedParagraphStyle?: string;
      localOverrides?: Record<string, unknown>;
      link?: string;
      fitting?: "FILL_PROPORTIONALLY" | "PROPORTIONALLY";
      fill?: string;
    }[];
  }[];
  stories: { id: string; articleId: string; pages: number[]; frames: string[]; taggedText: string }[];
}

export function buildInDesignManifest(ctx: LayoutContext, uploads: ImageAsset[], pageNumbers: number[], opts: { bleed: boolean }): InDesignManifest {
  const s = ctx.settings.page;
  const pages = ctx.pages.filter((p) => pageNumbers.includes(p.number)).sort((a, b) => a.number - b.number);
  const stories = new Map<string, InDesignManifest["stories"][number]>();

  const out: InDesignManifest["pages"] = pages.map((page) => {
    const r = resolvePage(ctx, page);
    let threadIndex = 0;
    return {
      number: page.number,
      side: r.isLeft ? "left" : "right",
      master: r.template?.furniture === "full" ? "A-Running head + folio" : r.template?.furniture === "folio" ? "B-Folio only" : "[None]",
      frames: r.elements.map((el) => {
        const bounds: [number, number, number, number] = [pt(el.y), pt(el.x), pt(el.y + el.h), pt(el.x + el.w)];
        const style = el.frame.styleId ? paragraphStyles[el.frame.styleId] : undefined;
        if (el.kind === "image") {
          const asset = findImage(el.imageId, uploads);
          return { id: `${page.id}:${el.id}`, type: "Graphic" as const, label: el.frame.label, boundsPt: bounds, link: asset ? linkName(asset) : undefined, fitting: el.imageFit === "cover" ? ("FILL_PROPORTIONALLY" as const) : ("PROPORTIONALLY" as const) };
        }
        if (el.kind === "text" && el.frame.bind === "body" && r.article) {
          const storyId = `story-${r.article.id}`;
          const story = stories.get(storyId) ?? { id: storyId, articleId: r.article.id, pages: storyPages(ctx.pages, r.article.id).map((p) => p.number), frames: [], taggedText: taggedStory(storyBody(ctx.pages, r.article)) };
          story.frames.push(`${page.id}:${el.id}`);
          stories.set(storyId, story);
          return { id: `${page.id}:${el.id}`, type: "TextFrame" as const, label: el.frame.label, boundsPt: bounds, columns: el.columns, gutterPt: pt(el.gutter), story: storyId, threadIndex: threadIndex++, appliedParagraphStyle: style?.indesignName, localOverrides: page.frameOverrides[el.id]?.style };
        }
        if (el.kind === "text") {
          return { id: `${page.id}:${el.id}`, type: "TextFrame" as const, label: el.frame.label, boundsPt: bounds, contents: el.text, appliedParagraphStyle: style?.indesignName, localOverrides: { ...el.frame.style, ...page.frameOverrides[el.id]?.style }, fill: el.fill };
        }
        return { id: `${page.id}:${el.id}`, type: "Rectangle" as const, label: `${el.frame.label} (${el.kind})`, boundsPt: bounds, fill: el.fill ?? el.background };
      }),
    };
  });

  return {
    schema: "pressflow.indesign-manifest/1",
    document: {
      name: `${ctx.publication.masthead}-${ctx.publication.issueLabel.replace(/\s+/g, "")}`,
      pageWidthPt: pt(ctx.publication.trim.width),
      pageHeightPt: pt(ctx.publication.trim.height),
      bleedPt: pt(ctx.publication.bleed),
      exportWithBleed: opts.bleed,
      facingPages: true,
      marginsPt: { top: pt(s.marginTop), bottom: pt(s.marginBottom), inside: pt(s.marginInside), outside: pt(s.marginOutside) },
      columns: s.columns,
      gutterPt: pt(s.gutter),
      startPageNumber: 1,
    },
    paragraphStyles: Object.values(paragraphStyles).map((p) => ({
      name: p.indesignName,
      fontFamily: fontDisplayNames[p.font],
      fontStyle: `${p.weight >= 700 ? "Bold" : p.weight <= 300 ? "Light" : "Regular"}${p.italic ? " Italic" : ""}`,
      pointSize: p.size,
      leading: p.leading,
      tracking: p.tracking ?? 0,
      justification: { left: "LEFT_ALIGN", center: "CENTER_ALIGN", right: "RIGHT_ALIGN", justify: "LEFT_JUSTIFIED" }[p.align],
      fillColor: p.color,
      capitalization: p.uppercase ? "ALL_CAPS" : "NORMAL",
    })),
    pages: out,
    stories: [...stories.values()],
  };
}

/** Story text with InDesign Tagged Text–style paragraph markers. */
function taggedStory(body: string) {
  return parseBody(body)
    .map((p) => {
      const style = p.kind === "h" ? "Body/Subhead" : p.kind === "q" ? "Body/Question" : "Body/Justified";
      return `<ps:${style}>${p.words.join(" ")}`;
    })
    .join("\n");
}
