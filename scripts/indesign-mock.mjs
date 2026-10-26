#!/usr/bin/env node
/**
 * Runs src/server/indesign/script/build.jsx against a simulated InDesign
 * object model, the way Adobe's InDesign API invokes it (scriptArgs
 * "parameters", working folder, JSON return package).
 *
 * It catches script errors and checks the return contract, outputs and report
 * without Adobe credentials. It does NOT reproduce InDesign typesetting —
 * overflow is estimated — so always confirm with a real job.
 *
 *   node scripts/indesign-mock.mjs <manifest.json> [links-dir] [out-dir]
 *
 * Writes <out-dir>/result.json, <out-dir>/work/output/report.json and
 * <out-dir>/pages.html (a schematic render of every page item).
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const [manifestPath, linksDir, outDirArg] = process.argv.slice(2);
if (!manifestPath) {
  console.error("usage: node scripts/indesign-mock.mjs <manifest.json> [links-dir] [out-dir]");
  process.exit(1);
}
const outDir = path.resolve(outDirArg ?? "indesign-mock-out");
const work = path.join(outDir, "work");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(work, "links"), { recursive: true });
fs.copyFileSync(manifestPath, path.join(work, "manifest.json"));
if (linksDir && fs.existsSync(linksDir)) for (const f of fs.readdirSync(linksDir)) fs.copyFileSync(path.join(linksDir, f), path.join(work, "links", f));

const INSTALLED = new Set((process.env.MOCK_FONTS ?? "Roboto,Roboto Condensed,Bebas Neue,Source Serif 4,Inter").split(","));
const calls = { setFailures: [] };

/* ------------------------------------------------------------ helpers */

const enumProxy = (name) => new Proxy({}, { get: (_, k) => `${name}.${String(k)}` });
class Invalid {
  get isValid() {
    return false;
  }
}
class Collection {
  constructor(factory) {
    this.list = [];
    this.factory = factory;
  }
  get length() {
    return this.list.length;
  }
  item(i) {
    const v = typeof i === "number" ? this.list[i < 0 ? this.list.length + i : i] : this.list.find((x) => x.name === i);
    if (!v) throw new Error(`Object is invalid (index ${i})`);
    return v;
  }
  itemByName(n) {
    return this.list.find((x) => x.name === n) ?? new Invalid();
  }
  add(props = {}) {
    const v = this.factory(props);
    this.list.push(v);
    return v;
  }
}
const toNative = (p) => String(p).replace(/\\/g, "/");

class MockFile {
  constructor(p) {
    this.fsName = toNative(p);
    this.encoding = "UTF-8";
  }
  get exists() {
    return fs.existsSync(this.fsName);
  }
  open(mode) {
    this.mode = mode;
    if (mode === "r") {
      if (!this.exists) return false;
      this.buf = fs.readFileSync(this.fsName, "utf8");
    } else this.buf = "";
    return true;
  }
  read() {
    return this.buf;
  }
  write(t) {
    this.buf += t;
  }
  close() {
    if (this.mode === "w") fs.writeFileSync(this.fsName, this.buf);
  }
}
function File(p) {
  return new MockFile(p);
}
function Folder(p) {
  return { create: () => fs.mkdirSync(toNative(p), { recursive: true }) };
}

/* ------------------------------------------------------- object model */

let docCounter = 0;
class Swatch {
  constructor(name, colorValue) {
    this.name = name;
    this.colorValue = colorValue;
    this.isValid = true;
  }
}

class ParagraphStyle {
  constructor(doc, props) {
    this.doc = doc;
    this.isValid = true;
    this.props = { pointSize: 12, leading: 14.4, spaceAfter: 0 };
    Object.assign(this, props);
  }
  set appliedFont(v) {
    if (typeof v !== "string") throw new Error("Invalid value for appliedFont");
    this.props.family = v;
  }
  set fontStyle(v) {
    this.props.fontStyle = v;
    this.doc.useFont(this.props.family, v);
  }
  set pointSize(v) {
    if (!(v > 0)) throw new Error("Invalid pointSize");
    this.props.pointSize = v;
  }
  set leading(v) {
    this.props.leading = v;
  }
  set spaceAfter(v) {
    this.props.spaceAfter = v;
  }
  set spaceBefore(v) {
    this.props.spaceBefore = v;
  }
  set fillColor(v) {
    if (!v || !v.isValid) throw new Error("Invalid swatch");
    this.props.fillColor = v;
  }
}
// Accept any other property silently (justification, hyphenation, drop caps, rules…).
const permissive = (cls) =>
  new Proxy(cls, {
    construct(t, args) {
      const obj = new t(...args);
      return new Proxy(obj, {
        set(o, k, v) {
          o[k] = v;
          return true;
        },
      });
    },
  });
