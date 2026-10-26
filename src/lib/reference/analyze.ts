"use client";

import { MM_PER_PT } from "../design-tokens";
import { fontDisplayNames } from "../fonts";
import type { FontRole, ReferenceProfile, RefPage, RefPageType, RefRect, RefTextBlock } from "../types";

/**
 * Reference magazine analysis ("Create Like This").
 *
 * Runs entirely in the browser with pdf.js. Everything reported is measured
 * from the PDF's own structure — page boxes, positioned text runs with their
 * fonts and sizes, image placements from the content stream, and colours from
 * rendered pages. Page classification and style inference are heuristics on
 * top of those measurements; the UI labels them as such.
 */

export interface AnalyzeProgress {
  stage: string;
  value: number; // 0–100
}

export interface AnalyzeOptions {
  maxPages: number;
  onProgress: (p: AnalyzeProgress) => void;
  signal?: AbortSignal;
}

type Matrix = [number, number, number, number, number, number];
type PdfJs = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfJs() {
  pdfjsPromise ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return m;
  });
  return pdfjsPromise;
}

const MAX_FILE = 300 * 1024 * 1024;
const mm = (pt: number) => pt * MM_PER_PT;
const round = (v: number, step = 0.5) => Math.round(v / step) * step;
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const percentile = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))];
};
function mode<T>(xs: T[], weight: (x: T) => number = () => 1, key: (x: T) => string = String): T | undefined {
  const m = new Map<string, { v: T; w: number }>();
  for (const x of xs) {
    const k = key(x);
    const e = m.get(k);
    if (e) e.w += weight(x);
    else m.set(k, { v: x, w: weight(x) });
  }
  let best: { v: T; w: number } | undefined;
  for (const e of m.values()) if (!best || e.w > best.w) best = e;
  return best?.v;
}

export class AnalysisError extends Error {}

/* ------------------------------------------------------------ page boxes */

interface Boxes {
  trim?: number[];
  bleed?: number[];
}

/**
 * Find TrimBox / BleedBox. pdf.js does not expose them, so scan the file:
 * first the raw bytes, then (for PDF 1.5+ files that keep page dictionaries
 * in compressed object streams) the inflated /ObjStm streams.
 */
async function findBoxes(bytes: Uint8Array, signal?: AbortSignal): Promise<Boxes> {
  const found: Record<"TrimBox" | "BleedBox", string[]> = { TrimBox: [], BleedBox: [] };
  const re = /\/(TrimBox|BleedBox)\s*\[\s*([-\d.\s]+?)\s*\]/g;
  const scan = (txt: string) => {
    for (const m of txt.matchAll(re)) {
      const nums = m[2].trim().split(/\s+/).map(Number);
      if (nums.length === 4 && nums.every(Number.isFinite)) found[m[1] as "TrimBox" | "BleedBox"].push(nums.map((n) => n.toFixed(1)).join(" "));
    }
  };
  const dec = new TextDecoder("latin1");
  const CHUNK = 8 << 20;
  const objStms: number[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const txt = dec.decode(bytes.subarray(i, Math.min(bytes.length, i + CHUNK + 256)));
    scan(txt);
    for (const m of txt.matchAll(/\/Type\s*\/ObjStm/g)) if (m.index! < CHUNK) objStms.push(i + m.index!);
  }

  if (!found.TrimBox.length && typeof DecompressionStream !== "undefined") {
    let inflated = 0;
    for (const pos of objStms.slice(0, 400)) {
      if (signal?.aborted || inflated > 40 << 20) break;
      // The filter can appear before or after /Type in the stream dictionary.
      const back = Math.min(pos, 512);
      const head = dec.decode(bytes.subarray(pos - back, Math.min(bytes.length, pos + 2048)));
      const dictStart = head.lastIndexOf("<<", back);
      const s = head.indexOf("stream", back);
      if (s < 0 || dictStart < 0 || !/FlateDecode/.test(head.slice(dictStart, s))) continue;
      const start = pos - back + s + (head[s + 6] === "\r" ? 8 : 7);
      // Prefer the declared length: zlib decoders reject trailing EOL bytes before "endstream".
      const len = Number(head.slice(dictStart, s).match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/)?.[1]);
      let e = Number.isFinite(len) && len > 0 ? len : -1;
      if (e < 0) {
        const tail = dec.decode(bytes.subarray(start, Math.min(bytes.length, start + (4 << 20))));
        e = tail.indexOf("endstream");
        if (e < 0) continue;
        while (e > 0 && (tail[e - 1] === "\n" || tail[e - 1] === "\r")) e--;
      }
      try {
        const ds = new Blob([bytes.slice(start, start + e)]).stream().pipeThrough(new DecompressionStream("deflate"));
        const buf = new Uint8Array(await new Response(ds).arrayBuffer());
        inflated += buf.length;
        scan(dec.decode(buf));
      } catch {
        // Not a plain zlib stream (or trailing EOL bytes) — skip it.
      }
      if (found.TrimBox.length >= 8) break;
    }
  }
  const pick = (xs: string[]) => mode(xs)?.split(" ").map(Number);
  return { trim: pick(found.TrimBox), bleed: pick(found.BleedBox) };
}

