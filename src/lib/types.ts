import type { BuildReport, GateResult, JobOutput, ReleaseInfo } from "./indesign/manifest-types";

/**
 * Central data model for Elets PressFlow AI.
 *
 * Geometry is expressed in millimetres and type sizes in points so that page
 * definitions map 1:1 onto a future Adobe InDesign integration (see
 * `src/services/indesign.ts`). Template geometry/style lives in `Template`;
 * article content lives in `Article`; a `Page` only references both and stores
 * page-level overrides.
 */

export type ID = string;

/* ------------------------------------------------------------------ Content */

export type ContentType =
  | "interview"
  | "leadership-message"
  | "feature"
  | "news-report"
  | "case-study"
  | "event-report"
  | "editorial";

export type ApprovalStatus = "draft" | "in-review" | "needs-changes" | "approved";

export interface Author {
  name: string;
  designation?: string;
  organisation?: string;
  bio?: string;
}

export interface KeyFact {
  label: string;
  value: string;
}

/**
 * An editorial content item.
 *
 * `body` is plain text. Paragraphs are separated by a blank line ("\n\n").
 * Interview questions are paragraphs starting with "Q: " and answers start
 * with "A: ". Inline sub-headings are paragraphs starting with "## ".
 */
export interface Article {
  id: ID;
  title: string;
  subtitle?: string;
  body: string;
  contentType: ContentType;
  sectionId: ID;
  author: Author;
  /** Who conducted an interview, e.g. "Rose Jaiswal, Elets News Network". */
  interviewer?: string;
  summary?: string;
  pullQuotes: string[];
  /** Captions aligned by index with `imageIds`. */
  captions: string[];
  imageIds: ID[];
  facts?: KeyFact[];
  status: ApprovalStatus;
  tags: string[];
  publicationId?: ID;
  createdAt: string;
  updatedAt: string;
  /** Free-text editorial note shown in the library. */
  note?: string;
  /** Set by the server when an editor approves (server mode). */
  approvedAt?: string;
  approvedBy?: string;
}

export type ImageSubject = "portrait" | "scene" | "abstract" | "event" | "data" | "advertisement" | "cover";

export interface ImageAsset {
  id: ID;
  name: string;
  /** Sample assets are rendered from local SVG artwork; uploads are data URLs. */
  source: "sample" | "upload";
  /** Data URL for uploads. Sample images are resolved via `getSampleImageSrc`. */
  src?: string;
  /** Pixel dimensions (uploads) or nominal dimensions (vector samples). */
  width: number;
  height: number;
  vector?: boolean;
  subject: ImageSubject;
  alt: string;
  credit?: string;
  createdAt: string;
  /** Server mode: the untouched original file (what InDesign places) as measured by the server. */
  original?: OriginalImage;
}

export interface OriginalImage {
  /** Storage key (assets/originals/<id>.<ext>). */
  key: string;
  ext: string;
  bytes: number;
  format: string;
  /** Pixel size of the original (before any EXIF rotation). */
  width: number;
  height: number;
  /** srgb, cmyk, b-w, rgb16, … (libvips interpretation). */
  colorSpace: string;
  channels: number;
  bitDepth?: string;
  /** Embedded ICC profile description, if any. */
  iccProfile?: string;
  /** Resolution stored in the file (informational; effective PPI depends on placed size). */
  dpi?: number;
  /** EXIF orientation (1 = upright). InDesign may place the raw pixels unrotated. */
  orientation?: number;
  hasAlpha?: boolean;
  sha256: string;
}

/* --------------------------------------------------------------- Publication */

export interface Section {
  id: ID;
  name: string;
  /** Accent colour used for running heads, tabs and kicker labels. */
  color: string;
}

export type ProductionStage =
  | "planning"
  | "content-collection"
  | "layout"
  | "review"
  | "print-ready"
  | "published";

export interface Publication {
  id: ID;
  title: string;
  masthead: string;
  issueLabel: string;
  issueDate: string;
  stage: ProductionStage;
  description: string;
  website: string;
  tagline: string;
  sections: Section[];
  pageIds: ID[];
  trim: { width: number; height: number };
  bleed: number;
  /** Margins and column grid (mm). Defaults to Settings → Page when absent. */
  grid?: { marginTop: number; marginBottom: number; marginInside: number; marginOutside: number; columns: number; gutter: number };
  /** Reference profile this issue was modelled on (Create Like This). */
  referenceId?: ID;
  updatedAt: string;
  updatedBy: string;
  coverColor: string;
}

/* ------------------------------------------------------------- Typography */

export type FontRole = "headline" | "display" | "body" | "sans" | "serif";