const PStyle = permissive(ParagraphStyle);

class Paragraph {
  constructor(story, text) {
    this.story = story;
    this.text = text;
    this.style = null;
    this.size = null;
    this.lead = null;
  }
  applyParagraphStyle(ps) {
    if (!ps || !ps.isValid) throw new Error("Invalid style");
    this.style = ps;
  }
  get characters() {
    const para = this;
    return {
      length: para.text.length,
      itemByRange(a, b) {
        if (a < 0 || b >= para.text.length || b < a) throw new Error(`Range ${a}-${b} outside paragraph of ${para.text.length}`);
        return new Proxy({}, { set: (o, k, v) => ((o[k] = v), true) });
      },
    };
  }
  get pointSize() {
    return this.size ?? this.style?.props.pointSize ?? 12;
  }
  set pointSize(v) {
    this.size = v;
  }
  get leading() {
    return this.lead ?? this.style?.props.leading ?? 14.4;
  }
  set leading(v) {
    this.lead = v;
  }
}

class Story {
  constructor() {
    this.frames = [];
    this.paras = [];
  }
  set contents(t) {
    if (typeof t !== "string") throw new Error("contents must be a string");
    this.paras = t.split("\r").map((x) => new Paragraph(this, x));
  }
  get contents() {
    return this.paras.map((p) => p.text).join("\r");
  }
  get paragraphs() {
    const s = this;
    return { length: s.paras.length, item: (i) => s.paras[i] };
  }
  get textStyleRanges() {
    return this.paragraphs;
  }
  get characters() {
    return { length: this.contents.length };
  }
  get textContainers() {
    return this.frames;
  }
  /** Rough fit estimate: average glyph 0.5 em wide, lines × leading against frame heights. */
  layout() {
    let capacity = this.frames.map((f) => f.capacity());
    let fi = 0;
    let used = 0;
    for (const p of this.paras) {
      const size = p.pointSize;
      const lines = Math.max(1, Math.ceil((p.text.length * size * 0.5) / Math.max(10, this.frames[fi]?.colWidth() ?? 100)));
      const need = lines * p.leading + (p.style?.props.spaceAfter ?? 0);
      while (fi < capacity.length && used + need > capacity[fi]) {
        fi++;
        used = 0;
      }
      if (fi >= capacity.length) return { overflows: true };
      used += need;
    }
    return { overflows: false };
  }
  get overflows() {
    return this.layout().overflows;
  }
}

class PageItem {
  constructor(page, props) {
    this.page = page;
    this.geometricBounds = props.geometricBounds;
    this.label = "";
    const stops = () => {
      const list = [{}, {}];
      return { get length() { return list.length; }, add: () => list.push({}), item: (i) => list[i] };
    };
    this.transparencySettings = { blendingSettings: {}, gradientFeatherSettings: { opacityGradientStops: stops() } };
    if (!Array.isArray(this.geometricBounds) || this.geometricBounds.length !== 4 || this.geometricBounds.some((v) => typeof v !== "number" || Number.isNaN(v))) throw new Error("Invalid geometricBounds");
    page.items.push(this);
  }
  get parentPage() {
    return this.page;
  }
}

class Rectangle extends PageItem {
  constructor(page, props) {
    super(page, props);
    this.kind = "rect";
    this.allGraphics = [];
  }
  place(file) {
    if (!file.exists) throw new Error(`Cannot place: ${file.fsName} does not exist`);
    this.kind = "image";
    this.link = file.fsName;
    const [t, l, b, r] = this.geometricBounds;
    const g = { geometricBounds: [t, l, b, r], move: (to) => (g.moved = to) };
    this.allGraphics = [g];
    return [g];
  }
  fit(opt) {
    if (opt === "FitOptions.FILL_PROPORTIONALLY" && this.allGraphics[0]) {
      const [t, l, b, r] = this.geometricBounds;
      this.allGraphics[0].geometricBounds = [t - 10, l - 10, b + 10, r + 10];
    }
  }
}