/* ------------------------------------------------------------- fonts */

export function fontRole(name: string): FontRole {
  const n = name.toLowerCase();
  if (/bebas|anton|oswald|league ?gothic|impact|knockout/.test(n)) return "display";
  if (/(serif|times|georgia|garamond|minion|caslon|baskerville|palatino|cambria|bodoni|didot|merriweather|playfair)/.test(n) && !/sans/.test(n)) return "serif";
  if (/condensed|compressed|narrow|headline|black|heavy|futura|din|swiss721|helvetica ?neue ?cond/.test(n)) return "headline";
  return "body";
}

const cleanFont = (n: string) => n.replace(/^[A-Z]{6}\+/, "").replace(/[-_,](Regular|Roman|Book)$/i, "");
const isBold = (n: string) => /bold|black|heavy|demi|semibold|extrabold/i.test(n);

/* ------------------------------------------------------------- per page */

interface Line {
  x: number;
  right: number;
  baseline: number;
  size: number;
  font: string;
  bold: boolean;
  text: string;
  chars: number;
}

interface RawItem {
  x: number;
  w: number;
  baseline: number;
  size: number;
  font: string;
  str: string;
}

function itemsToLines(items: RawItem[]): Line[] {
  items.sort((a, b) => a.baseline - b.baseline || a.x - b.x);
  const rows: RawItem[][] = [];
  for (const it of items) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].baseline - it.baseline) < Math.max(1, it.size * 0.35)) row.push(it);
    else rows.push([it]);
  }
  const lines: Line[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let cur: RawItem[] = [];
    const flush = () => {
      if (!cur.length) return;
      const text = cur.map((c) => c.str).join("").replace(/\s+/g, " ").trim();
      if (text) {
        const size = mode(cur, (c) => c.str.length, (c) => String(round(c.size, 0.25)))!.size;
        const font = mode(cur, (c) => c.str.length, (c) => c.font)!.font;
        lines.push({ x: cur[0].x, right: Math.max(...cur.map((c) => c.x + c.w)), baseline: median(cur.map((c) => c.baseline)), size, font, bold: isBold(font), text, chars: text.length });
      }
      cur = [];
    };
    for (const it of row) {
      const prev = cur[cur.length - 1];
      const gap = prev ? it.x - (prev.x + prev.w) : 0;
      const sizeJump = prev ? Math.abs(prev.size - it.size) / Math.max(prev.size, it.size) > 0.3 : false;
      if (prev && (gap > Math.min(1.4 * Math.max(prev.size, it.size), 13) || sizeJump)) flush();
      cur.push(it);
    }
    flush();
  }
  return lines;
}

interface WorkBlock {
  lines: Line[];
  x: number;
  right: number;
  size: number;
}

function linesToBlocks(lines: Line[]): RefTextBlock[] {
  const open: WorkBlock[] = [];
  const done: WorkBlock[] = [];
  for (const l of [...lines].sort((a, b) => a.baseline - b.baseline || a.x - b.x)) {
    let target: WorkBlock | undefined;
    for (const b of open) {
      const last = b.lines[b.lines.length - 1];
      const dy = l.baseline - last.baseline;
      const sameSize = Math.abs(b.size - l.size) <= 0.13 * b.size;
      const overlap = Math.min(b.right, l.right) - Math.max(b.x, l.x);
      const aligned = Math.abs(b.x - l.x) < 3 || overlap > 0.5 * Math.min(b.right - b.x, l.right - l.x);
      if (sameSize && aligned && dy > 0.4 * l.size && dy < 2.3 * l.size) {
        target = b;
        break;
      }
    }
    if (target) {
      target.lines.push(l);
      target.x = Math.min(target.x, l.x);
      target.right = Math.max(target.right, l.right);
    } else open.push({ lines: [l], x: l.x, right: l.right, size: l.size });
    // Retire blocks that can no longer grow.
    for (let i = open.length - 1; i >= 0; i--) {
      const last = open[i].lines[open[i].lines.length - 1];
      if (l.baseline - last.baseline > 3 * open[i].size) done.push(...open.splice(i, 1));
    }
  }
  done.push(...open);
  return done.map((b) => {
    const first = b.lines[0];
    const last = b.lines[b.lines.length - 1];
    const diffs = b.lines.slice(1).map((l, i) => l.baseline - b.lines[i].baseline);
    const chars = b.lines.reduce((n, l) => n + l.chars, 0);
    const font = mode(b.lines, (l) => l.chars, (l) => l.font)!.font;
    return {
      x: b.x,
      y: first.baseline - b.size * 0.78,
      w: b.right - b.x,
      h: last.baseline - first.baseline + b.size * 1.0,
      size: b.size,
      font,
      bold: isBold(font),
      lines: b.lines.length,
      chars,
      text: b.lines.map((l) => l.text).join(" ").slice(0, 90),
      leading: diffs.length ? round(median(diffs), 0.1) : 0,
    };
  });
}