export interface TextStyle {
  font: FontRole;
  /** Point size. */
  size: number;
  /** Leading in points. */
  leading: number;
  weight: number;
  italic?: boolean;
  color: string;
  align: "left" | "center" | "right" | "justify";
  /** Tracking in 1/1000 em, as in InDesign. */
  tracking?: number;
  uppercase?: boolean;
  dropCap?: boolean;
  /** Space after paragraph, in points. */
  spaceAfter?: number;
}

export interface ParagraphStyle extends TextStyle {
  id: string;
  /** Name used for the InDesign paragraph style mapping, e.g. "Body/Justified". */
  indesignName: string;
}

/* -------------------------------------------------------------- Templates */

export type PageType =
  | "cover"
  | "contents"
  | "editors-note"
  | "leadership-message"
  | "interview"
  | "article"
  | "feature"
  | "infographic"
  | "advertisement"
  | "closing";

export type FrameKind = "text" | "image" | "shape" | "toc" | "stats" | "chart" | "masthead";

export type ElementRole =
  | "headline"
  | "deck"
  | "kicker"
  | "intro"
  | "body"
  | "author"
  | "designation"
  | "byline"
  | "image"
  | "caption"
  | "pullquote"
  | "section-label"
  | "folio"
  | "facts"
  | "signature"
  | "decor"
  | "toc"
  | "stats"
  | "chart"
  | "masthead";

/**
 * Where a frame gets its content from. `static` frames use `FrameSpec.text`.
 */
export type BindKey =
  | "title"
  | "subtitle"
  | "body"
  | "summary"
  | "author.name"
  | "author.designation"
  | "author.organisation"
  | "author.role"
  | "author.bio"
  | "byline"
  | "image.0"
  | "image.1"
  | "image.2"
  | "caption.0"
  | "caption.1"
  | "caption.2"
  | "pullquote.0"
  | "pullquote.1"
  | "section"
  | "facts"
  | "static";

export interface FrameSpec {
  id: string;
  kind: FrameKind;
  role: ElementRole;
  label: string;
  /** Geometry in mm, relative to the trim box. Negative values bleed. */
  x: number;
  y: number;
  w: number;
  h: number;
  bind?: BindKey;
  text?: string;
  /** Paragraph style id from the design tokens. */
  styleId?: string;
  style?: Partial<TextStyle>;
  columns?: number;
  /** Gutter in mm (defaults to settings). */
  gutter?: number;
  fill?: string;
  /** CSS background for shapes (e.g. gradients). */
  background?: string;
  opacity?: number;
  radius?: number;
  imageFit?: "cover" | "contain";
  /** Frame is intentionally outside margins (bleeds or page furniture). */
  bleeds?: boolean;
  /** Frame can be empty without raising a QA issue. */
  optional?: boolean;
  /** Inner padding in mm (text frames on coloured fills). */
  inset?: number;
  /** Image shown when nothing is bound (cover art, ads, contents feature). */
  defaultImageId?: string;
  /** Variant for composite frames (toc: "people" | "list" | "feature"; masthead: "logo" | "partners" | "light"). */
  variant?: string;
  /** Default crop focus for images, 0-100 (%). */
  focusY?: number;
  /** Shrink the type (down to 35%) until the text fits the frame — for display lines. */
  autoFit?: boolean;
  z?: number;
}

export interface Template {
  id: ID;
  name: string;
  pageType: PageType;
  contentTypes: ContentType[];
  description: string;
  columns: number;
  imagePattern: string;
  hierarchy: string;
  status: "active" | "draft" | "archived";
  updatedAt: string;
  builtIn: boolean;
  /** Page background colour. */
  background?: string;
  /** Master-page furniture: running head + tab + folio, folio only, or none. */
  furniture: "full" | "folio" | "none";
  /** Comfortable body word range for this template. */
  wordRange: [number, number];
  frames: FrameSpec[];
  duplicatedFrom?: ID;
  /** Page size the frame geometry was designed for (mm). Absent = house 205 × 278. */
  trim?: { width: number; height: number };
  /** Reference profile this template was derived from (Create Like This). */
  referenceId?: ID;
  /** How a reference template was produced. */
  derivation?: "geometry" | "adapted";
  /** Reference page the geometry was taken from (1-based). */
  sourcePage?: number;
}

/* ------------------------------------------------------------------ Pages */

export type PageStatus = "planned" | "draft" | "in-review" | "approved";

export interface FrameOverride {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  style?: Partial<TextStyle>;
  columns?: number;
  imageFit?: "cover" | "contain";
  /** Focal point for image crops, 0-100 (%). */
  focusX?: number;
  focusY?: number;
}