class TextFrame extends PageItem {
  constructor(page, props) {
    super(page, props);
    this.kind = "text";
    this.textFramePreferences = { textColumnCount: 1, textColumnGutter: 12, insetSpacing: [0, 0, 0, 0] };
    this.story = new Story();
    this.story.frames.push(this);
  }
  get parentStory() {
    return this.story;
  }
  set nextTextFrame(next) {
    if (!(next instanceof TextFrame)) throw new Error("nextTextFrame must be a text frame");
    if (next.story.paras.length) throw new Error("Cannot thread into a frame that already has text");
    next.story = this.story;
    this.story.frames.push(next);
  }
  get overflows() {
    return this.story.overflows;
  }
  get characters() {
    const s = this.story;
    return { length: s.contents.length, item: () => ({ index: Math.floor(s.contents.length * 0.8) }) };
  }
  colWidth() {
    const [, l, , r] = this.geometricBounds;
    const p = this.textFramePreferences;
    const cols = p.textColumnCount || 1;
    const inset = p.insetSpacing ?? [0, 0, 0, 0];
    return (r - l - inset[1] - inset[3] - (cols - 1) * (p.textColumnGutter || 0)) / cols;
  }
  capacity() {
    const [t, , b] = this.geometricBounds;
    const p = this.textFramePreferences;
    const inset = p.insetSpacing ?? [0, 0, 0, 0];
    return (b - t - inset[0] - inset[2]) * (p.textColumnCount || 1);
  }
}

class Page {
  constructor(doc, index) {
    this.doc = doc;
    this.documentOffset = index;
    this.items = [];
    this.marginPreferences = {};
    this.name = String(index + 1);
    this.rectangles = { add: (props) => new Rectangle(this, props) };
    this.textFrames = { add: (props) => new TextFrame(this, props) };
  }
}

class Doc {
  constructor() {
    this.name = `Untitled-${++docCounter}`;
    this.isValid = true;
    this.viewPreferences = {};
    this.marginPreferences = {};
    this.pagesList = [new Page(this, 0)];
    this.usedFonts = new Map();
    const doc = this;
    this.documentPreferences = new Proxy(
      {},
      {
        set(o, k, v) {
          o[k] = v;
          if (k === "pagesPerDocument") {
            if (!(v >= 1)) throw new Error("pagesPerDocument must be >= 1");
            doc.pagesList = Array.from({ length: v }, (_, i) => doc.pagesList[i] ?? new Page(doc, i));
          }
          if ((k === "pageWidth" || k === "pageHeight") && !(v > 0)) throw new Error(`${String(k)} must be positive`);
          return true;
        },
      },
    );
    this.masterSpreads = { item: () => ({ pages: { length: 2, item: () => ({ marginPreferences: {} }) } }) };
    this.swatches = { itemByName: (n) => (n === "None" || n === "Paper" ? new Swatch(n) : new Invalid()) };
    this.colors = new Collection((p) => {
      if (!Array.isArray(p.colorValue) || p.colorValue.length !== 3 || p.colorValue.some((v) => !(v >= 0 && v <= 255))) throw new Error(`Bad colorValue ${p.colorValue}`);
      return new Swatch(p.name, p.colorValue);
    });
    this.paragraphStyles = new Collection((p) => new PStyle(this, p));
    this.gradients = new Collection((p) => {
      const list = [{}, {}];
      return { ...p, isValid: true, gradientStops: { get length() { return list.length; }, add: () => list.push({}), item: (i) => list[i] } };
    });
    this.exports = [];
  }
  useFont(family, style) {
    this.usedFonts.set(`${family}\t${style}`, INSTALLED.has(family));
  }
  get pages() {
    const list = this.pagesList;
    return { length: list.length, item: (i) => list[i] };
  }
  get fonts() {
    const entries = [...this.usedFonts.entries()];
    return { length: entries.length, item: (i) => ({ name: entries[i][0], status: entries[i][1] ? "FontStatus.INSTALLED" : "FontStatus.NOT_AVAILABLE" }) };
  }
  exportFile(format, file, _show, preset) {
    if (format === "ExportFormat.PDF_TYPE" && (!preset || !preset.name)) throw new Error("PDF export without preset");
    fs.writeFileSync(file.fsName, `mock ${format}`);
    this.exports.push({ format, file: file.fsName });
  }
  save(file) {
    fs.writeFileSync(file.fsName, "mock indd");
    this.exports.push({ format: "INDD", file: file.fsName });
  }
  close() {
    app.documentsList = app.documentsList.filter((d) => d !== this);
  }
}