/** Image placements from the operator list, in viewport points. */
function imageRects(pdfjs: PdfJs, ops: { fnArray: number[]; argsArray: unknown[] }, view: number[]): { x: number; y: number; w: number; h: number }[] {
  const { OPS, Util } = pdfjs;
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] as unknown[] | null;
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform && args) ctm = Util.transform(ctm, args as Matrix) as Matrix;
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      const m = args?.[0] as Matrix | null | undefined;
      if (Array.isArray(m) && m.length === 6) ctm = Util.transform(ctm, m) as Matrix;
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) {
      const pts = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ].map((p) => Util.applyTransform(p, ctm));
      const xs = pts.map((p) => p[0] - view[0]);
      const ys = pts.map((p) => view[3] - p[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      out.push({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y });
    }
  }
  return out;
}

/* --------------------------------------------------------------- colour */

class ColorHistogram {
  flat = new Map<number, number>();
  add(data: Uint8ClampedArray, w: number, h: number) {
    // Count only pixels inside flat-colour areas (panels, tabs, large type),
    // which say more about a design system than photographs do.
    for (let y = 1; y < h - 1; y += 2) {
      for (let x = 1; x < w - 1; x += 2) {
        const i = (y * w + x) * 4;
        let flat = true;
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
          [-1, 0],
          [0, -1],
        ]) {
          const j = ((y + dy) * w + x + dx) * 4;
          if (Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1]) + Math.abs(data[i + 2] - data[j + 2]) > 18) {
            flat = false;
            break;
          }
        }
        if (!flat) continue;
        const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
        this.flat.set(key, (this.flat.get(key) ?? 0) + 1);
      }
    }
  }
  palette(n = 6): string[] {
    const cands = [...this.flat.entries()]
      .map(([k, c]) => {
        const r = ((k >> 10) & 31) * 8 + 4;
        const g = ((k >> 5) & 31) * 8 + 4;
        const b = (k & 31) * 8 + 4;
        const max = Math.max(r, g, b) / 255;
        const min = Math.min(r, g, b) / 255;
        const l = (max + min) / 2;
        const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
        return { r, g, b, l, s, score: c * (0.4 + s) };
      })
      .filter((c) => c.s > 0.32 && c.l > 0.16 && c.l < 0.8)
      .sort((a, b) => b.score - a.score);
    const out: typeof cands = [];
    for (const c of cands) {
      if (out.every((o) => Math.hypot(o.r - c.r, o.g - c.g, o.b - c.b) > 70)) out.push(c);
      if (out.length >= n) break;
    }
    return out.map((c) => `#${[c.r, c.g, c.b].map((v) => Math.min(255, v).toString(16).padStart(2, "0")).join("")}`);
  }
}

/* ------------------------------------------------------- classification */

interface PageWork {
  number: number;
  blocks: RefTextBlock[];
  images: RefRect[];
  lines: Line[];
  thumb?: string;
  coverage: number;
  rotated: number;
}

const QUESTION = /\?\s*$/;

