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
  | "government-perspective"
  | "feature"
  | "news-report"
  | "case-study"
  | "event-report"
  | "company-profile"
  | "editorial";

/**
 * The six recurring editorial page formats the magazine team produces
 * (Reference-to-Magazine Studio). Each maps to a parameterised template.
 */
export type EditorialFormat = "interview" | "feature" | "government-perspective" | "event-report" | "news-page" | "company-profile";

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
  /** Design specification version the issue was generated from. */
  designSpecId?: ID;
  designSpecVersion?: number;
  /** Issue plan (Reference-to-Magazine Studio); pages are generated from it. */
  plan?: IssuePlan;
  /** Pilot run timings and comparison (Reference-to-Magazine Studio). */
  pilot?: PilotRun;
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
  | "static"
  | StoryBindKey;

/**
 * Bindings for pages that carry several stories (news pages): `story.N.field`
 * reads the N-th entry of `Page.storyIds` (1-based). Story bodies are fitted
 * into their own frame and never thread onto other pages.
 */
export type StoryBindKey = `story.${1 | 2 | 3 | 4 | 5}.${"title" | "subtitle" | "body" | "byline" | "image" | "caption" | "summary"}`;

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
  /** Editorial format this template implements (Reference-to-Magazine Studio). */
  format?: EditorialFormat;
  /** Confidence that this template reproduces the reference's layout for the format (0–1). */
  fidelity?: number;
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
  /** Further stories on a multi-story page (news pages), read by `story.N.*` bindings. */
  storyIds?: ID[];
  status: PageStatus;
  /** Editorial format this page was planned as (Reference-to-Magazine Studio). */
  format?: EditorialFormat;
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

/** Editorial role of a text block on a reference page (AI recognition; rules otherwise infer roles from size and position). */
export type RefBlockRole = "headline" | "deck" | "standfirst" | "body" | "subheading" | "caption" | "pullquote" | "byline" | "name" | "designation" | "kicker" | "question" | "running-head" | "folio" | "other";

export interface RefTextBlock extends RefRect {
  /** Role recognised by the AI pass (absent when only rules ran). */
  role?: RefBlockRole;
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
  /** Type detected by the rules before AI recognition or any manual correction. */
  detectedType: RefPageType;
  confidence: number;
  reasons: string[];
  /** AI recognition of this page (type, section, text roles), kept beside the rules' result. */
  ai?: RefPageAi;
  thumb?: string;
  blocks: RefTextBlock[];
  images: RefRect[];
  columns: number;
  runningHead?: string;
  textChars: number;
  bodyChars: number;
  imageCoverage: number;
}

export interface RefPageAi {
  type: RefPageType;
  /** 0–1. */
  confidence: number;
  /** Section name read from the page (running head, kicker), if any. */
  section?: string;
  reasons: string[];
  /** The rules detected a different type. */
  disagrees: boolean;
  /** AI's type was adopted as the page type (confident enough); otherwise the rules' type stands. */
  adopted: boolean;
}

/** AI recognition pass over a reference (page types, sections, text roles). Measurements are never AI-derived. */
export interface ReferenceAi {
  provider: "openai" | "anthropic";
  model: string;
  at: string;
  pages: number;
  /** Pages where AI and rules disagreed. */
  disagreements: number[];
  usage?: { input_tokens: number; output_tokens: number };
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
  /** How much measured data each inferred property rests on (for confidence). */
  evidence?: ReferenceEvidence;
  /** Pages whose size differs from page 1 (mixed page sizes), with their size in mm. */
  oddSizes?: { number: number; width: number; height: number }[];
  /** Reviewable design specification derived from this reference (versioned). */
  spec?: DesignSpec;
  /** AI recognition summary, when the pass ran. */
  ai?: ReferenceAi;
}

export interface ReferenceEvidence {
  /** Pages with usable body text that contributed to margins/columns. */
  gridPages: number[];
  gutterSamples: number;
  marginSamples: { top: number; bottom: number; inside: number; outside: number };
  bodyBlocks: number;
  headlineSamples: number;
  deckSamples: number;
  captionSamples: number;
  textPages: number;
  blankPages: number[];
}

/* ------------------------------------------------- Design specification */

export type FindingSource = "extracted" | "inferred" | "ai" | "default" | "confirmed";

/** One property of the reference design with how sure we are and why. */
export interface Finding<T> {
  value: T;
  /** 0–1. */
  confidence: number;
  source: FindingSource;
  /** Reference pages supporting the value. */
  evidence: number[];
  note?: string;
  /** Value before an editor changed it (kept for the record). */
  detected?: T;
}

export interface TypeSpec {
  font: string;
  role: FontRole;
  size: number;
  leading: number;
  weight: number;
  align?: "left" | "center" | "right" | "justify";
}

export interface FurnitureSpec {
  runningHead: "top-outside" | "top-inside" | "top-center" | "none";
  folio: "bottom-outside" | "bottom-center" | "bottom-inside" | "none";
  /** Running-head height from the top in mm. */
  headY: number;
  /** Folio baseline from the bottom in mm. */
  folioY: number;
}

