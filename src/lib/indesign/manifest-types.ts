/**
 * PressFlow → InDesign build manifest (v2).
 *
 * Produced in the browser from the resolved page model, uploaded by the
 * server and consumed by the ExtendScript build script running inside
 * Adobe's InDesign API. Everything InDesign needs is explicit: geometry in
 * points relative to each page's trim (ruler origin = page), resolved
 * colours as hex, named paragraph styles with real font family/style names,
 * and stories with their frame threading order. InDesign — not the browser —
 * does composition, hyphenation, justification and text flow.
 *
 * Plain JSON types only: imported by client code, API routes and tests.
 */

export const MANIFEST_SCHEMA = "pressflow.indesign-manifest/2";

/** [top, left, bottom, right] in points, relative to the page's top-left trim corner. */
export type Bounds = [number, number, number, number];

export interface IdParagraphStyle {
  family: string;
  fontStyle: string;
  size: number;
  leading: number;
  /** 1/1000 em. */
  tracking: number;
  align: "left" | "center" | "right" | "justify";
  /** Hex colour, e.g. "#1f2633". */
  color: string;
  caps: boolean;
  spaceBefore: number;
  spaceAfter: number;
  hyphenate: boolean;
  keepWithNext?: number;
  dropCap?: { lines: number; chars: number };
  ruleBelow?: { color: string; weight: number; offset: number };
}

/** Character-level override applied to part of a paragraph. */
export interface IdRun {
  start: number;
  length: number;
  color?: string;
  fontStyle?: string;
  family?: string;
  size?: number;
  tracking?: number;
}

export interface IdParagraph {
  /** Name of a paragraph style in `paragraphStyles`. */
  style: string;
  /** Paragraph text; "\n" marks a forced line break. */
  text: string;
  runs?: IdRun[];
}

interface ItemBase {
  /** Stable id (page id + frame id) — written to the InDesign script label for tracing. */
  id: string;
  label: string;
  bounds: Bounds;
}

export interface IdGradient {
  /** InDesign angle in degrees (0 = left→right, -90 = top→bottom). */
  angle: number;
  stops: { color: string; opacity: number; location: number }[];
}

export interface IdRect extends ItemBase {
  type: "rect";
  fill?: string;
  /** Linear gradient: colour stops become a gradient swatch; opacity stops a gradient feather. */
  gradient?: IdGradient;
  /** 0–100. */
  opacity?: number;
  stroke?: { color: string; weight: number };
  radius?: number;
}

export interface IdImage extends ItemBase {
  type: "image";
  /** Path relative to the working folder (e.g. "links/img-skyline.svg"); null = missing. */
  link: string | null;
  fit: "fill" | "fit";
  /** Crop focus, 0–100 (%). */
  focusX: number;
  focusY: number;
  required: boolean;
  fill?: string;
}

export interface IdText extends ItemBase {
  type: "text";
  columns: number;
  gutter: number;
  inset: [number, number, number, number];
  fill?: string;
  opacity?: number;
  radius?: number;
  verticalAlign?: "top" | "center" | "bottom";
  /** Threaded story this frame belongs to (frames are listed in `stories`). */
  story?: string;
  /** Content for an unthreaded frame. */
  paragraphs?: IdParagraph[];
  /** Shrink type until the text fits (display lines). */
  autoFit?: boolean;
  /** Report overset text in this frame as a problem. */
  reportOverset?: boolean;
}

export type IdItem = IdRect | IdImage | IdText;

export interface IdPage {
  number: number;
  side: "left" | "right";
  pageId: string;
  title: string;
  /** Page background colour (drawn to the bleed). */
  background?: string;
  items: IdItem[];
}

export interface IdStory {
  id: string;
  title: string;
  /** Text frame ids in threading order. */
  frames: string[];
  paragraphs: IdParagraph[];
}

export interface IdLink {
  /** Path inside the working folder, e.g. "links/img-skyline.svg". */
  path: string;
  assetId: string;
  source: "sample" | "upload";
  contentType: string;
}

export interface InDesignManifestV2 {
  schema: typeof MANIFEST_SCHEMA;
  generatedAt: string;
  publication: { id: string; title: string; issue: string };
  document: {
    name: string;
    widthPt: number;
    heightPt: number;
    bleedPt: number;
    facingPages: boolean;
    margins: { top: number; bottom: number; inside: number; outside: number };
    columns: number;
    gutterPt: number;
  };
  /** Font families and styles the document uses (for font provisioning checks). */
  fonts: { family: string; fontStyle: string }[];
  paragraphStyles: Record<string, IdParagraphStyle>;
  pages: IdPage[];
  stories: IdStory[];
  links: IdLink[];
}

/** What the build script should produce. */
export interface BuildOptions {
  pdfPreset: string;
  jpegResolution: number;
  outputs: { pdf: boolean; indd: boolean; idml: boolean; jpeg: boolean };
  preflightProfile: string;
}

/** Report written by the build script (returned in the job status). */
export interface BuildReport {
  pages: number;
  stories: number;
  overset: { id: string; label: string; page: number; characters: number }[];
  autoFitted: { id: string; label: string; page: number; scale: number }[];
  missingFonts: string[];
  images: { id: string; page: number; link: string | null; status: "placed" | "missing" | "failed"; message?: string }[];
  preflight: { profile: string; errors: number; results: string[] } | null;
  warnings: string[];
  timings: Record<string, number>;
  app?: { version?: string };
}

/** A file produced by an InDesign job (pre-signed download URL, valid ~24 h). */
export interface JobOutput {
  name: string;
  path: string;
  url: string;
  kind: "pdf" | "indd" | "idml" | "jpeg" | "report" | "other";
}

export interface JobView {
  jobId: string;
  status: "queued" | "running" | "succeeded" | "partial_success" | "failed";
  message?: string;
  outputs: JobOutput[];
  report?: BuildReport;
  errors: string[];
  /** Server mode: the build kind, the pre-build gates and the print-release state. */
  kind?: "print" | "documents";
  gates?: GateResult;
  release?: ReleaseInfo;
  /** Outputs are archived in the workspace's storage (links do not expire after 24 h). */
  archived?: boolean;
}

/* ------------------------------------------------------ print quality */

export type GateStatus = "pass" | "warn" | "block";

export interface GateCheck {
  id: string;
  label: string;
  status: GateStatus;
  detail: string;
  items?: string[];
}

/** Checks run on the server before a build; a print build is refused while any check blocks. */
export interface GateResult {
  kind: "print" | "documents";
  ok: boolean;
  checks: GateCheck[];
  checkedAt: string;
}

export interface ReleaseInfo {
  /** none: not a print candidate · pending: awaiting an editor · released · rejected */
  status: "none" | "pending" | "released" | "rejected";
  /** The InDesign report proves the files are clean (no overset, no missing fonts or images, preflight 0 errors). */
  eligible: boolean;
  reasons: string[];
  by?: string | null;
  at?: string | null;
  note?: string | null;
}