function classify(p: PageWork, body: number, total: number, H: number): Pick<RefPage, "type" | "confidence" | "reasons" | "textChars" | "bodyChars" | "columns"> {
  const content = p.blocks.filter((b) => !isFurniture(b, body, H));
  const textChars = content.reduce((n, b) => n + b.chars, 0);
  const bodyBlocks = content.filter((b) => Math.abs(b.size - body) <= body * 0.13);
  const bodyChars = bodyBlocks.reduce((n, b) => n + b.chars, 0);
  const maxSize = Math.max(0, ...content.map((b) => b.size));
  const big = content.filter((b) => b.size >= body * 1.6);
  // Interview questions: emphasised (bold or larger) body-area lines ending in "?".
  const questions = p.lines.filter((l) => QUESTION.test(l.text) && (l.bold || l.size > body * 1.05) && l.size < body * 1.6).length;
  const contentsWord = big.some((b) => /\bcontents?\b|\bin this issue\b/i.test(b.text));
  const messageWord = big.some((b) => /^\s*(a\s+)?message\s*$/i.test(b.text) || /^message from/i.test(b.text));
  const contacts = (p.lines.map((l) => l.text).join(" ").match(/www\.|\.com\b|@[a-z]|\+\d{2}\s?\d|toll free/gi) ?? []).length;
  const bigNumbers = big.filter((b) => /^[₹$€]?\s?[\d.,]+\s?(%|\+|cr|lakh|k|m|bn)?$/i.test(b.text.trim())).length;
  const columns = columnCount(bodyBlocks);
  const r: string[] = [];
  const res = (type: RefPageType, confidence: number) => ({ type, confidence, reasons: r, textChars, bodyChars, columns });

  if (p.number === 1) return (r.push("First page of the file"), res("cover", 0.9));
  if (contentsWord && p.number <= Math.max(8, total * 0.2)) return (r.push("Large “Contents” heading near the front"), res("contents", 0.9));
  if (p.coverage > 0.72 && bodyChars < 700) {
    r.push(`Images cover ${Math.round(p.coverage * 100)}% of the page`, `${bodyChars} characters of running text`);
    if (contacts) r.push(`${contacts} contact details (URL, phone, handle)`);
    return res("advertisement", contacts ? 0.85 : 0.7);
  }
  if (contacts >= 3 && p.coverage > 0.4 && bodyChars < 1600) return (r.push(`${contacts} contact details with ${Math.round(p.coverage * 100)}% image coverage`), res("advertisement", 0.6));
  if (messageWord) return (r.push("“Message” heading"), res("message", 0.85));
  const allText = p.lines.map((l) => l.text).join(" ");
  const interviewCue = /exclusive conversation|in conversation with|edited excerpts|interview(ed)? by|speaks? to|spoke (to|with)|in an interview/i.test(allText);
  if (questions >= 3 || (questions >= 1 && interviewCue)) {
    r.push(`${questions} emphasised question${questions === 1 ? "" : "s"}`);
    if (interviewCue) r.push("Interview wording in the standfirst");
    return res("interview", questions >= 3 ? 0.8 : 0.7);
  }
  if (bigNumbers >= 3) return (r.push(`${bigNumbers} large statistics`), res("infographic", 0.6));
  if (maxSize >= body * 3.2 && bodyChars < 2200) {
    r.push(`Display type ${round(maxSize)}pt (${(maxSize / body).toFixed(1)}× body)`, `${Math.round(p.coverage * 100)}% image coverage`);
    return res("feature-opener", 0.7);
  }
  if (bodyChars >= 1200) {
    r.push(`${bodyChars} characters of body text`, `${columns} column${columns === 1 ? "" : "s"}`);
    return res("article", columns >= 2 ? 0.8 : 0.65);
  }
  r.push("No strong signals");
  return res("other", 0.4);
}

export function isFurniture(b: RefTextBlock, body: number, H: number) {
  return (b.y < H * 0.085 || b.y + b.h > H * 0.925) && b.size <= body * 1.25 && b.lines <= 2;
}

function columnCount(bodyBlocks: RefTextBlock[]) {
  const tall = bodyBlocks.filter((b) => b.lines >= 4);
  const xs: number[] = [];
  for (const b of tall.sort((a, c) => a.x - c.x)) if (!xs.some((x) => Math.abs(x - b.x) < 4)) xs.push(b.x);
  return Math.max(1, xs.length);
}

/* ---------------------------------------------------------------- main */