export interface LayoutSpec {
  format: EditorialFormat;
  /** Template id in the workspace that implements this format for the reference. */
  templateId: ID;
  /** geometry: measured from a reference page · adapted: house template rescaled · inferred: no such page in the reference. */
  derivation: "geometry" | "adapted" | "inferred";
  sourcePage?: number;
  /** Other reference pages of the same kind (alternative models). */
  examples: number[];
  confidence: number;
  note?: string;
}

export const DESIGN_SPEC_SCHEMA = "pressflow.design-spec/1";

/**
 * Reusable design system learnt from a reference magazine. Every property is a
 * Finding (value + confidence + evidence). Editors review and confirm it; the
 * issue planner and InDesign build read the confirmed values.
 */
export interface DesignSpec {
  schema: typeof DESIGN_SPEC_SCHEMA;
  id: ID;
  referenceId: ID;
  version: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  identity: {
    palette: Finding<string[]>;
    accent: Finding<string>;
    logoPlacement: Finding<"top-left" | "top-center" | "top-right" | "none">;
  };
  page: {
    trim: Finding<{ width: number; height: number }>;
    orientation: "portrait" | "landscape";
    bleed: Finding<number>;
    margins: Finding<{ top: number; bottom: number; inside: number; outside: number }>;
    columns: Finding<number>;
    gutter: Finding<number>;
    furniture: Finding<FurnitureSpec>;
  };
  typography: {
    body: Finding<TypeSpec>;
    headline: Finding<TypeSpec>;
    deck: Finding<TypeSpec | null>;
    caption: Finding<TypeSpec | null>;
    quote: Finding<TypeSpec | null>;
    subheading: Finding<TypeSpec | null>;
    /** Fonts in the reference with the font substituted in the browser preview. */
    fonts: { name: string; share: number; substitute: string; available: boolean }[];
    /** Paragraph style names the InDesign build will create. */
    styleNames: string[];
  };
  images: {
    aspectRatios: Finding<{ ratio: number; share: number; label: string }[]>;
    fullBleedShare: Finding<number>;
    density: Finding<"sparse" | "balanced" | "dense">;
  };
  structure: {
    sections: Finding<{ name: string; pages: number[] }[]>;
    pageTypes: { type: RefPageType; pages: number[] }[];
    /** Running order of the reference as detected (page type per measured page). */
    order: RefPageType[];
  };
  layouts: LayoutSpec[];
  print: {
    pdfPreset: string;
    minPpi: number;
    targetPpi: number;
  };
  review: {
    status: "draft" | "confirmed";
    confirmedBy?: string;
    confirmedAt?: string;
    /** Properties an editor changed by hand. */
    edited: string[];
    warnings: string[];
  };
}

/* ------------------------------------------------------- Issue plan */

export type PlanEntryKind = "cover" | "contents" | "editorial" | "advertisement" | "closing" | "continuation" | EditorialFormat;

export interface PlanEntry {
  id: ID;
  /** 1-based page number in the plan. */
  number: number;
  kind: PlanEntryKind;
  title: string;
  articleId?: ID;
  /** Additional stories on a news page. */
  storyIds?: ID[];
  templateId?: ID;
  sectionId?: ID;
  /** Entry this page continues (continuation pages). */
  continuesId?: ID;
  /** Reserved placement (advertisement, partner page) that must survive generation. */
  reserved?: boolean;
  /** Why this entry was planned the way it was (template suggestion, capacity). */
  reason?: string;
  requiredImages: number;
  imagesAvailable: number;
  /** Estimated words that will not fit on the planned pages (0 = fits). */
  oversetWords?: number;
}

export interface IssuePlan {
  id: ID;
  designSpecId: ID;
  designSpecVersion: number;
  referenceId: ID;
  topic: string;
  title: string;
  issueLabel: string;
  pageCount: number;
  entries: PlanEntry[];
  /** Article ids the editor selected for this issue, in preferred order. */
  articleIds: ID[];
  includeAds: boolean;
  status: "draft" | "approved" | "generated";
  approvedBy?: string;
  approvedAt?: string;
  generatedAt?: string;
  notes: string[];
  /** Conflicts the planner could not resolve (generation is refused while any remain). */
  unresolved: string[];
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------- Pilot run */

export interface PilotTimings {
  analysisMs: number;
  planningMs: number;
  generationMs: number;
  buildMs: number;
  qaMs: number;
  correctionMs: number;
}

export interface PilotRun {
  id: ID;
  referenceId: ID;
  startedAt: string;
  /** Reference pages chosen as the pilot sample. */
  referencePages: number[];
  pageCount: number;
  formatsTested: EditorialFormat[];
  timings: PilotTimings;
  /** Entered by the team: minutes the same pages take by hand. */
  manualBaselineMinutes?: number;
  corrections: number;
  qaFailuresBefore: number;
  unresolvedFailures: number;
  /** What the build produced: none · browser preview · real InDesign output. */
  output: "none" | "browser-preview" | "indesign";
  approvalStatus: "pending" | "approved" | "released" | "rejected";
  /** Event log with timestamps (how the timings were measured). */
  events: { at: string; stage: keyof PilotTimings | "note"; detail: string }[];
}