const presets = new Collection((p) => ({ ...p, isValid: true, remove() {} }));
for (const n of ["[PDF/X-4:2008]", "[PDF/X-1a:2001]", "[PDF/X-3:2002]", "[Press Quality]", "[High Quality Print]"]) presets.add({ name: n, properties: { name: n, standardsCompliance: n, colorBars: false } });
presets.list.forEach((p) => (p.properties = { name: p.name, standardsCompliance: p.name, cropMarks: false }));

const parameters = JSON.stringify({
  assets: [{ path: "manifest.json" }],
  params: {
    manifest: "manifest.json",
    options: { pdfPreset: "[PDF/X-4:2008]", jpegResolution: 72, outputs: { pdf: true, indd: true, idml: true, jpeg: true }, preflightProfile: "[Basic]" },
  },
  jobID: "mock-job",
  workingFolder: work.replace(/\//g, "\\"),
});

const app = {
  documentsList: [],
  version: "mock-21.0",
  scriptArgs: { get: (k) => (k === "parameters" ? parameters : undefined) },
  scriptPreferences: {},
  generalPreferences: {},
  jpegExportPreferences: {},
  consoleerr: (m) => console.error("  [app] " + m),
  consoleout: (m) => console.log("  [app] " + m),
  get documents() {
    const self = this;
    return {
      get length() {
        return self.documentsList.length;
      },
      item: (i) => self.documentsList[i],
      add: () => {
        const d = new Doc();
        self.documentsList.push(d);
        return d;
      },
    };
  },
  preflightProfiles: { itemByName: (n) => ({ name: n, isValid: n === "[Basic]" }), item: () => ({ name: "[Basic]", isValid: true }) },
  preflightProcesses: { add: (doc, prof) => ({ waitForProcess() {}, aggregatedResults: [doc.name, prof.name, [["Missing fonts", "page 3", "Roboto Black"]]], remove() {} }) },
  pdfExportPresets: presets,
};

const ctx = {
  app,
  File,
  Folder,
  ...Object.fromEntries(
    ["GradientType", "MeasurementUnits", "RulerOrigin", "ColorModel", "ColorSpace", "Justification", "Capitalization", "VerticalJustification", "FitOptions", "CornerOptions", "FontStatus", "ExportFormat", "ExportRangeOrAllPages", "JPEGOptionsQuality", "PageNumberingOptions", "SaveOptions", "UserInteractionLevels"].map((n) => [n, enumProxy(n)]),
  ),
};

const script = fs.readFileSync(new URL("../src/server/indesign/script/build.jsx", import.meta.url), "utf8");
const t0 = Date.now();
const raw = vm.runInNewContext(script, ctx, { filename: "build.jsx" });
const result = JSON.parse(raw);
fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(result, null, 2));
console.log(`Script finished in ${Date.now() - t0} ms → ${result.status}${result.errorString ? `: ${result.errorString}` : ""}`);
if (result.status !== "SUCCESS") process.exit(2);

const report = JSON.parse(fs.readFileSync(path.join(work, "output", "report.json"), "utf8"));
const missingUploads = result.assetsToBeUploaded.filter((a) => !fs.existsSync(path.join(work, a.path)));
console.log(`Outputs: ${result.assetsToBeUploaded.length} files (${missingUploads.length} missing on disk) · data ${result.dataURL}`);
console.log(`Report: ${report.pages} pages, ${report.stories} stories, ${report.images.length} images (${report.images.filter((i) => i.status !== "placed").length} not placed), ${report.overset.length} overset (estimated), ${report.autoFitted.length} auto-fitted, missing fonts: ${report.missingFonts.join(", ") || "none"}, warnings: ${report.warnings.length}`);
for (const w of report.warnings.slice(0, 20)) console.log("  ! " + w);
if (missingUploads.length) process.exit(3);