export async function analyzeReference(file: File, opts: AnalyzeOptions): Promise<ReferenceProfile> {
  const t0 = performance.now();
  const { onProgress, signal } = opts;
  const check = () => {
    if (signal?.aborted) throw new AnalysisError("Analysis cancelled.");
  };
  if (file.size > MAX_FILE) throw new AnalysisError("This file is larger than 300 MB. Export a lighter PDF (e.g. ‘Smallest file size’) and try again.");
  onProgress({ stage: "Reading file", value: 1 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder("latin1").decode(bytes.subarray(0, 1024)).indexOf("%PDF-") < 0) throw new AnalysisError("This doesn’t look like a PDF file. Upload the magazine as a PDF export.");
  check();

  onProgress({ stage: "Reading page boxes (trim and bleed)", value: 3 });
  const boxes = await findBoxes(bytes, signal);
  check();

  const pdfjs = await loadPdfJs();
  let doc: Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;
  try {
    doc = await pdfjs.getDocument({ data: bytes, fontExtraProperties: true, isEvalSupported: false }).promise;
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === "PasswordException") throw new AnalysisError("This PDF is password-protected. Remove the password and upload it again.");
    throw new AnalysisError("The PDF could not be opened — it may be damaged or not a standard PDF.");
  }

  try {
    const total = doc.numPages;
    const want = Math.min(total, Math.max(4, opts.maxPages));
    // Front matter (cover, contents, messages) is dense with page types, so measure it fully,
    // then sample the rest evenly through to the back cover.
    const front = Math.min(want, total, Math.max(4, Math.round(want * 0.3)));
    const rest = want - front;
    const numbers = [
      ...new Set([
        ...Array.from({ length: front }, (_, i) => i + 1),
        ...Array.from({ length: rest }, (_, i) => front + 1 + Math.round((i * (total - front - 1)) / Math.max(1, rest - 1))),
      ]),
    ].filter((n) => n <= total);

    // Geometry from the first page (magazines use one page size).
    const first = await doc.getPage(1);
    const view = first.view;
    const viewW = view[2] - view[0];
    const viewH = view[3] - view[1];
    let trimL = 0;
    let trimT = 0;
    let trimW = viewW;
    let trimH = viewH;
    let trimSource: ReferenceProfile["trimSource"] = "mediabox";
    if (boxes.trim) {
      const [x0, y0, x1, y1] = boxes.trim;
      const w = x1 - x0;
      const h = y1 - y0;
      if (w > viewW * 0.6 && h > viewH * 0.6 && w <= viewW + 1 && h <= viewH + 1) {
        trimL = x0 - view[0];
        trimT = view[3] - y1;
        trimW = w;
        trimH = h;
        trimSource = "trimbox";
      }
    }
    const W = mm(trimW);
    const H = mm(trimH);
    let bleed = 0;
    let bleedSource: ReferenceProfile["bleedSource"] = "none";
    if (boxes.bleed && trimSource === "trimbox") {
      const b = boxes.trim!;
      bleed = Math.max(0, round(mm(Math.min(b[0] - boxes.bleed[0], boxes.bleed[2] - b[2])), 0.5));
      bleedSource = "bleedbox";
    } else if (trimSource === "trimbox") {
      bleed = Math.min(5, round(mm(Math.min(trimL, trimT)), 0.5));
      bleedSource = "default";
    }
    const toMm = (x: number, y: number) => ({ x: mm(x - trimL), y: mm(y - trimT) });

    const hist = new ColorHistogram();
    const fontChars = new Map<string, number>();
    const work: PageWork[] = [];
    const canvas = document.createElement("canvas");
    const ctx2d = canvas.getContext("2d", { willReadFrequently: true })!;

    for (let k = 0; k < numbers.length; k++) {
      check();
      const n = numbers[k];
      onProgress({ stage: `Measuring page ${n} of ${total} (${k + 1}/${numbers.length})`, value: 5 + (k / numbers.length) * 78 });
      const page = await doc.getPage(n);
      const pv = page.view;
      const [ops, text] = await Promise.all([page.getOperatorList(), page.getTextContent()]);

      // Real font names become available once the operator list has loaded them.
      const fontName = (id: string) => {
        try {
          if (page.commonObjs.has(id)) {
            const f = page.commonObjs.get(id) as { name?: string } | undefined;
            if (f?.name) return cleanFont(f.name);
          }
        } catch {
          /* fall through */
        }
        return cleanFont((text.styles[id] as { fontFamily?: string } | undefined)?.fontFamily ?? "Unknown");
      };

      const items: RawItem[] = [];
      let rotated = 0;
      for (const it of text.items) {
        if (!("str" in it) || !it.str.trim()) continue;
        const t = it.transform as Matrix;
        const size = Math.hypot(t[2], t[3]);
        if (size < 3) continue;
        if (Math.abs(t[1]) > 0.05 * Math.abs(t[0]) || Math.abs(t[2]) > 0.05 * Math.abs(t[3])) {
          rotated++;
          continue;
        }
        const font = fontName(it.fontName);
        fontChars.set(font, (fontChars.get(font) ?? 0) + it.str.length);
        // Trim-relative points; converted to mm once lines and blocks are built.
        items.push({ x: t[4] - pv[0] - trimL, baseline: pv[3] - t[5] - trimT, w: it.width, size, font, str: it.str });
      }
      const ptLines = itemsToLines(items);
      const lines = ptLines.map((l) => ({ ...l, x: mm(l.x), right: mm(l.right), baseline: mm(l.baseline) }));
      const blocks = linesToBlocks(ptLines).map((b) => ({ ...b, x: round(mm(b.x), 0.1), y: round(mm(b.y), 0.1), w: round(mm(b.w), 0.1), h: round(mm(b.h), 0.1) }));

      const images = dedupeRects(
        imageRects(pdfjs, ops, pv)
          .map((r) => {
            const p = toMm(r.x, r.y);
            return clampRect({ x: p.x, y: p.y, w: mm(r.w), h: mm(r.h) }, W, H, bleed + 2);
          })
          .filter((r): r is RefRect => !!r && r.w >= 8 && r.h >= 8),
      );

      // Thumbnail + colour sampling.
      const scale = 116 / trimW;
      const vp = page.getViewport({ scale });
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      ctx2d.fillStyle = "#fff";
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx2d, viewport: vp, intent: "print" }).promise;
      hist.add(ctx2d.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
      const thumb = cropToTrim(canvas, trimL * scale, trimT * scale, trimW * scale, trimH * scale, 0.62);

      work.push({ number: n, blocks, images: images.slice(0, 16), lines, thumb, coverage: coverage(images, W, H), rotated });
      page.cleanup();
    }

    onProgress({ stage: "Inferring typography and grid", value: 85 });
    const allLines = work.flatMap((p) => p.lines);
    const hasTextLayer = allLines.length > 20;
    const sizeChars = new Map<number, { chars: number; sample: string }>();
    for (const l of allLines) {
      const s = round(l.size, 0.5);
      const e = sizeChars.get(s) ?? { chars: 0, sample: "" };
      e.chars += l.chars;
      if (l.chars > e.sample.length && l.chars < 70) e.sample = l.text;
      sizeChars.set(s, e);
    }
    const totalChars = [...sizeChars.values()].reduce((n, e) => n + e.chars, 0) || 1;
    const bodyCand = allLines.filter((l) => l.chars >= 25);
    const bodySize = round(mode(bodyCand, (l) => l.chars, (l) => String(round(l.size, 0.25)))?.size ?? 9, 0.25) || 9;
    const isBody = (b: { size: number }) => Math.abs(b.size - bodySize) <= bodySize * 0.13;
    const allBlocks = work.flatMap((p) => p.blocks.filter((b) => !isFurniture(b, bodySize, H)));
    const bodyBlocks = allBlocks.filter((b) => isBody(b) && b.lines >= 3);
    const bodyFont = mode(bodyBlocks, (b) => b.chars, (b) => b.font)?.font ?? "Unknown";
    const leading = round(median(bodyBlocks.map((b) => b.leading).filter((x) => x > bodySize * 0.9 && x < bodySize * 2)) || bodySize * 1.3, 0.1);
    const align = justified(work, bodySize) ? "justify" : "left";

    const heads = work
      .map((p) => p.blocks.filter((b) => b.size >= bodySize * 1.7 && b.chars >= 6).sort((a, b) => b.size - a.size)[0])
      .filter((b): b is RefTextBlock => !!b);
    const headSize = round(median(heads.map((h) => h.size)) || bodySize * 3, 0.5);
    const headFont = mode(heads, (h) => h.chars, (h) => h.font)?.font ?? bodyFont;
    const decks = allBlocks.filter((b) => b.size > bodySize * 1.15 && b.size < headSize * 0.7 && b.lines <= 4 && b.chars >= 20);
    const deckSize = decks.length ? round(mode(decks, (b) => b.chars, (b) => String(round(b.size)))!.size) : undefined;
    const deckFont = decks.length ? mode(decks, (b) => b.chars, (b) => b.font)!.font : undefined;
    const caps = allBlocks.filter((b) => b.size >= bodySize * 0.6 && b.size <= bodySize * 0.92 && b.chars >= 20);
    const capSize = caps.length ? round(mode(caps, (b) => b.chars, (b) => String(round(b.size)))!.size) : undefined;
    const capFont = caps.length ? mode(caps, (b) => b.chars, (b) => b.font)!.font : undefined;

    // Grid: columns, gutter and margins from body text on text-heavy pages.
    const colCounts: number[] = [];
    const colWidths: number[] = [];
    const gutters: number[] = [];
    const m = { top: [] as number[], bottom: [] as number[], inside: [] as number[], outside: [] as number[] };
    for (const p of work) {
      const bb = p.blocks.filter((b) => isBody(b) && b.lines >= 4 && !isFurniture(b, bodySize, H));
      if (bb.reduce((n, b) => n + b.chars, 0) < 900) continue;
      const xs: number[] = [];
      for (const b of [...bb].sort((a, c) => a.x - c.x)) if (!xs.some((x) => Math.abs(x - b.x) < 4)) xs.push(b.x);
      colCounts.push(xs.length);
      const width = median(bb.map((b) => b.w));
      colWidths.push(width);
      for (let i = 1; i < xs.length; i++) {
        const g = xs[i] - xs[i - 1] - width;
        if (g > 1.5 && g < 16) gutters.push(g);
      }
      const content = p.blocks.filter((b) => !isFurniture(b, bodySize, H) && b.chars > 3);
      const left = Math.min(...content.map((b) => b.x));
      const right = W - Math.max(...content.map((b) => b.x + b.w));
      const top = Math.min(...content.map((b) => b.y));
      const bottom = H - Math.max(...bb.map((b) => b.y + b.h));
      if (left > 2 && left < W * 0.3) (p.number % 2 === 0 ? m.outside : m.inside).push(left);
      if (right > 2 && right < W * 0.3) (p.number % 2 === 0 ? m.inside : m.outside).push(right);
      if (top > 2 && top < H * 0.3) m.top.push(top);
      if (bottom > 2 && bottom < H * 0.3) m.bottom.push(bottom);
    }
    const columns = mode(colCounts.filter((c) => c >= 1)) ?? 2;
    const gutter = round(median(gutters) || 5, 0.5);
    const margins = {
      top: round(percentile(m.top, 0.3) || 20, 0.5),
      bottom: round(percentile(m.bottom, 0.3) || 18, 0.5),
      inside: round(median(m.inside) || 15, 0.5),
      outside: round(median(m.outside) || 15, 0.5),
    };

    // Running heads → sections.
    const headCounts = new Map<string, Set<number>>();
    const candidates = new Map<number, string[]>();
    for (const p of work) {
      const c = p.blocks
        .filter((b) => b.y < H * 0.085 && b.size <= bodySize * 1.25 && b.chars >= 4 && b.chars <= 48)
        .map((b) => b.text.trim())
        .filter((t) => /[A-Za-z]{3}/.test(t) && !/www\.|\.com|@|issue|vol\.|^\d+$/i.test(t))
        .map((t) => t.replace(/\s+/g, " ").toUpperCase());
      candidates.set(p.number, c);
      for (const t of new Set(c)) headCounts.set(t, (headCounts.get(t) ?? new Set()).add(p.number));
    }
    const runningHead = (n: number) =>
      (candidates.get(n) ?? [])
        .filter((t) => (headCounts.get(t)?.size ?? 0) >= 2 && (headCounts.get(t)?.size ?? 0) <= work.length * 0.6)
        .sort((a, b) => (headCounts.get(b)?.size ?? 0) - (headCounts.get(a)?.size ?? 0))[0];

    onProgress({ stage: "Classifying pages", value: 89 });
    const pages: RefPage[] = work.map((p) => {
      const c = classify(p, bodySize, total, H);
      const rh = runningHead(p.number);
      return {
        number: p.number,
        ...c,
        detectedType: c.type,
        thumb: p.thumb,
        blocks: p.blocks.sort((a, b) => b.size - a.size || b.chars - a.chars).slice(0, 60),
        images: p.images,
        runningHead: rh ? titleCase(rh) : undefined,
        imageCoverage: Math.round(p.coverage * 100) / 100,
      };
    });
    const sections: ReferenceProfile["sections"] = [];
    for (const p of pages) {
      if (!p.runningHead) continue;
      const s = sections.find((x) => x.name === p.runningHead);
      if (s) s.pages.push(p.number);
      else sections.push({ name: p.runningHead, pages: [p.number] });
    }

    onProgress({ stage: "Rendering previews of key layouts", value: 92 });
    const previews: Record<number, string> = {};
    // Sharper previews for likely model pages (top candidates per layout type) and key pages.
    const ranked = rankedPages(pages, bodySize, columns);
    const previewPages = [
      ...new Set([
        ...Object.values(representatives(pages, bodySize, columns)),
        ...(["article", "interview", "message", "feature-opener"] as RefPageType[]).flatMap((t) => (ranked[t] ?? []).slice(0, 2)),
      ]),
    ].slice(0, 9);
    for (const n of previewPages) {
      check();
      const page = await doc.getPage(n);
      const scale = 360 / trimW;
      const vp = page.getViewport({ scale });
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      ctx2d.fillStyle = "#fff";
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx2d, viewport: vp, intent: "print" }).promise;
      previews[n] = cropToTrim(canvas, trimL * scale, trimT * scale, trimW * scale, trimH * scale, 0.66);
      page.cleanup();
    }

    const fontTotal = [...fontChars.values()].reduce((a, b) => a + b, 0) || 1;
    const fonts = [...fontChars.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, c]) => ({ name, share: Math.round((c / fontTotal) * 1000) / 10, role: fontRole(name), substitute: fontDisplayNames[fontRole(name)] }));

    const notes: string[] = [];
    if (numbers.length < total) notes.push(`Sampled ${numbers.length} of ${total} pages, evenly spaced.`);
    if (trimSource === "mediabox") notes.push("No TrimBox found — the full page box is treated as the trim size; bleed is unknown.");
    if (!hasTextLayer) notes.push("Little or no live text was found (scanned or outlined PDF). Typography and grid could not be measured; defaults are shown.");
    const rotated = work.reduce((n, p) => n + p.rotated, 0);
    if (rotated) notes.push(`${rotated} rotated text runs (vertical tabs, spines) were ignored.`);
    const swapped = fonts.find((f) => !f.name.toLowerCase().startsWith(f.substitute.toLowerCase().split(" ")[0]));
    if (swapped) notes.push(`Fonts not available in the browser are substituted with the closest web font (e.g. ${swapped.name} → ${swapped.substitute}).`);

    onProgress({ stage: "Done", value: 100 });
    return {
      id: `ref-${Date.now().toString(36)}`,
      name: file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 80),
      fileName: file.name,
      fileSize: file.size,
      createdAt: new Date().toISOString(),
      durationMs: Math.round(performance.now() - t0),
      pageCount: total,
      trim: { width: round(W, 0.5), height: round(H, 0.5) },
      trimSource,
      bleed,
      bleedSource,
      margins,
      columns,
      gutter,
      hasTextLayer,
      body: { font: bodyFont, role: fontRole(bodyFont), size: bodySize, leading, align },
      headline: { font: headFont, role: fontRole(headFont), size: headSize },
      deck: deckSize && deckFont ? { font: deckFont, role: fontRole(deckFont), size: deckSize } : undefined,
      caption: capSize && capFont ? { font: capFont, role: fontRole(capFont), size: capSize } : undefined,
      typeScale: [...sizeChars.entries()]
        .map(([size, e]) => ({ size, share: Math.round((e.chars / totalChars) * 1000) / 10, sample: e.sample }))
        .filter((s) => s.share >= 0.4)
        .sort((a, b) => b.size - a.size)
        .slice(0, 12),
      fonts,
      palette: hist.palette(6),
      sections,
      pages,
      previews,
      notes,
    };
  } finally {
    void doc.destroy();
  }
}

