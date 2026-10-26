import { MM_PER_PT } from "./design-tokens";
import { fontFamilies } from "./fonts";
import type { BodySlice, TextStyle } from "./types";

/**
 * Text engine: parses article bodies into typed paragraphs, measures them with
 * the real page fonts (canvas `measureText`) and fits them into threaded,
 * multi-column frames the same way the CSS renderer lays them out
 * (greedy line breaking, `column-fill: auto`, no hyphenation).
 *
 * The same results drive the page renderer (which words go in which frame),
 * the overset markers in Layout Studio and the QA overflow check.
 */

export type ParaKind = "p" | "q" | "a" | "h";

export interface Para {
  kind: ParaKind;
  words: string[];
}

export type ParaSlice = BodySlice;

export interface Cursor {
  p: number;
  w: number;
}

export function parseBody(body: string): Para[] {
  return body
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((raw) => raw.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((t) => {
      let kind: ParaKind = "p";
      let txt = t;
      if (/^Q:\s*/.test(t)) {
        kind = "q";
        txt = t.replace(/^Q:\s*/, "");
      } else if (/^A:\s*/.test(t)) {
        kind = "a";
        txt = t.replace(/^A:\s*/, "");
      } else if (t.startsWith("## ")) {
        kind = "h";
        txt = t.slice(3);
      }
      return { kind, words: txt.split(" ").filter(Boolean) };
    });
}

/** Word count, ignoring the Q:/A:/## markup used in article bodies. */
export const countWords = (text: string) => {
  const t = text.replace(/(^|\n)\s*(Q:|A:|##)\s*/g, "$1").trim();
  return t ? t.split(/\s+/).length : 0;
};

/** Style for a paragraph kind, derived from the frame's base style. */
export function paraStyle(kind: ParaKind, base: TextStyle): TextStyle {
  switch (kind) {
    case "q":
      return { ...base, weight: 700, spaceAfter: 3, align: base.align === "justify" ? "left" : base.align };
    case "h":
      return {
        ...base,
        font: "body",
        weight: 700,
        size: base.size + 2,
        leading: base.leading + 2,
        align: "left",
        spaceAfter: 3,
      };
    default:
      return base;
  }
}

/* --------------------------------------------------------- measurement */

let ctx: CanvasRenderingContext2D | null | undefined;
const widthCache = new Map<string, number>();
/** Small safety margin so the estimator never fits more than the browser can. */
const SAFETY = 1.025;

function context() {
  if (ctx === undefined) {
    ctx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  }
  return ctx;
}

/** Clear cached widths (call after web fonts finish loading). */
export function resetMeasureCache() {
  widthCache.clear();
}

export function fontShorthand(style: TextStyle, sizePt = style.size) {
  return `${style.italic ? "italic " : ""}${style.weight} ${sizePt}px ${fontFamilies[style.font]}`;
}

/** Width of a string in mm. */
export function measureMm(text: string, style: TextStyle): number {
  const font = fontShorthand(style, 100);
  const key = `${font}|${style.tracking ?? 0}|${style.uppercase ? 1 : 0}|${text}`;
  let w100 = widthCache.get(key);
  if (w100 === undefined) {
    const s = style.uppercase ? text.toUpperCase() : text;
    const c = context();
    if (c) {
      c.font = font;
      w100 = c.measureText(s).width;
    } else {
      w100 = s.length * 50; // SSR fallback: ~0.5 em average advance
    }
    w100 += s.length * ((style.tracking ?? 0) / 1000) * 100;
    widthCache.set(key, w100);
  }
  // width at 100 units -> scale to point size -> mm
  return (w100 / 100) * style.size * MM_PER_PT * SAFETY;
}

/* -------------------------------------------------------------- fitting */

export interface FrameBox {
  width: number;
  height: number;
  columns: number;
  gutter: number;
}

export interface FitResult {
  slices: ParaSlice[];
  end: Cursor;
  /** Height used in the last column touched (mm). */
  linesUsed: number;
  linesAvailable: number;
  done: boolean;
}

export const DROP_CAP_LINES = 3;

/**
 * Fit paragraphs starting at `start` into one (possibly multi-column) frame.
 */
export function fitFrame(paras: Para[], start: Cursor, box: FrameBox, base: TextStyle, dropCap: boolean): FitResult {
  const colWidth = (box.width - box.gutter * (box.columns - 1)) / box.columns;
  const slices: ParaSlice[] = [];
  let col = 0;
  let y = 0;
  let linesUsed = 0;
  const baseLead = base.leading * MM_PER_PT;
  const linesAvailable = Math.floor((box.height + 0.01) / baseLead) * box.columns;
  const cursor: Cursor = { ...start };
  let full = false;

  while (cursor.p < paras.length && !full) {
    const para = paras[cursor.p];
    const style = paraStyle(para.kind, base);
    const lead = style.leading * MM_PER_PT;
    const space = measureMm(" ", style);
    const startW = cursor.w;
    const isFirst = cursor.p === 0 && startW === 0;
    const useDrop = dropCap && isFirst && para.kind === "p" && para.words.length > 30;
    const dropWidth = useDrop ? measureMm(para.words[0][0], { ...style, size: style.leading * DROP_CAP_LINES * 0.95, weight: 700 }) + 1.2 : 0;

    if (para.kind === "h" && y > 0) y += lead * 0.5;

    let w = startW;
    let lineInPara = 0;
    let placedAny = false;
    while (w < para.words.length) {
      // Need a new column?
      if (y + lead > box.height + 0.01) {
        col++;
        y = 0;
        if (col >= box.columns) {
          full = true;
          break;
        }
      }
      // Build one line greedily.
      const max = colWidth - (useDrop && lineInPara < DROP_CAP_LINES ? dropWidth : 0);
      let lineW = 0;
      let n = 0;
      while (w + n < para.words.length) {
        const ww = measureMm(para.words[w + n], style);
        const next = n === 0 ? ww : lineW + space + ww;
        if (n > 0 && next > max) break;
        lineW = next;
        n++;
      }
      w += n;
      y += lead;
      lineInPara++;
      linesUsed++;
      placedAny = true;
    }
    if (placedAny) {
      slices.push({
        kind: para.kind,
        text: para.words.slice(startW, w).join(" "),
        continued: startW > 0,
        split: w < para.words.length,
        first: isFirst,
        dropCap: useDrop && startW === 0,
      });
    }
    if (w >= para.words.length) {
      cursor.p++;
      cursor.w = 0;
      if (y > 0) y += (style.spaceAfter ?? 0) * MM_PER_PT;
    } else {
      cursor.w = w;
    }
  }
  return { slices, end: cursor, linesUsed, linesAvailable, done: cursor.p >= paras.length };
}

/** Estimate the number of lines a short (non-threaded) text needs in a frame. */
export function measureBlock(text: string, width: number, style: TextStyle): number {
  const space = measureMm(" ", style);
  let lines = 0;
  for (const raw of text.split("\n")) {
    const words = raw.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines++;
      continue;
    }
    let lineW = 0;
    lines++;
    for (const word of words) {
      const ww = measureMm(word, style);
      if (lineW === 0) lineW = ww;
      else if (lineW + space + ww <= width) lineW += space + ww;
      else {
        lines++;
        lineW = ww;
      }
    }
  }
  return lines;
}

/** Does a non-threaded text frame overflow? Returns the fill ratio (>1 = overset). */
export function blockFill(text: string, box: { width: number; height: number }, style: TextStyle): number {
  if (!text.trim()) return 0;
  const lines = measureBlock(text, box.width, style);
  const needed = lines * style.leading * MM_PER_PT;
  return needed / Math.max(box.height, 0.1);
}

export function remainingWords(paras: Para[], c: Cursor) {
  let n = 0;
  for (let i = c.p; i < paras.length; i++) n += i === c.p ? paras[i].words.length - c.w : paras[i].words.length;
  return n;
}