export interface Page {
  id: ID;
  publicationId: ID;
  number: number;
  pageType: PageType;
  title: string;
  sectionId?: ID;
  templateId?: ID;
  articleId?: ID;
  status: PageStatus;
  /**
   * Text edits made in Layout Studio, keyed by bind key ("title", "caption.0")
   * or "frame:<frameId>" for static frames. Never written back silently.
   */
  contentOverrides: Record<string, string>;
  /** Image replacements keyed by bind key ("image.0"...). `null` = cleared. */
  imageOverrides: Record<string, ID | null>;
  frameOverrides: Record<string, FrameOverride>;
  generatedAt?: string;
  /** Set by the server when an editor approves (server mode). */
  approvedAt?: string;
  approvedBy?: string;
  /** Fingerprints of the page, article and template at approval (server-set; checked before print). */
  approvedRefs?: { page: string | null; article: string | null; template: string | null };
  /** Why the page needs approval again (e.g. edited after approval). */
  reviewNote?: string;
  updatedAt: string;
}

/** A run of paragraph text placed in one threaded frame. */
export interface BodySlice {
  kind: "p" | "q" | "a" | "h";
  text: string;
  /** Paragraph started in a previous frame. */
  continued: boolean;
  /** Paragraph continues in the next frame. */
  split: boolean;
  /** First paragraph of the story (drop cap candidate). */
  first: boolean;
  /** Render a three-line drop cap on this slice. */
  dropCap?: boolean;
}

/** A frame resolved against page + article + template, ready to render. */
export interface ResolvedElement {
  frame: FrameSpec;
  id: string;
  kind: FrameKind;
  role: ElementRole;
  x: number;
  y: number;
  w: number;
  h: number;
  style: TextStyle;
  columns: number;
  gutter: number;
  text: string;
  imageId?: ID | null;
  imageFit: "cover" | "contain";
  focusX: number;
  focusY: number;
  overridden: boolean;
  /** True if the text comes from a Layout Studio override. */
  textOverridden: boolean;
  fill?: string;
  background?: string;
  /** Threaded body text placed in this frame. */
  slices?: BodySlice[];
  /** Fill ratio of a text frame; > 1 means overset text. */
  fit?: number;
  /** Words that did not fit (last body frame of a story only). */
  oversetWords?: number;
  empty: boolean;
}

/* --------------------------------------------------------------------- QA */

export type Severity = "error" | "warning" | "info" | "passed";

export type QACheckId =
  | "overflow"
  | "missing-image"
  | "missing-headline"
  | "missing-author"
  | "missing-designation"
  | "empty-caption"
  | "incomplete-content"
  | "image-resolution"
  | "image-fill"
  | "font-consistency"
  | "margin-alignment"
  | "awaiting-approval"
  | "not-generated"
  | "imposition";

export type QAFix =
  | { type: "assign-image"; bind: BindKey }
  | { type: "add-designation"; articleId: ID }
  | { type: "add-author"; articleId: ID }
  | { type: "add-caption"; articleId: ID; index: number }
  | { type: "switch-template"; templateId: ID }
  | { type: "suggest-trim"; articleId: ID }
  | { type: "add-continuation"; afterPageId: ID }
  | { type: "reset-style"; frameId: string }
  | { type: "reset-geometry"; frameId: string }
  | { type: "approve-page" }
  | { type: "generate-layout" }
  | { type: "fill-frame"; frameId: string };

export interface QAIssue {
  id: string;
  pageId: ID;
  pageNumber: number;
  check: QACheckId;
  severity: Severity;
  title: string;
  description: string;
  suggestion?: string;
  frameId?: string;
  fixes: QAFix[];
}

export interface QARun {
  id: ID;
  at: string;
  errors: number;
  warnings: number;
  infos: number;
  passed: number;
  pagesChecked: number;
}

/* ----------------------------------------------------------------- Export */

export type ExportFormat =
  | "pdf-proof"
  | "pdf-web"
  | "png-pages"
  | "json-package"
  | "indesign-handoff"
  | "pdf-print"
  | "indd-native";

export interface ExportSettings {
  format: ExportFormat;
  range: "all" | "custom" | "current-section";
  customRange: string;
  bleed: boolean;
  cropMarks: boolean;
  quality: "draft" | "standard" | "high";
  embedFonts: boolean;
  includeQaReport: boolean;
  allowWithErrors: boolean;
}