/* -------------------------------------------- schematic page render */

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const W = manifest.document.widthPt;
const H = manifest.document.heightPt;
const B = manifest.document.bleedPt;
const linkData = (p) => {
  const f = path.join(work, p);
  if (!fs.existsSync(f)) return null;
  const mime = p.endsWith(".svg") ? "image/svg+xml" : p.endsWith(".png") ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${fs.readFileSync(f).toString("base64")}`;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const styleOf = (n) => manifest.paragraphStyles[n] ?? {};
const storyText = new Map(manifest.stories.map((s) => [s.id, s.paragraphs]));
const svgs = manifest.pages.map((pg) => {
  const parts = [`<rect x="${-B}" y="${-B}" width="${W + 2 * B}" height="${H + 2 * B}" fill="${pg.background ?? "#fff"}"/>`];
  for (const it of pg.items) {
    const [t, l, b, r] = it.bounds;
    if (it.type === "rect" && it.gradient) {
      const gid = `g${Math.random().toString(36).slice(2)}`;
      const rad = (-it.gradient.angle * Math.PI) / 180;
      const [x1, y1, x2, y2] = [0.5 - Math.cos(rad) / 2, 0.5 - Math.sin(rad) / 2, 0.5 + Math.cos(rad) / 2, 0.5 + Math.sin(rad) / 2];
      parts.push(`<defs><linearGradient id="${gid}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${it.gradient.stops.map((s) => `<stop offset="${s.location}%" stop-color="${s.color}" stop-opacity="${s.opacity / 100}"/>`).join("")}</linearGradient></defs>`);
      parts.push(`<rect x="${l}" y="${t}" width="${r - l}" height="${b - t}" fill="url(#${gid})"/>`);
    } else if (it.type === "rect") parts.push(`<rect x="${l}" y="${t}" width="${r - l}" height="${b - t}" fill="${it.fill ?? "none"}" fill-opacity="${(it.opacity ?? 100) / 100}" ${it.stroke ? `stroke="${it.stroke.color}" stroke-width="${it.stroke.weight}"` : ""}/>`);
    if (it.type === "image") {
      const href = it.link ? linkData(it.link) : null;
      parts.push(href ? `<image href="${href}" x="${l}" y="${t}" width="${r - l}" height="${b - t}" preserveAspectRatio="xMidYMid ${it.fit === "fill" ? "slice" : "meet"}"/>` : `<rect x="${l}" y="${t}" width="${r - l}" height="${b - t}" fill="#f1f2f5" stroke="#d9a3a5"/>`);
    }
    if (it.type === "text") {
      if (it.fill) parts.push(`<rect x="${l}" y="${t}" width="${r - l}" height="${b - t}" fill="${it.fill}"/>`);
      const paras = it.paragraphs ?? (it.story ? storyText.get(it.story)?.slice(0, 3) : []) ?? [];
      const st = styleOf(paras[0]?.style);
      const size = Math.min(st.size ?? 9, (b - t) * 0.9);
      const text = paras.map((p) => p.text).join(" ¶ ").slice(0, 160);
      parts.push(`<rect x="${l}" y="${t}" width="${r - l}" height="${b - t}" fill="none" stroke="#2f6bff" stroke-opacity=".35" stroke-width=".5"/>`);
      parts.push(`<foreignObject x="${l + it.inset[1]}" y="${t + it.inset[0]}" width="${Math.max(1, r - l - it.inset[1] - it.inset[3])}" height="${Math.max(1, b - t)}"><div xmlns="http://www.w3.org/1999/xhtml" style="font:${st.fontStyle?.includes("Bold") || st.fontStyle?.includes("Black") ? 700 : 400} ${size}px/${(st.leading ?? size * 1.2) / size} '${st.family ?? "sans-serif"}',sans-serif;color:${st.color ?? "#000"};text-align:${st.align === "justify" ? "justify" : st.align ?? "left"};overflow:hidden;height:100%;column-count:${it.columns};column-gap:${it.gutter}px;text-transform:${st.caps ? "uppercase" : "none"}">${esc(text)}</div></foreignObject>`);
    }
  }
  return `<figure><svg viewBox="${-B} ${-B} ${W + 2 * B} ${H + 2 * B}" width="${(W + 2 * B) * 0.6}" height="${(H + 2 * B) * 0.6}">${parts.join("")}<rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="#e11" stroke-dasharray="4 3" stroke-width=".6"/></svg><figcaption>Page ${pg.number} — ${esc(pg.title)} (${pg.items.length} items)</figcaption></figure>`;
});
fs.writeFileSync(path.join(outDir, "pages.html"), `<!doctype html><meta charset="utf-8"><title>InDesign mock render</title><style>body{font:13px system-ui;background:#ddd;display:flex;flex-wrap:wrap;gap:16px;padding:16px}figure{margin:0;background:#fff;padding:6px}</style>${svgs.join("")}`);
console.log(`Schematic render: ${path.join(outDir, "pages.html")}`);