/* -------------------------------------------------------------- helpers */

function titleCase(s: string) {
  return s
    .toLowerCase()
    .replace(/(^|[\s\-/(&])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase())
    .replace(/\b(And|Of|The|For|In|To)\b/g, (w) => w.toLowerCase())
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\b(Csr|Ai|Dpi|It|Esg|Gpt)\b/g, (w) => w.toUpperCase())
    .replace(/\bNgos\b/g, "NGOs")
    .replace(/\bMous\b/g, "MoUs");
}

function clampRect(r: RefRect, W: number, H: number, allow: number): RefRect | null {
  const x0 = Math.max(-allow, r.x);
  const y0 = Math.max(-allow, r.y);
  const x1 = Math.min(W + allow, r.x + r.w);
  const y1 = Math.min(H + allow, r.y + r.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: round(x0, 0.1), y: round(y0, 0.1), w: round(x1 - x0, 0.1), h: round(y1 - y0, 0.1) };
}

function dedupeRects(rs: RefRect[]) {
  const out: RefRect[] = [];
  for (const r of rs.sort((a, b) => b.w * b.h - a.w * a.h)) {
    if (!out.some((o) => Math.abs(o.x - r.x) < 2 && Math.abs(o.y - r.y) < 2 && Math.abs(o.w - r.w) < 3 && Math.abs(o.h - r.h) < 3)) out.push(r);
  }
  return out;
}