export interface ExportJob {
  id: ID;
  publicationId: ID;
  format: ExportFormat;
  fileName: string;
  pages: number[];
  status: "completed" | "failed" | "blocked" | "running";
  sizeBytes?: number;
  createdAt: string;
  durationMs?: number;
  qa: { errors: number; warnings: number };
  message?: string;
  settings: ExportSettings;
  /** Adobe InDesign API job (print PDF / native documents). */
  indesign?: {
    jobId: string;
    stage?: string;
    outputs: JobOutput[];
    report?: BuildReport;
    /** Download links expire about 24 hours after the job finishes (demo mode; server mode archives them). */
    expiresAt?: string;
    errors?: string[];
    /** Server mode */
    kind?: "print" | "documents";
    gates?: GateResult;
    release?: ReleaseInfo;
    archived?: boolean;
  };
}

/* --------------------------------------------------------------- Activity */

export type ActivityKind = "ai" | "content" | "layout" | "qa" | "export" | "system";

export interface ActivityEvent {
  id: ID;
  kind: ActivityKind;
  message: string;
  actor: string;
  at: string;
  pageId?: ID;
  articleId?: ID;
  tone?: "default" | "success" | "warning" | "error";
}

/* --------------------------------------------------------------- Settings */

export interface Settings {
  brand: {
    organisation: string;
    primary: string;
    accent: string;
    ink: string;
    paper: string;
  };
  typography: {
    headlineFont: string;
    bodyFont: string;
    baseBodySize: number;
    baseLeading: number;
  };
  page: {
    width: number;
    height: number;
    bleed: number;
    marginTop: number;
    marginBottom: number;
    marginInside: number;
    marginOutside: number;
    gutter: number;
    columns: number;
  };
  images: {
    minEffectivePpi: number;
    defaultFit: "cover" | "contain";
    compressUploads: boolean;
  };
  exportDefaults: {
    format: ExportFormat;
    quality: ExportSettings["quality"];
    bleed: boolean;
    cropMarks: boolean;
  };
  integration: {
    mode: "browser-demo" | "adobe-indesign-api" | "indesign-server" | "uxp-plugin";
    endpoint: string;
    /** Shared key for this deployment's InDesign API routes (PRESSFLOW_API_KEY). Stored in this browser only. */
    accessKey?: string;
    pdfPreset?: string;
    jpegResolution?: number;
    preflightProfile?: string;
    /** InDesign font family per role (house fonts); falls back to the web-font families. */
    fontFamilies?: Partial<Record<FontRole, string>>;
  };
}

/* ------------------------------------------------- Reference analysis */

/** A rectangle in mm, relative to the reference page's trim box. */
export interface RefRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RefTextBlock extends RefRect {
  /** Dominant point size. */
  size: number;
  font: string;
  bold: boolean;
  lines: number;
  chars: number;
  /** First characters of the block (for review only). */
  text: string;
  /** Median baseline-to-baseline distance in pt (0 for single lines). */
  leading: number;
}

export type RefPageType =
  | "cover"
  | "contents"
  | "message"
  | "interview"
  | "feature-opener"
  | "article"
  | "infographic"
  | "advertisement"
  | "other";

export interface RefPage {
  /** 1-based page number in the reference file. */
  number: number;
  type: RefPageType;
  /** Detected type before any manual correction. */
  detectedType: RefPageType;
  confidence: number;
  reasons: string[];
  thumb?: string;
  blocks: RefTextBlock[];
  images: RefRect[];
  columns: number;
  runningHead?: string;
  textChars: number;
  bodyChars: number;
  imageCoverage: number;
}

export interface RefFontUse {
  name: string;
  share: number;
  role: FontRole;
  substitute: string;
}

export interface ReferenceProfile {
  id: ID;
  name: string;
  fileName: string;
  fileSize: number;
  createdAt: string;
  durationMs: number;
  pageCount: number;
  trim: { width: number; height: number };
  trimSource: "trimbox" | "mediabox";
  bleed: number;
  bleedSource: "bleedbox" | "default" | "none";
  margins: { top: number; bottom: number; inside: number; outside: number };
  columns: number;
  gutter: number;
  hasTextLayer: boolean;
  body: { font: string; role: FontRole; size: number; leading: number; align: "justify" | "left" };
  headline: { font: string; role: FontRole; size: number };
  deck?: { font: string; role: FontRole; size: number };
  caption?: { font: string; role: FontRole; size: number };
  typeScale: { size: number; share: number; sample: string }[];
  fonts: RefFontUse[];
  palette: string[];
  sections: { name: string; pages: number[] }[];
  pages: RefPage[];
  /** Pages larger previews were rendered for (archetype representatives). */
  previews: Record<number, string>;
  notes: string[];
}