function coverage(rs: RefRect[], W: number, H: number) {
  const N = 40;
  const M = 54;
  let hit = 0;
  for (let i = 0; i < N; i++)
    for (let j = 0; j < M; j++) {
      const x = ((i + 0.5) / N) * W;
      const y = ((j + 0.5) / M) * H;
      if (rs.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)) hit++;
    }
  return hit / (N * M);
}

function justified(work: PageWork[], body: number) {
  let aligned = 0;
  let total = 0;
  for (const p of work) {
    const lines = p.lines.filter((l) => Math.abs(l.size - body) <= body * 0.13 && l.chars > 30);
    const byX = new Map<number, Line[]>();
    for (const l of lines) {
      const k = Math.round(l.x / 3);
      byX.set(k, [...(byX.get(k) ?? []), l]);
    }
    for (const group of byX.values()) {
      if (group.length < 6) continue;
      const rights = group.map((l) => l.right);
      const med = median(rights);
      aligned += rights.filter((r) => Math.abs(r - med) < 0.6).length;
      total += rights.length;
    }
  }
  return total > 0 && aligned / total > 0.55;
}

function cropToTrim(canvas: HTMLCanvasElement, x: number, y: number, w: number, h: number, q: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  c.getContext("2d")!.drawImage(canvas, x, y, w, h, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", q);
}

/** Pages of each type ranked as layout models: a clear headline plus the richest structure. */
export function rankedPages(pages: RefPage[], bodySize = 9, columns = 2): Partial<Record<RefPageType, number[]>> {
  // Sponsored pages rarely follow the house grid.
  const sponsored = (p: RefPage) => (/advertorial|sponsored|promotion|partner content|brand ?story/i.test(p.runningHead ?? "") ? -4 : 0);
  const headed = (p: RefPage) => (p.blocks.some((b) => b.size >= bodySize * 1.8 && b.chars >= 6 && b.y < 140) ? 6 : 0) + sponsored(p);
  const score = (p: RefPage) => {
    switch (p.type) {
      case "article":
        return headed(p) + Math.min(3, p.bodyChars / 1500) + (p.images.length ? 2 : 0) + (p.columns === columns ? 3 : 0) + p.confidence;
      case "interview":
        return headed(p) + Math.min(3, p.bodyChars / 1500) + (p.images.length ? 3 : 0);
      case "feature-opener":
        return headed(p) + p.imageCoverage * 4 + p.confidence;
      case "message":
        return headed(p) + (p.images.length ? 2 : 0) + Math.min(2, p.bodyChars / 1500);
      default:
        return p.confidence;
    }
  };
  const out: Partial<Record<RefPageType, number[]>> = {};
  for (const p of [...pages].sort((a, b) => score(b) - score(a))) (out[p.type] ??= []).push(p.number);
  return out;
}

/** Best example page per type. */
export function representatives(pages: RefPage[], bodySize = 9, columns = 2): Partial<Record<RefPageType, number>> {
  const ranked = rankedPages(pages, bodySize, columns);
  return Object.fromEntries(Object.entries(ranked).map(([k, v]) => [k, v![0]]));
}
