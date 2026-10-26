import type { ImageSubject } from "@/lib/types";

/**
 * Procedural, fully offline editorial artwork library.
 * Every image is a deterministic SVG string generated from its id, so the
 * demo never needs external images, fonts or downloads.
 */

export interface SampleArtwork {
  id: string;
  name: string;
  subject: ImageSubject;
  width: number;
  height: number;
  alt: string;
  credit: string;
}

/* ------------------------------------------------------------------ */
/* Core helpers                                                        */
/* ------------------------------------------------------------------ */

type Rng = () => number;
type Pt = [number, number, number?];
type Stop = [number, string, number?];

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const f = (n: number): string => {
  const r = Math.round(n * 10) / 10;
  return Object.is(r, -0) ? "0" : String(r).replace(/^(-?)0\./, "$1.");
};
const f2 = (n: number): string => String(Math.round(n * 100) / 100).replace(/^(-?)0\./, "$1.");

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const c = (i: number): string =>
    Math.round(x[i] + (y[i] - x[i]) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${c(0)}${c(1)}${c(2)}`;
}
const darken = (c: string, t: number): string => mix(c, "#000000", t);
const lighten = (c: string, t: number): string => mix(c, "#ffffff", t);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Closed or open Catmull-Rom spline through points. A third value of 1 marks a sharp corner. */
function spline(pts: Pt[], closed = true, tension = 1): string {
  const n = pts.length;
  const get = (i: number): Pt => (closed ? pts[((i % n) + n) % n] : pts[clamp(i, 0, n - 1)]);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const k1 = p1[2] === 1 ? 0 : tension / 6;
    const k2 = p2[2] === 1 ? 0 : tension / 6;
    const c1x = p1[0] + (p2[0] - p0[0]) * k1;
    const c1y = p1[1] + (p2[1] - p0[1]) * k1;
    const c2x = p2[0] - (p3[0] - p1[0]) * k2;
    const c2y = p2[1] - (p3[1] - p1[1]) * k2;
    d += `C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return closed ? d + "Z" : d;
}

function polyD(pts: number[][]): string {
  return pts.map((p, i) => `${i ? "L" : "M"}${f(p[0])} ${f(p[1])}`).join("") + "Z";
}

const attr = (ex: string): string => (ex ? " " + ex : "");
const P = (d: string, fill: string, ex = ""): string => `<path d="${d}" fill="${fill}"${attr(ex)}/>`;
const R = (x: number, y: number, w: number, h: number, fill: string, ex = ""): string =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${attr(ex)}/>`;
const C = (cx: number, cy: number, r: number, fill: string, ex = ""): string =>
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}"${attr(ex)}/>`;
const E = (cx: number, cy: number, rx: number, ry: number, fill: string, ex = ""): string =>
  `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${attr(ex)}/>`;
const U = (id: string, fill: string, ex = ""): string => `<use href="#${id}" fill="${fill}"${attr(ex)}/>`;
const G = (inner: string, ex: string): string => `<g ${ex}>${inner}</g>`;
const op = (o: number): string => `opacity="${f2(o)}"`;
const sk = (col: string, w: number, o = 1): string =>
  `stroke="${col}" stroke-width="${f(w)}"${o < 1 ? ` stroke-opacity="${f2(o)}"` : ""}`;
const L = (d: string, col: string, w: number, o = 1, ex = ""): string => `<path d="${d}" fill="none" ${sk(col, w, o)}${attr(ex)}/>`;
const FONT = 'font-family="Arial, Helvetica, sans-serif"';
const T = (x: number, y: number, size: number, weight: number, fill: string, text: string, ex = ""): string =>
  `<text x="${f(x)}" y="${f(y)}" ${FONT} font-size="${f(size)}" font-weight="${weight}" fill="${fill}"${attr(ex)}>${esc(text)}</text>`;

class Art {
  private defs: string[] = [];
  private parts: string[] = [];
  private n = 0;
  private softCache = new Map<string, string>();
  readonly rnd: Rng;
  constructor(
    readonly id: string,
    readonly w: number,
    readonly h: number,
    readonly outW: number,
    readonly outH: number,
  ) {
    this.rnd = mulberry32(hashString(id));
  }
  uid(p: string): string {
    return `${this.id}-${p}${(this.n++).toString(36)}`;
  }
  def(s: string): void {
    this.defs.push(s);
  }
  add(...s: string[]): void {
    this.parts.push(...s);
  }
  r(lo: number, hi: number): number {
    return lo + (hi - lo) * this.rnd();
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.rnd() * arr.length) % arr.length];
  }
  private stops(stops: Stop[]): string {
    return stops
      .map(
        ([o, c, a]) =>
          `<stop offset="${f2(o)}" stop-color="${c}"${a !== undefined && a < 1 ? ` stop-opacity="${f2(a)}"` : ""}/>`,
      )
      .join("");
  }
  private gradCache = new Map<string, string>();
  /** Registers a gradient, reusing an identical earlier definition. */
  private grad(tag: string, attrs: string, stops: Stop[]): string {
    const body = `${attrs}>${this.stops(stops)}</${tag}>`;
    const hit = this.gradCache.get(tag + body);
    if (hit) return hit;
    const id = this.uid("g");
    this.def(`<${tag} id="${id}"${body}`);
    const url = `url(#${id})`;
    this.gradCache.set(tag + body, url);
    return url;
  }
  /** Linear gradient; coordinates are bounding-box fractions unless user=true. */
  lin(stops: Stop[], x1 = 0, y1 = 0, x2 = 0, y2 = 1, user = false): string {
    const u = user ? ' gradientUnits="userSpaceOnUse"' : "";
    const fmt = user ? f : f2;
    const attrs =
      (x1 ? ` x1="${fmt(x1)}"` : "") +
      (y1 ? ` y1="${fmt(y1)}"` : "") +
      (user || x2 !== 1 ? ` x2="${fmt(x2)}"` : "") +
      (y2 ? ` y2="${fmt(y2)}"` : "") +
      u;
    return this.grad("linearGradient", attrs, stops);
  }
  rad(stops: Stop[], cx = 0.5, cy = 0.5, r = 0.5, user = false, fx?: number, fy?: number): string {
    const fmt = user ? f : f2;
    const foc = fx !== undefined && fy !== undefined ? ` fx="${fmt(fx)}" fy="${fmt(fy)}"` : "";
    const attrs =
      (user || cx !== 0.5 ? ` cx="${fmt(cx)}"` : "") +
      (user || cy !== 0.5 ? ` cy="${fmt(cy)}"` : "") +
      (user || r !== 0.5 ? ` r="${fmt(r)}"` : "") +
      foc +
      (user ? ' gradientUnits="userSpaceOnUse"' : "");
    return this.grad("radialGradient", attrs, stops);
  }
  /** Soft radial blob paint: colour fading to transparent (cached per colour). */
  soft(color: string, inner = 1): string {
    const key = color + inner;
    const hit = this.softCache.get(key);
    if (hit) return hit;
    const url = this.rad([
      [0, color, inner],
      [1, color, 0],
    ]);
    this.softCache.set(key, url);
    return url;
  }
  /** Registers a reusable path in defs and returns its id. */
  shape(d: string): string {
    const id = this.uid("p");
    this.def(`<path id="${id}" d="${d}"/>`);
    return id;
  }
  clipRef(id: string): string {
    const cid = this.uid("c");
    this.def(`<clipPath id="${cid}"><use href="#${id}"/></clipPath>`);
    return `clip-path="url(#${cid})"`;
  }
  clip(d: string): string {
    const id = this.uid("c");
    this.def(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
    return `clip-path="url(#${id})"`;
  }
  blur(sd: number): string {
    const id = this.uid("b");
    this.def(
      `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${f(sd)}"/></filter>`,
    );
    return `filter="url(#${id})"`;
  }
  svg(): string {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.w} ${this.h}" width="${this.outW}" height="${this.outH}" stroke-linecap="round" stroke-linejoin="round">` +
      `<defs>${this.defs.join("")}</defs>${this.parts.join("")}</svg>`
    );
  }
}

/** Soft ellipse shorthand. */
function blob(a: Art, cx: number, cy: number, rx: number, ry: number, color: string, o: number, ex = ""): string {
  return E(cx, cy, rx, ry, a.soft(color), `${op(o)}${ex ? " " + ex : ""}`);
}

/** Random strands following guide curves (hair texture). */
function strands(a: Art, guides: Pt[][], color: string, per: number, spread: number, w: number, o: number): string {
  const ds = ["", ""];
  for (const g of guides) {
    for (let k = 0; k < per; k++) {
      const dx = (a.rnd() - 0.5) * spread;
      const dy = (a.rnd() - 0.5) * spread;
      const pts: Pt[] = g.map((p, i) => [
        p[0] + dx + (a.rnd() - 0.5) * spread * 0.3,
        p[1] + dy * (i === 0 ? 0.3 : 1) + (a.rnd() - 0.5) * spread * 0.3,
      ]);
      ds[a.rnd() < 0.5 ? 0 : 1] += spline(pts, false);
    }
  }
  return (ds[0] ? L(ds[0], color, w * 1.2, o) : "") + (ds[1] ? L(ds[1], color, w * 0.7, o * 0.65) : "");
}

/* ------------------------------------------------------------------ */
/* Portraits                                                           */
/* ------------------------------------------------------------------ */

interface Skin {
  base: string;
  shade: string;
  light: string;
  lip: string;
}

type HairStyle = "sidePart" | "bun" | "shortStyled" | "shoulder" | "whiteBack" | "bob";
type Outfit = "bandhgala" | "saree" | "blazer" | "kurta" | "suit" | "pashmina";
type Backdrop = "warmOffice" | "coolGrey" | "screenOffice" | "greenGrey" | "books" | "warmStudio";

interface PortraitSpec {
  skin: Skin;
  female: boolean;
  age: number;
  turn: number;
  hair: HairStyle;
  hairColor: string;
  hairLight: string;
  browColor: string;
  glasses?: "rimless" | "frame";
  frameColor?: string;
  beard?: boolean;
  bindi?: boolean;
  earrings?: "jhumka" | "stud" | "pearl";
  outfit: Outfit;
  bg: Backdrop;
  jaw: number;
  smile: number;
}

const PCX = 400;
const PEY = 412;
const PR = 122;

function portraitBackdrop(a: Art, kind: Backdrop): void {
  const W = 800;
  const H = 1000;
  const rnd = a.rnd;
  if (kind === "warmOffice") {
    a.add(R(0, 0, W, H, a.lin([[0, "#efe2cf"], [1, "#cdb391"]])));
    let g = "";
    g += R(30, 60, 250, 600, "#fff6e8", op(0.85));
    g += R(150, 60, 12, 600, "#cbb091", op(0.7)) + R(30, 350, 250, 12, "#cbb091", op(0.7));
    g += R(520, 560, 300, 16, "#7a5a3c", op(0.55));
    for (let x = 540; x < 800; x += a.r(18, 30)) {
      const h = a.r(70, 120);
      g += R(x, 560 - h, a.r(12, 22), h, a.pick(["#8c4a32", "#3f5a6b", "#c9a15c", "#6b7444", "#e8dccb"]), op(0.55));
    }
    g += E(690, 330, 90, 120, "#6a8452", op(0.55)) + E(740, 250, 60, 80, "#7d9a5e", op(0.5));
    g += C(610, 200, 46, "#ffe2b0", op(0.9));
    for (let i = 0; i < 14; i++) g += C(a.r(20, 780), a.r(40, 640), a.r(10, 34), "#fff4dc", op(a.r(0.25, 0.6)));
    a.add(G(g, a.blur(16)));
  } else if (kind === "coolGrey") {
    a.add(R(0, 0, W, H, a.lin([[0, "#d0d8e0"], [0.6, "#a7b4c2"], [1, "#7d8b9b"]])));
    a.add(blob(a, 380, 400, 420, 460, "#f4f7fa", 0.7));
    a.add(blob(a, 700, 120, 260, 260, "#ffffff", 0.35));
  } else if (kind === "screenOffice") {
    a.add(R(0, 0, W, H, a.lin([[0, "#2f3a46"], [1, "#1a222b"]])));
    let g = "";
    g += R(-20, 520, 840, 500, "#141b22", op(0.8));
    g += R(40, 240, 200, 130, "#5cc8ff", op(0.75)) + R(60, 260, 160, 90, "#a8e6ff", op(0.5));
    g += R(560, 280, 240, 150, "#7aa8ff", op(0.7)) + R(590, 300, 120, 30, "#d6e6ff", op(0.6));
    g += R(300, 120, 200, 40, "#ffe9c2", op(0.4));
    for (let i = 0; i < 8; i++) g += E(a.r(0, 800), a.r(40, 110), a.r(30, 60), 8, "#fff1d6", op(a.r(0.5, 0.9)));
    for (let i = 0; i < 16; i++) g += C(a.r(0, 800), a.r(150, 560), a.r(8, 26), a.pick(["#7fd8ff", "#ffd28a", "#b9c7ff"]), op(a.r(0.25, 0.6)));
    g += R(250, 420, 300, 10, "#5cc8ff", op(0.3));
    a.add(G(g, a.blur(14)));
    a.add(blob(a, 400, 420, 330, 380, "#5d7891", 0.45));
  } else if (kind === "greenGrey") {
    a.add(R(0, 0, W, H, a.lin([[0, "#d3dccf"], [1, "#8e9d8f"]])));
    let g = "";
    for (let i = 0; i < 12; i++) {
      const x = a.r(560, 840);
      const y = a.r(-40, 300);
      g += E(x, y, a.r(30, 70), a.r(12, 26), "#4d6450", `${op(a.r(0.15, 0.3))} transform="rotate(${f(a.r(-60, 60))} ${f(x)} ${f(y)})"`);
    }
    g += R(20, 120, 160, 520, "#f2f5ee", op(0.45));
    a.add(G(g, a.blur(18)));
    a.add(blob(a, 400, 420, 380, 420, "#eef2ea", 0.55));
  } else if (kind === "books") {
    a.add(R(0, 0, W, H, "#3c2f26"));
    let g = "";
    const cols = ["#8c3b2e", "#2f4a5c", "#6b7a3a", "#c9a35a", "#5a3d5c", "#d8cbb0", "#7a4a2a", "#3f6a6a"];
    const byCol = new Map<string, string>();
    let labels = "";
    for (const shelf of [190, 430, 670]) {
      g += R(0, shelf, W, 22, "#5a4332");
      let x = 0;
      while (x < W) {
        const bw = a.r(26, 48);
        const bh = a.r(130, 205);
        const col = a.pick(cols);
        byCol.set(col, (byCol.get(col) ?? "") + `M${f(x)} ${f(shelf)}v${f(-bh)}h${f(bw - 2)}v${f(bh)}z`);
        if (rnd() < 0.2) labels += `M${f(x + 3)} ${f(shelf - bh + 20)}h${f(bw - 8)}v6h${f(8 - bw)}z`;
        x += bw + (rnd() < 0.1 ? 30 : 0);
      }
    }
    byCol.forEach((d, col) => {
      g = P(d, col) + g;
    });
    g += P(labels, "#e9d9a8", op(0.5));
    a.add(G(g, a.blur(8)));
    a.add(R(0, 0, W, H, "#2a1f19", op(0.35)));
    a.add(blob(a, 640, 180, 260, 260, "#ffcf8a", 0.35));
    a.add(blob(a, 400, 430, 360, 420, "#6a5240", 0.5));
  } else {
    a.add(R(0, 0, W, H, a.rad([[0, "#f0c79c"], [0.45, "#c98256"], [1, "#6b3424"]], 0.42, 0.36, 0.75)));
    a.add(blob(a, 300, 260, 300, 300, "#ffe6c8", 0.45));
  }
  // ambient shadow behind the figure
  a.add(blob(a, PCX + 70, 640, 320, 420, "#1a1410", 0.22));
}

interface HairShapes {
  back: string;
  front: string;
  frontId: string;
}

function hairShapes(a: Art, sp: PortraitSpec, sh: number): HairShapes {
  const hx = PCX + sh * 0.3;
  const T2 = (pts: Pt[]): Pt[] => pts.map((p) => [hx + p[0], PEY + p[1], p[2]]);
  const base = sp.hairColor;
  const hl = sp.hairLight;
  const fillG = a.lin(
    [
      [0, lighten(base, 0.12)],
      [0.5, base],
      [1, darken(base, 0.25)],
    ],
    0.2,
    0,
    0.9,
    1,
  );
  const backFill = darken(base, 0.15);
  let backPts: Pt[] = [];
  let frontPts: Pt[] = [];
  let guides: Pt[][] = [];
  let extraBack = "";
  let extraFront = "";

  switch (sp.hair) {
    case "sidePart":
      backPts = [[-124, 10], [-132, -80], [-124, -170], [-80, -224], [0, -244], [80, -230], [128, -178], [134, -80], [124, 10]];
      frontPts = [
        [-121, -14, 1], [-128, -80], [-129, -150], [-108, -208], [-62, -240], [-46, -246, 1], [-10, -262], [50, -264], [104, -244], [136, -196], [140, -128], [132, -56],
        [123, -14, 1], [114, -64], [110, -112], [92, -144], [48, -160], [0, -164], [-40, -170, 1], [-62, -160], [-94, -140], [-110, -102], [-115, -54],
      ];
      guides = [
        [[-42, -236], [10, -252], [70, -240], [118, -200], [134, -130]],
        [[-42, -214], [10, -224], [66, -210], [110, -172], [126, -110]],
        [[-40, -190], [6, -194], [60, -184], [100, -156], [116, -110]],
        [[-40, -174], [10, -176], [60, -166], [98, -140]],
        [[-52, -226], [-92, -206], [-118, -160], [-124, -96]],
        [[-52, -190], [-88, -172], [-110, -130], [-118, -76]],
      ];
      break;
    case "bun":
      backPts = [[-124, 30], [-140, -60], [-134, -160], [-92, -220], [-20, -244], [56, -238], [112, -206], [138, -140], [136, -50], [124, 30]];
      extraBack =
        E(hx - 92, PEY + 168, 50, 40, darken(base, 0.05)) +
        L(`M${f(hx - 136)} ${f(PEY + 156)}Q${f(hx - 100)} ${f(PEY + 128)} ${f(hx - 56)} ${f(PEY + 150)}`, hl, 3, 0.55) +
        L(`M${f(hx - 140)} ${f(PEY + 176)}Q${f(hx - 100)} ${f(PEY + 148)} ${f(hx - 52)} ${f(PEY + 174)}`, hl, 2.5, 0.45) +
        L(`M${f(hx - 132)} ${f(PEY + 196)}Q${f(hx - 98)} ${f(PEY + 176)} ${f(hx - 58)} ${f(PEY + 198)}`, hl, 2, 0.35);
      frontPts = [
        [-120, 10, 1], [-132, -60], [-130, -146], [-98, -206], [-30, -236], [44, -234], [104, -206], [134, -146], [134, -60],
        [122, 10, 1], [114, -40], [110, -98], [88, -138], [44, -160], [8, -166, 1], [-34, -160], [-82, -144], [-108, -104], [-115, -42],
      ];
      guides = [
        [[6, -170], [-40, -200], [-100, -186], [-128, -120], [-132, -40]],
        [[6, -168], [-50, -176], [-100, -150], [-120, -80]],
        [[10, -170], [60, -198], [112, -170], [130, -100], [128, -20]],
        [[10, -168], [60, -170], [104, -138], [118, -60]],
        [[-10, -226], [-70, -214], [-118, -164]],
      ];
      break;
    case "shortStyled":
      backPts = [[-121, -40], [-125, -100], [-118, -185], [-70, -236], [10, -254], [86, -238], [122, -186], [126, -100], [121, -40]];
      frontPts = [
        [-119, -60, 1], [-124, -110], [-122, -164], [-100, -214], [-50, -248], [20, -264], [84, -252], [120, -212], [128, -156], [125, -104],
        [121, -60, 1], [112, -96], [104, -128], [70, -150], [24, -158], [-30, -156], [-78, -146], [-104, -120], [-113, -92],
      ];
      guides = [
        [[-80, -160], [-40, -226], [20, -256], [80, -246]],
        [[-40, -160], [0, -220], [60, -244], [110, -220]],
        [[0, -160], [40, -214], [100, -224], [126, -186]],
        [[-100, -150], [-90, -210], [-40, -244]],
      ];
      extraFront =
        blob(a, hx - 124, PEY - 100, 26, 64, sp.skin.base, 0.55) + blob(a, hx + 126, PEY - 100, 22, 64, sp.skin.base, 0.5);
      break;
    case "shoulder":
      backPts = [
        [-138, -100], [-142, -186], [-98, -236], [-20, -254], [60, -246], [124, -210], [150, -140], [154, -40], [160, 80], [172, 180], [196, 262],
        [170, 280], [100, 250], [-100, 250], [-170, 280], [-198, 262], [-174, 180], [-160, 80], [-150, -20],
      ];
      frontPts = [
        [-130, -120], [-118, -196], [-62, -240], [26, -254], [100, -230], [138, -170], [146, -90], [138, -34], [124, -2, 1], [114, -40], [112, -76], [100, -114], [70, -144], [36, -160, 1], [-6, -150], [-56, -128], [-92, -90], [-112, -30], [-116, 50],
        [-114, 130], [-128, 200], [-158, 252], [-196, 270, 1], [-190, 250], [-168, 180], [-156, 100], [-148, 0], [-138, -60],
      ];
      guides = [
        [[36, -166], [-20, -172], [-80, -140], [-116, -70], [-124, 40], [-134, 160], [-176, 250]],
        [[34, -184], [-30, -198], [-96, -162], [-132, -60], [-142, 80], [-160, 200], [-186, 258]],
        [[38, -172], [90, -170], [124, -110], [130, -40]],
        [[40, -204], [100, -202], [138, -120], [140, -40]],
        [[0, -238], [-60, -228], [-110, -180]],
      ];
      break;
    case "whiteBack":
      backPts = [[-128, 30], [-140, -60], [-134, -150], [-96, -210], [0, -232], [96, -210], [134, -150], [140, -60], [128, 30]];
      frontPts = [
        [-121, 0, 1], [-134, -60], [-134, -134], [-110, -190], [-60, -222], [0, -232], [60, -224], [110, -192], [136, -136], [138, -60],
        [123, 0, 1], [116, -50], [110, -100], [100, -150, 1], [76, -186], [36, -200], [0, -202], [-36, -200], [-76, -188], [-100, -152, 1], [-110, -104], [-116, -52],
      ];
      guides = [
        [[-70, -196], [-40, -216], [10, -228], [70, -220], [118, -186]],
        [[-30, -204], [20, -214], [80, -206], [124, -164]],
        [[-104, -160], [-124, -110], [-130, -40]],
        [[-90, -190], [-120, -150], [-132, -80]],
        [[104, -160], [126, -110], [132, -40]],
        [[90, -190], [124, -150], [134, -80]],
      ];
      break;
    case "bob":
      backPts = [[-150, 60], [-156, -60], [-140, -170], [-90, -230], [0, -252], [90, -236], [144, -176], [158, -60], [150, 60], [110, 90], [-110, 90]];
      frontPts = [
        [-148, 64, 1], [-158, -40], [-150, -150], [-104, -222], [-20, -254], [70, -246], [132, -200], [156, -110], [156, 0], [148, 64, 1],
        [126, 40], [118, -30], [112, -84], [90, -112], [50, -118], [10, -132], [-36, -150, 1], [-70, -138], [-100, -110], [-114, -50], [-120, 20],
      ];
      guides = [
        [[-36, -158], [20, -150], [70, -128], [110, -96], [124, -30]],
        [[-36, -190], [40, -186], [104, -150], [140, -70], [140, 30]],
        [[-40, -170], [-90, -160], [-124, -100], [-134, -10], [-136, 50]],
        [[-20, -232], [-90, -214], [-140, -140], [-150, -40]],
        [[0, -238], [70, -230], [130, -180]],
      ];
      break;
  }
  const back = P(spline(T2(backPts)), backFill) + extraBack;
  const frontId = a.shape(spline(T2(frontPts)));
  const tg = guides.map((g) => T2(g));
  let front = U(frontId, fillG);
  let tex = strands(a, tg, hl, 2, 12, 3, 0.6) + strands(a, tg, darken(base, 0.35), 1, 16, 2.5, 0.45);
  if (sp.hair === "whiteBack") {
    tex += blob(a, hx, PEY - 210, 70, 22, sp.skin.base, 0.35);
  }
  if (sp.hair === "bob") {
    tex += strands(a, [tg[0], tg[1]], "#d8d2cb", 2, 8, 4, 0.75);
  }
  if (sp.hair === "sidePart") {
    tex += blob(a, hx - 120, PEY - 80, 26, 70, lighten(hl, 0.2), 0.45) + blob(a, hx + 124, PEY - 76, 22, 66, lighten(hl, 0.2), 0.4);
  }
  // sheen on the lit side
  tex += blob(a, hx - 50, PEY - 190, 70, 34, lighten(hl, 0.25), 0.35);
  front += G(tex + extraFront, a.clipRef(frontId));
  return { back, front, frontId };
}

function portrait(a: Art, sp: PortraitSpec): void {
  const th = sp.turn;
  const sh = PR * Math.sin(th);
  const sk0 = sp.skin;
  const FX = (x: number): number => PCX + PR * Math.sin(Math.asin(clamp(x / PR, -1, 1)) + th);
  const Y = (y: number): number => PEY + (y > 0 ? y * 0.94 : y);
  const jawK = (y: number): number => (y > 30 ? 1 - (1 - sp.jaw) * clamp((y - 30) / 110, 0, 1) : 1);
  const O = (x: number, y: number): Pt => [PCX + x * jawK(y) + sh * clamp((y + 60) / 240, 0, 0.85), Y(y)];

  portraitBackdrop(a, sp.bg);

  const hair = hairShapes(a, sp, sh);
  a.add(hair.back);

  /* neck */
  const nx = PCX + sh * 0.4;
  const nw = sp.female ? 0 : 6;
  const neckBase = mix(sk0.base, sk0.shade, 0.22);
  const neckFill = a.lin(
    [
      [0, mix(sk0.shade, "#2a1810", 0.25)],
      [1, neckBase],
    ],
    0,
    Y(150),
    0,
    Y(270),
    true,
  );
  const neckD = `M${f(nx - 56 - nw)} ${f(Y(90))}C${f(nx - 54 - nw)} ${f(Y(200))} ${f(nx - 62 - nw)} ${f(Y(260))} ${f(nx - 74 - nw)} ${f(Y(330))}L${f(nx + 74 + nw)} ${f(Y(330))}C${f(nx + 62 + nw)} ${f(Y(260))} ${f(nx + 54 + nw)} ${f(Y(200))} ${f(nx + 56 + nw)} ${f(Y(90))}Z`;
  a.add(P(neckD, neckFill));
  a.add(
    G(
      R(nx + 10, Y(80), 70, 260, a.lin([[0, sk0.shade, 0], [1, sk0.shade, 0.7]], 0, 0, 1, 0)) +
        blob(a, nx - 30, Y(300), 30, 50, sk0.light, 0.25),
      a.clip(neckD),
    ),
  );

  /* torso & clothing */
  outfit(a, sp, neckFill);

  /* ears */
  const earY = Y(28);
  const nearDir = th >= 0 ? -1 : 1;
  const earNear = O(nearDir * (PR - 4), 28)[0];
  const earFar = O(-nearDir * (PR - 6), 28)[0];
  const earL = th >= 0 ? earNear : earFar;
  const earR = th >= 0 ? earFar : earNear;
  const ear = (x: number, rx: number, dir: number): string => {
    const d = `M${f(x)} ${f(earY - 42)}C${f(x - dir * rx * 1.6)} ${f(earY - 50)} ${f(x - dir * rx * 1.5)} ${f(earY + 10)} ${f(x - dir * rx * 0.9)} ${f(earY + 34)}C${f(x - dir * rx * 0.5)} ${f(earY + 50)} ${f(x + dir * 2)} ${f(earY + 46)} ${f(x + dir * 4)} ${f(earY + 36)}Z`;
    return (
      P(d, mix(sk0.base, sk0.shade, 0.25)) +
      L(`M${f(x - dir * rx * 0.3)} ${f(earY - 30)}C${f(x - dir * rx * 1.1)} ${f(earY - 32)} ${f(x - dir * rx * 1.1)} ${f(earY + 8)} ${f(x - dir * rx * 0.5)} ${f(earY + 24)}`, sk0.shade, 3, 0.7) +
      blob(a, x - dir * rx * 0.5, earY - 6, rx * 0.5, 16, darken(sk0.shade, 0.2), 0.45)
    );
  };
  a.add(ear(earL, th >= 0 ? 18 : 9, 1), ear(earR, th >= 0 ? 9 : 18, -1));

  /* face */
  const facePts: Pt[] = [
    [0, -182], [62, -174], [104, -132], [120, -64], [122, 0], [120, 46], [111, 94], [93, 138], [60, 170], [0, 188],
    [-60, 170], [-93, 138], [-111, 94], [-120, 46], [-122, 0], [-120, -64], [-104, -132], [-62, -174],
  ];
  const faceD = spline(facePts.map((p) => O(p[0], p[1])));
  const faceFill = a.rad(
    [
      [0, lighten(sk0.base, 0.06)],
      [0.6, sk0.base],
      [1, mix(sk0.base, sk0.shade, 0.5)],
    ],
    0.38,
    0.4,
    0.7,
  );
  const faceId = a.shape(faceD);
  a.add(U(faceId, faceFill));

  /* face shading (clipped) */
  let sh1 = "";
  sh1 += R(FX(0), Y(-200), PR + 40, 420, a.lin([[0, sk0.shade, 0], [0.55, sk0.shade, 0.35], [1, sk0.shade, 0.75]], FX(10), 0, PCX + PR + 6, 0, true));
  sh1 += U(faceId, "none", sk(sk0.shade, 26, 0.28));
  sh1 += blob(a, FX(-62), Y(40), 44, 30, sk0.light, 0.55);
  sh1 += blob(a, FX(-10), Y(-110), 80, 40, sk0.light, 0.45);
  sh1 += blob(a, FX(0), Y(168), 30, 14, sk0.light, 0.35);
  sh1 += blob(a, FX(62), Y(80), 40, 46, sk0.shade, 0.35);
  sh1 += blob(a, FX(-88), Y(84), 26, 44, sk0.shade, 0.3) + blob(a, FX(90), Y(84), 28, 46, darken(sk0.shade, 0.1), 0.45);
  sh1 += blob(a, FX(-104), Y(-60), 22, 50, sk0.shade, 0.35) + blob(a, FX(104), Y(-60), 24, 50, sk0.shade, 0.45);
  sh1 += blob(a, FX(-40), Y(140), 30, 24, sk0.light, 0.25);
  for (const ex of [-50, 50]) sh1 += blob(a, FX(ex), Y(-8), 40, 24, darken(sk0.shade, 0.1), 0.42);
  if (sp.female) for (const ex of [-62, 66]) sh1 += blob(a, FX(ex), Y(52), 34, 22, "#d0605a", 0.16);
  sh1 += blob(a, FX(0) + 2, Y(178), 70, 22, sk0.shade, 0.35);
  // hairline shadow
  sh1 += U(hair.frontId, darken(sk0.shade, 0.2), `${op(0.35)} transform="translate(4 10)"`);
  a.add(G(sh1, a.clipRef(faceId)));

  /* brows */
  const brow = (inner: number, outer: number, dir: number): string => {
    const y0 = sp.female ? -50 : -44;
    const arch = sp.female ? 10 : 6;
    const ti = sp.female ? 9 : 11;
    const pk = inner + (outer - inner) * 0.62;
    const pts: Pt[] = [
      [FX(inner), Y(y0 + 3), 1],
      [FX(inner + (pk - inner) * 0.4), Y(y0 - arch * 0.6 - ti * 0.55)],
      [FX(pk), Y(y0 - arch - ti * 0.45)],
      [FX(outer), Y(y0 + 3), 1],
      [FX(pk), Y(y0 - arch + ti * 0.25)],
      [FX(inner + (pk - inner) * 0.4), Y(y0 - arch * 0.5 + ti * 0.35)],
      [FX(inner + dir * 1), Y(y0 + ti * 0.5), 1],
    ];
    return P(spline(pts), a.lin([[0, sp.browColor, 0.75], [1, sp.browColor]], dir > 0 ? 1 : 0, 0, dir > 0 ? 0 : 1, 0));
  };
  a.add(brow(-20, -84, -1), brow(20, 84, 1));

  /* eyes */
  const eye = (cxL: number, inward: number): string => {
    const x = FX(cxL);
    const scaleW = Math.abs(FX(cxL + 1) - FX(cxL));
    const w = (sp.female ? 52 : 50) * scaleW;
    const h = sp.age > 55 ? 12 : sp.female ? 14 : 13;
    const y = Y(0);
    const hw = w / 2;
    const ix = x + inward * hw;
    const ox = x - inward * hw;
    const iy = y + h * 0.12;
    const oy = y + h * 0.12;
    const topD = `M${f(ix)} ${f(iy)}C${f(x + inward * hw * 0.5)} ${f(y - h * 1.25)} ${f(x - inward * hw * 0.45)} ${f(y - h * 1.3)} ${f(ox)} ${f(oy)}`;
    const almond = `${topD}C${f(x - inward * hw * 0.45)} ${f(y + h * 0.95)} ${f(x + inward * hw * 0.45)} ${f(y + h * 0.95)} ${f(ix)} ${f(iy)}Z`;
    const ir = h * 0.95;
    const gx = x - sh * 0.07;
    const gy = y + h * 0.08;
    let s = "";
    const almondId = a.shape(almond);
    s += U(almondId, a.lin([[0, "#a89283"], [0.5, "#e9dfd5"], [1, "#ddd0c4"]]));
    let inner = C(gx, gy, ir, a.rad([[0, "#6b4428"], [0.7, "#3a2314"], [1, "#1a0e07"]]));
    inner += C(gx, gy, ir * 0.42, "#0b0605");
    inner += C(gx - ir * 0.38, gy - ir * 0.4, ir * 0.24, "#ffffff", op(0.9));
    inner += C(gx + ir * 0.35, gy + ir * 0.3, ir * 0.1, "#ffffff", op(0.5));
    inner += R(x - hw, y - h * 1.6, w, h * 1.0, a.lin([[0, "#2a160c", 0.55], [1, "#2a160c", 0]]));
    s += G(inner, a.clipRef(almondId));
    // crease and lids
    s += L(`M${f(ix - inward * 2)} ${f(iy - h * 0.9)}C${f(x + inward * hw * 0.4)} ${f(y - h * 1.95)} ${f(x - inward * hw * 0.5)} ${f(y - h * 1.95)} ${f(ox + inward * 1)} ${f(oy - h * 0.7)}`, darken(sk0.shade, 0.2), 2.4, 0.6);
    s += L(topD, "#1c100a", sp.female ? 3.6 : 3);
    if (sp.female) s += L(`M${f(ox + inward * 2)} ${f(oy)}L${f(ox - inward * 7)} ${f(oy - 5)}`, "#1c100a", 2.6);
    s += L(`M${f(ox)} ${f(oy + 1)}C${f(x - inward * hw * 0.45)} ${f(y + h * 1.05)} ${f(x + inward * hw * 0.45)} ${f(y + h * 1.05)} ${f(ix)} ${f(iy)}`, darken(sk0.shade, 0.3), 1.4, 0.45);
    if (sp.age > 45) {
      s += L(`M${f(x - inward * hw * 0.5)} ${f(y + h * 2)}Q${f(x)} ${f(y + h * 2.6)} ${f(x + inward * hw * 0.6)} ${f(y + h * 1.8)}`, sk0.shade, 1.6, 0.35);
      s += L(`M${f(ox - inward * 6)} ${f(oy + 2)}l${f(-inward * 10)} ${f(-4)}M${f(ox - inward * 6)} ${f(oy + 7)}l${f(-inward * 10)} ${f(4)}`, sk0.shade, 1.4, 0.35);
    }
    return s;
  };
  a.add(eye(-50, 1), eye(50, -1));

  /* nose */
  const tipX = FX(0) + sh * 0.3;
  let n = "";
  n += blob(a, FX(19), Y(24), 11, 46, sk0.shade, 0.5);
  n += blob(a, FX(15), Y(-14), 12, 16, darken(sk0.shade, 0.15), 0.45);
  n += blob(a, FX(-15), Y(-12), 10, 14, sk0.shade, 0.3);
  n += blob(a, FX(-2), Y(26), 6, 40, sk0.light, 0.6);
  n += blob(a, tipX - 1, Y(68), 15, 12, sk0.light, 0.6);
  n += blob(a, tipX + 4, Y(78), 30, 12, darken(sk0.shade, 0.1), 0.45);
  n += blob(a, tipX + 3, Y(94), 26, 7, darken(sk0.shade, 0.25), 0.5);
  n += P(`M${f(tipX - 20)} ${f(Y(70))}C${f(tipX - 30)} ${f(Y(78))} ${f(tipX - 26)} ${f(Y(90))} ${f(tipX - 14)} ${f(Y(89))}C${f(tipX - 22)} ${f(Y(86))} ${f(tipX - 24)} ${f(Y(78))} ${f(tipX - 20)} ${f(Y(70))}Z`, darken(sk0.shade, 0.15), op(0.75));
  n += P(`M${f(tipX + 20)} ${f(Y(70))}C${f(tipX + 30)} ${f(Y(78))} ${f(tipX + 26)} ${f(Y(90))} ${f(tipX + 14)} ${f(Y(89))}C${f(tipX + 22)} ${f(Y(86))} ${f(tipX + 24)} ${f(Y(78))} ${f(tipX + 20)} ${f(Y(70))}Z`, darken(sk0.shade, 0.25), op(0.85));
  n += E(tipX - 9, Y(87), 6.5, 2.8, "#2b1710", `${op(0.7)} transform="rotate(-12 ${f(tipX - 9)} ${f(Y(87))})"`);
  n += E(tipX + 9, Y(87), 6.5, 2.8, "#2b1710", `${op(0.75)} transform="rotate(12 ${f(tipX + 9)} ${f(Y(87))})"`);
  n += blob(a, FX(1), Y(104), 9, 9, sk0.shade, 0.3);
  a.add(n);

  /* mouth */
  const my = Y(124);
  const mw = sp.female ? 31 : 33;
  const lx = FX(-mw);
  const rx = FX(mw);
  const cy0 = my - sp.smile * 3;
  const ul = sp.female ? 10 : 8;
  const ll = sp.female ? 14 : 11;
  const lipCol = sp.female ? sk0.lip : mix(sk0.lip, sk0.shade, 0.45);
  const lineD = `M${f(lx)} ${f(cy0)}C${f(FX(-12))} ${f(my + 3 + sp.smile)} ${f(FX(12))} ${f(my + 3 + sp.smile)} ${f(rx)} ${f(cy0)}`;
  let m = "";
  m += P(
    `M${f(lx)} ${f(cy0)}C${f(FX(-20))} ${f(my - ul * 0.6)} ${f(FX(-14))} ${f(my - ul * 1.15)} ${f(FX(-7))} ${f(my - ul * 1.1)}Q${f(FX(0))} ${f(my - ul * 0.6)} ${f(FX(7))} ${f(my - ul * 1.1)}C${f(FX(14))} ${f(my - ul * 1.15)} ${f(FX(20))} ${f(my - ul * 0.6)} ${f(rx)} ${f(cy0)}C${f(FX(12))} ${f(my + 3 + sp.smile)} ${f(FX(-12))} ${f(my + 3 + sp.smile)} ${f(lx)} ${f(cy0)}Z`,
    darken(lipCol, 0.18),
  );
  m += P(
    `${lineD}C${f(FX(22))} ${f(my + ll * 1.25)} ${f(FX(-22))} ${f(my + ll * 1.25)} ${f(lx)} ${f(cy0)}Z`,
    a.lin([[0, darken(lipCol, 0.1)], [1, lighten(lipCol, 0.08)]]),
  );
  m += blob(a, FX(-3), my + ll * 0.55, 11, 3.5, "#ffffff", sp.female ? 0.45 : 0.25);
  m += L(lineD, "#3a1a14", 2.2, 0.85);
  m += blob(a, FX(0), my + ll + 10, 18, 6, darken(sk0.shade, 0.1), 0.4);
  if (sp.smile > 0.5) {
    m += L(`M${f(lx - 3)} ${f(cy0 - 3)}q-3 4 0 8`, sk0.shade, 1.8, 0.5) + L(`M${f(rx + 3)} ${f(cy0 - 3)}q3 4 0 8`, sk0.shade, 1.8, 0.5);
  }
  if (sp.age > 45) {
    m += L(`M${f(FX(-30))} ${f(Y(76))}C${f(FX(-42))} ${f(Y(94))} ${f(FX(-46))} ${f(Y(112))} ${f(FX(-42))} ${f(Y(130))}`, sk0.shade, 2.4, 0.25);
    m += L(`M${f(FX(32))} ${f(Y(76))}C${f(FX(44))} ${f(Y(94))} ${f(FX(48))} ${f(Y(112))} ${f(FX(44))} ${f(Y(130))}`, darken(sk0.shade, 0.1), 2.4, 0.32);
  }
  if (sp.age > 58) {
    m += L(`M${f(FX(-40))} ${f(Y(-110))}Q${f(FX(0))} ${f(Y(-118))} ${f(FX(40))} ${f(Y(-110))}`, sk0.shade, 1.8, 0.3);
    m += L(`M${f(FX(-34))} ${f(Y(-94))}Q${f(FX(0))} ${f(Y(-101))} ${f(FX(34))} ${f(Y(-94))}`, sk0.shade, 1.6, 0.25);
  }
  a.add(m);

  /* beard */
  if (sp.beard) {
    const outer: Pt[] = [
      [-119, -40], [-121, 20], [-116, 72], [-104, 118], [-80, 158], [-46, 188], [0, 200], [46, 188], [80, 158], [104, 118], [116, 72], [121, 20], [119, -40, 1],
    ].map((p) => O(p[0], p[1]));
    const innerPts: Pt[] = [
      [FX(108), Y(-36), 1], [FX(104), Y(30)], [FX(88), Y(76)], [FX(56), Y(102)], [FX(40), Y(130)], [FX(24), Y(152)], [FX(0), Y(156)],
      [FX(-24), Y(152)], [FX(-40), Y(130)], [FX(-56), Y(102)], [FX(-88), Y(76)], [FX(-104), Y(30)], [FX(-108), Y(-36), 1],
    ];
    const bd = spline([...outer, ...innerPts]);
    const bcol = sp.hairColor;
    let b = P(bd, a.lin([[0, bcol, 0.25], [0.45, bcol, 0.8], [1, bcol, 0.95]], 0, Y(-20), 0, Y(130), true));
    const must = `M${f(FX(-38))} ${f(Y(126))}C${f(FX(-30))} ${f(Y(106))} ${f(FX(-12))} ${f(Y(100))} ${f(FX(0))} ${f(Y(105))}C${f(FX(12))} ${f(Y(100))} ${f(FX(30))} ${f(Y(106))} ${f(FX(38))} ${f(Y(126))}C${f(FX(22))} ${f(Y(114))} ${f(FX(-22))} ${f(Y(114))} ${f(FX(-38))} ${f(Y(126))}Z`;
    b += P(must, bcol, op(0.85));
    const td = ["", ""];
    for (let i = 0; i < 60; i++) {
      const t = a.rnd();
      const x = FX(-120 + 240 * t);
      const y = Y(a.r(-20, 200));
      td[i % 2] += `M${f(x)} ${f(y)}l${f(a.r(-1.5, 1.5))} ${f(a.r(4, 8))}`;
    }
    const tex = L(td[0], sp.hairLight, 1.6, 0.5) + L(td[1], darken(bcol, 0.3), 1.6, 0.5);
    b += G(tex + blob(a, FX(-60), Y(150), 50, 40, sp.hairLight, 0.3), a.clip(bd));
    a.add(b);
  }

  /* front hair */
  a.add(hair.front);

  /* glasses */
  if (sp.glasses) {
    const fc = sp.frameColor ?? "#2a2320";
    const rim = sp.glasses === "frame";
    let gl = "";
    const lens = (cxL: number, inward: number): string => {
      const x = FX(cxL);
      const scaleW = Math.abs(FX(cxL + 1) - FX(cxL));
      const w = 72 * scaleW;
      const h = 50;
      const d = `M${f(x - w / 2)} ${f(Y(-22))}Q${f(x - w / 2)} ${f(Y(-28))} ${f(x - w / 2 + 8)} ${f(Y(-28))}L${f(x + w / 2 - 8)} ${f(Y(-28))}Q${f(x + w / 2)} ${f(Y(-28))} ${f(x + w / 2)} ${f(Y(-20))}L${f(x + w / 2 - 3)} ${f(Y(h - 34))}Q${f(x + w / 2 - 5)} ${f(Y(h - 24))} ${f(x + w / 2 - 15)} ${f(Y(h - 24))}L${f(x - w / 2 + 15)} ${f(Y(h - 24))}Q${f(x - w / 2 + 5)} ${f(Y(h - 24))} ${f(x - w / 2 + 3)} ${f(Y(h - 34))}Z`;
      let s = P(d, "#dfeaf2", op(0.12));
      s += G(P(`M${f(x - w / 2)} ${f(Y(10))}L${f(x - w / 2 + 26)} ${f(Y(-30))}L${f(x - w / 2 + 40)} ${f(Y(-30))}L${f(x - w / 2 + 6)} ${f(Y(26))}Z`, "#ffffff", op(0.22)), a.clip(d));
      s += L(d, fc, rim ? 4.5 : 1.4, rim ? 1 : 0.55);
      if (rim) s += L(`M${f(x - w / 2 + 6)} ${f(Y(-27))}L${f(x + w / 2 - 6)} ${f(Y(-27))}`, lighten(fc, 0.35), 1.5, 0.6);
      void inward;
      return s;
    };
    gl += lens(-50, 1) + lens(50, -1);
    const lIn = FX(-50) + (72 * Math.abs(FX(-49) - FX(-50))) / 2;
    const rIn = FX(50) - (72 * Math.abs(FX(51) - FX(50))) / 2;
    gl += L(`M${f(lIn)} ${f(Y(-16))}Q${f((lIn + rIn) / 2)} ${f(Y(-26))} ${f(rIn)} ${f(Y(-16))}`, fc, rim ? 4 : 2.2, rim ? 1 : 0.8);
    const lOut = FX(-50) - (72 * Math.abs(FX(-49) - FX(-50))) / 2;
    const rOut = FX(50) + (72 * Math.abs(FX(51) - FX(50))) / 2;
    gl += th >= 0
      ? L(`M${f(lOut)} ${f(Y(-20))}L${f(earL - 4)} ${f(Y(-2))}`, fc, rim ? 4 : 2, rim ? 1 : 0.7)
      : L(`M${f(rOut)} ${f(Y(-20))}L${f(earR + 4)} ${f(Y(-2))}`, fc, rim ? 4 : 2, rim ? 1 : 0.7);
    a.add(gl);
  }

  /* earrings & bindi */
  if (sp.earrings) {
    const gold = "#d9a93f";
    const er = (x: number, scale: number): string => {
      const y = earY + 44;
      if (sp.earrings === "jhumka") {
        return (
          C(x, y, 4 * scale, gold) +
          L(`M${f(x)} ${f(y + 3)}L${f(x)} ${f(y + 10)}`, gold, 1.5) +
          P(`M${f(x - 10 * scale)} ${f(y + 24)}Q${f(x)} ${f(y + 4)} ${f(x + 10 * scale)} ${f(y + 24)}Z`, a.lin([[0, "#f3d27a"], [1, "#a8741f"]])) +
          C(x - 6 * scale, y + 27, 1.8, gold) + C(x, y + 28, 1.8, gold) + C(x + 6 * scale, y + 27, 1.8, gold)
        );
      }
      if (sp.earrings === "pearl") return C(x, y, 5.5 * scale, a.rad([[0, "#ffffff"], [1, "#cfc6bb"]], 0.35, 0.35, 0.7));
      return C(x, y, 4.5 * scale, a.rad([[0, "#fff1c4"], [1, "#b8862c"]], 0.35, 0.35, 0.7));
    };
    a.add(th >= 0 ? er(earL - 8, 1) + er(earR + 1, 0.7) : er(earL - 1, 0.7) + er(earR + 8, 1));
  }
  if (sp.bindi) a.add(C(FX(0), Y(-62), 5, "#a3122a") + C(FX(0) - 1.5, Y(-63.5), 1.4, "#ff8a8a", op(0.6)));

  // gentle vignette / grade
  a.add(R(0, 0, 800, 1000, a.rad([[0, "#000000", 0], [0.7, "#000000", 0], [1, "#000000", 0.28]], 0.5, 0.45, 0.75)));
}

function outfit(a: Art, sp: PortraitSpec, skinFill: string): void {
  const cx = PCX + (PR * Math.sin(sp.turn)) * 0.3;
  const s = sp.female ? 0.9 : 1;
  const top = 672;
  const Lx = (dx: number): number => cx - dx * s;
  const Rx = (dx: number): number => cx + dx * s;
  const torsoD = `M${f(Lx(60))} ${top}C${f(Lx(84))} ${top + 38} ${f(Lx(170))} ${top + 46} ${f(Lx(248))} ${top + 72}C${f(Lx(314))} ${top + 94} ${f(Lx(344))} ${top + 170} ${f(Lx(352))} 1010L${f(Rx(352))} 1010C${f(Rx(344))} ${top + 170} ${f(Rx(314))} ${top + 94} ${f(Rx(248))} ${top + 72}C${f(Rx(170))} ${top + 46} ${f(Rx(84))} ${top + 38} ${f(Rx(60))} ${top}Z`;
  const cloth = (c: string): string =>
    a.lin(
      [
        [0, lighten(c, 0.12)],
        [0.45, c],
        [1, darken(c, 0.35)],
      ],
      0,
      0,
      1,
      0.2,
    );
  const folds = (c: string, o = 0.35): string =>
    L(`M${f(Lx(250))} 900C${f(Lx(220))} 860 ${f(Lx(200))} 840 ${f(Lx(170))} 830`, darken(c, 0.4), 5, o) +
    L(`M${f(Lx(270))} 960C${f(Lx(240))} 930 ${f(Lx(220))} 910 ${f(Lx(190))} 905`, darken(c, 0.4), 4, o * 0.8) +
    L(`M${f(Rx(250))} 905C${f(Rx(220))} 865 ${f(Rx(200))} 845 ${f(Rx(170))} 836`, darken(c, 0.45), 5, o) +
    L(`M${f(Lx(80))} ${top + 34}C${f(Lx(160))} ${top + 46} ${f(Lx(220))} ${top + 58} ${f(Lx(262))} ${top + 80}`, lighten(c, 0.35), 6, 0.3);
  const shadowUnderHead = blob(a, cx + 10, top + 20, 150, 60, "#000000", 0.35);

  switch (sp.outfit) {
    case "bandhgala": {
      const navy = "#1e2a46";
      a.add(P(torsoD, cloth(navy)), folds(navy), shadowUnderHead);
      const kurtaCol = "#f1ede4";
      a.add(
        P(`M${f(cx - 60)} 616C${f(cx - 58)} 652 ${f(cx - 30)} 678 ${f(cx - 2)} 686L${f(cx - 2)} 698C${f(cx - 32)} 690 ${f(cx - 60)} 664 ${f(cx - 64)} 630Z`, kurtaCol),
        P(`M${f(cx + 60)} 616C${f(cx + 58)} 652 ${f(cx + 30)} 678 ${f(cx + 2)} 686L${f(cx + 2)} 698C${f(cx + 32)} 690 ${f(cx + 60)} 664 ${f(cx + 64)} 630Z`, darken(kurtaCol, 0.15)),
      );
      const collar = (dir: number, col: string): string =>
        P(
          `M${f(cx + dir * 63)} 628C${f(cx + dir * 60)} 662 ${f(cx + dir * 32)} 688 ${f(cx + dir * 3)} 696L${f(cx + dir * 4)} 732C${f(cx + dir * 42)} 724 ${f(cx + dir * 72)} 704 ${f(cx + dir * 80)} 668Z`,
          col,
        ) + L(`M${f(cx + dir * 63)} 630C${f(cx + dir * 60)} 662 ${f(cx + dir * 32)} 688 ${f(cx + dir * 3)} 697`, lighten(col, 0.3), 2, 0.7);
      a.add(collar(-1, "#2a3a60"), collar(1, "#16203a"));
      a.add(L(`M${f(cx + 2)} 732L${f(cx + 6)} 1010`, "#0e1528", 3, 0.8), L(`M${f(cx - 3)} 734L${f(cx)} 1010`, "#3a4c78", 1.5, 0.6));
      for (const by of [770, 845, 920, 995]) {
        const bx = cx + 1 + (by - 730) * 0.014;
        a.add(C(bx, by, 7, a.rad([[0, "#f6dc8c"], [1, "#8a6420"]], 0.35, 0.35, 0.7)), C(bx - 2, by - 2, 2, "#fff6d0", op(0.8)));
      }
      a.add(
        P(`M${f(cx + 120)} 868L${f(cx + 136)} 846L${f(cx + 150)} 862L${f(cx + 166)} 844L${f(cx + 180)} 864Z`, "#e08a2e"),
        L(`M${f(cx + 108)} 870L${f(cx + 196)} 862`, "#0e1528", 5),
        L(`M${f(cx + 108)} 874L${f(cx + 196)} 866`, "#3a4c78", 1.5, 0.7),
      );
      break;
    }
    case "saree": {
      const teal = "#0f6f6c";
      a.add(P(torsoD, cloth(teal)), folds(teal, 0.25));
      // chest skin
      a.add(
        P(`M${f(cx - 56)} ${top - 4}C${f(cx - 80)} 700 ${f(cx - 96)} 744 ${f(cx - 62)} 782C${f(cx - 32)} 806 ${f(cx + 32)} 806 ${f(cx + 62)} 782C${f(cx + 96)} 744 ${f(cx + 80)} 700 ${f(cx + 56)} ${top - 4}Z`, skinFill),
      );
      a.add(L(`M${f(cx - 70)} 712Q${f(cx - 40)} 724 ${f(cx - 12)} 716`, sp.skin.shade, 2.5, 0.4), L(`M${f(cx + 70)} 712Q${f(cx + 40)} 724 ${f(cx + 12)} 716`, sp.skin.shade, 2.5, 0.4));
      a.add(blob(a, cx, 730, 16, 12, sp.skin.shade, 0.4));
      a.add(L(`M${f(cx - 80)} 690C${f(cx - 96)} 744 ${f(cx - 66)} 784 ${f(cx - 32)} 798`, "#d9a93f", 5));
      a.add(L(`M${f(cx - 60)} 708Q${f(cx - 30)} 742 ${f(cx)} 744Q${f(cx + 30)} 742 ${f(cx + 60)} 708`, "#e2b955", 1.6, 0.9));
      // pallu
      const pallu = `M${f(cx + 46)} 676C${f(cx + 120)} 690 ${f(cx + 190)} 708 ${f(Rx(250))} 744C${f(Rx(316))} 768 ${f(Rx(346))} 860 ${f(Rx(354))} 1010L${f(cx - 210)} 1010C${f(cx - 130)} 900 ${f(cx - 30)} 790 ${f(cx + 46)} 676Z`;
      const pf = a.lin([[0, "#1a8a84"], [0.5, "#0d6461"], [1, "#0a4a48"]], 0, 0, 1, 1);
      a.add(blob(a, cx - 60, 900, 120, 120, "#000000", 0.25));
      a.add(P(pallu, pf));
      let pl = "";
      for (let i = 1; i < 6; i++) {
        const k = i * 34;
        pl += L(`M${f(cx + 60 + k * 0.7)} ${f(690 + k * 0.2)}C${f(cx - 20 + k)} ${f(800)} ${f(cx - 110 + k)} ${f(910)} ${f(cx - 190 + k)} 1010`, i % 2 ? "#33b0a8" : "#063e3c", 3, 0.35);
      }
      a.add(G(pl, a.clip(pallu)));
      const border = `M${f(cx + 46)} 676C${f(cx - 30)} 790 ${f(cx - 130)} 900 ${f(cx - 210)} 1010L${f(cx - 168)} 1010C${f(cx - 96)} 906 ${f(cx - 4)} 800 ${f(cx + 74)} 684Z`;
      a.add(P(border, a.lin([[0, "#f1cf6e"], [0.5, "#c8952c"], [1, "#f0cc6a"]], 0, 0, 1, 0)));
      // contrast maroon band beside the zari border, with gold buta dots
      const band = `M${f(cx + 74)} 684C${f(cx - 4)} 800 ${f(cx - 96)} 906 ${f(cx - 168)} 1010L${f(cx - 146)} 1010C${f(cx - 76)} 908 ${f(cx + 16)} 804 ${f(cx + 92)} 690Z`;
      a.add(P(band, "#6e1626"));
      let mot = "";
      let zig = "";
      for (let t = 0.04; t < 1; t += 0.045) {
        const bx = cx + 76 - 248 * t + 20 * t * t;
        const by = 690 + 322 * t;
        mot += `M${f(bx - 2.5)} ${f(by)}a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0`;
        const gx = cx + 58 - 248 * t + 20 * t * t;
        zig += `${t < 0.05 ? "M" : "L"}${f(gx + (Math.round(t / 0.045) % 2 ? 6 : -6))} ${f(682 + 326 * t)}`;
      }
      a.add(P(mot, "#f1cf6e"), L(zig, "#8a5a14", 2, 0.7), L(`M${f(cx + 46)} 676C${f(cx - 30)} 790 ${f(cx - 130)} 900 ${f(cx - 210)} 1010`, "#8a5a14", 2, 0.6));
      a.add(L(`M${f(Lx(345))} 930Q${f(Lx(300))} 950 ${f(Lx(268))} 942`, "#d9a93f", 10, 0.9));
      a.add(blob(a, cx + 60, 690, 60, 20, "#000000", 0.3));
      break;
    }
    case "blazer":
    case "suit": {
      const suit = sp.outfit === "suit";
      const jacket = suit ? "#1d2230" : "#3b3e45";
      const shirt = suit ? "#f3f3f0" : "#b8d1ea";
      a.add(P(torsoD, cloth(jacket)), folds(jacket, 0.3), shadowUnderHead);
      const open = suit ? 64 : 100;
      const bottomOpen = suit ? 22 : 30;
      a.add(P(`M${f(cx - 60)} ${top}L${f(cx - open)} 700L${f(cx - bottomOpen)} 1010L${f(cx + bottomOpen)} 1010L${f(cx + open)} 700L${f(cx + 60)} ${top}Z`, a.lin([[0, lighten(shirt, 0.2)], [1, darken(shirt, 0.12)]], 0, 0, 1, 0)));
      if (!suit) {
        a.add(P(`M${f(cx - 54)} ${top - 2}C${f(cx - 48)} 700 ${f(cx - 22)} 752 ${f(cx)} 778C${f(cx + 22)} 752 ${f(cx + 48)} 700 ${f(cx + 54)} ${top - 2}Z`, skinFill));
        a.add(blob(a, cx, 700, 40, 26, sp.skin.shade, 0.35));
      } else {
        const tie = "#7d1f2c";
        a.add(blob(a, cx, 700, 70, 30, "#000000", 0.25));
        const blade = `M${f(cx - 11)} 734L${f(cx + 11)} 734L${f(cx + 32)} 1010L${f(cx - 32)} 1010Z`;
        a.add(P(blade, a.lin([[0, lighten(tie, 0.1)], [1, darken(tie, 0.3)]], 0, 0, 1, 0)));
        let st = "";
        for (let y = 720; y < 1040; y += 26) st += L(`M${f(cx - 40)} ${y}L${f(cx + 40)} ${y + 34}`, "#c9a55a", 3, 0.45);
        a.add(G(st, a.clip(blade)));
        a.add(P(`M${f(cx - 17)} 698L${f(cx + 17)} 698L${f(cx + 11)} 736L${f(cx - 11)} 736Z`, darken(tie, 0.08)));
        a.add(L(`M${f(cx - 3)} 742L${f(cx - 1)} 790`, "#3a0c14", 2, 0.5));
      }
      // lapels
      const lapel = (dir: number, col: string): string => {
        const pts = suit
          ? [[64, 630], [64, 694], [22, 1010], [58, 1010], [150, 840], [118, 822], [132, 800], [104, 700], [80, 640]]
          : [[64, 630], [98, 696], [30, 1010], [64, 1010], [160, 830], [122, 808], [140, 786], [116, 700], [84, 640]];
        const d = polyD(pts.map((p) => [cx + dir * p[0], p[1]]));
        return G(P(d, "#000000"), `${op(0.3)} transform="translate(${dir * 6} 6)"`) + P(d, col) + L(polyD(pts.slice(3, 8).map((p) => [cx + dir * p[0], p[1]])), lighten(col, 0.25), 2, 0.5);
      };
      a.add(lapel(-1, lighten(jacket, 0.06)), lapel(1, darken(jacket, 0.15)));
      // shirt collars
      const collar = (dir: number, col: string): string => {
        const pts = suit
          ? [[62, 622], [16, 700], [34, 764], [84, 700]]
          : [[62, 622], [6, 774], [60, 800], [102, 700]];
        return P(polyD(pts.map((p) => [cx + dir * p[0], p[1]])), col) + L(polyD(pts.map((p) => [cx + dir * p[0], p[1]])), darken(col, 0.25), 1.5, 0.6);
      };
      a.add(collar(-1, lighten(shirt, 0.1)), collar(1, darken(shirt, 0.1)));
      a.add(
        L(`M${f(cx + 150)} 868L${f(cx + 232)} 860`, darken(jacket, 0.5), 5),
        P(`M${f(cx + 158)} 866L${f(cx + 172)} 846L${f(cx + 186)} 862L${f(cx + 200)} 848L${f(cx + 214)} 864Z`, suit ? "#f6f2ea" : "#d9e3ee"),
      );
      if (suit) a.add(C(cx - 30, 990, 7, darken(jacket, 0.4)));
      break;
    }
    case "kurta": {
      const maroon = "#7c1d2c";
      a.add(P(torsoD, cloth(maroon)), folds(maroon, 0.3));
      a.add(P(`M${f(cx - 58)} ${top - 4}C${f(cx - 54)} 700 ${f(cx - 26)} 716 ${f(cx)} 718C${f(cx + 26)} 716 ${f(cx + 54)} 700 ${f(cx + 58)} ${top - 4}Z`, skinFill));
      a.add(P(`M${f(cx - 9)} 716L${f(cx)} 786L${f(cx + 9)} 716Z`, skinFill));
      a.add(L(`M${f(cx - 62)} ${top}C${f(cx - 56)} 704 ${f(cx - 28)} 722 ${f(cx - 11)} 722L${f(cx)} 792L${f(cx + 11)} 722C${f(cx + 28)} 722 ${f(cx + 56)} 704 ${f(cx + 62)} ${top}`, "#e0b154", 4));
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        a.add(C(cx - 70 + 140 * t, 736 + Math.sin(t * Math.PI) * 22, 2.2, "#e8c26a", op(0.8)));
      }
      const dup = `M${f(cx - 66)} 676C${f(cx - 120)} 690 ${f(Lx(200))} 710 ${f(Lx(250))} 742C${f(Lx(316))} 770 ${f(Lx(340))} 860 ${f(Lx(352))} 1010L${f(cx - 150)} 1010C${f(cx - 130)} 920 ${f(cx - 112)} 820 ${f(cx - 66)} 676Z`;
      a.add(blob(a, cx - 130, 860, 80, 160, "#000000", 0.3));
      a.add(P(dup, a.lin([[0, "#e6b75a"], [0.6, "#c99232"], [1, "#9a6a1e"]], 0, 0, 1, 0.3)));
      let dots = "";
      for (let i = 0; i < 40; i++) dots += C(cx - a.r(150, 330), a.r(720, 1000), 2.4, "#7c1d2c", op(0.55));
      for (let i = 1; i < 4; i++) dots += L(`M${f(cx - 80 - i * 40)} 690C${f(cx - 110 - i * 40)} 800 ${f(cx - 130 - i * 40)} 900 ${f(cx - 150 - i * 44)} 1010`, "#8a5a14", 3, 0.35);
      a.add(G(dots, a.clip(dup)));
      a.add(L(`M${f(cx - 66)} 678C${f(cx - 112)} 820 ${f(cx - 130)} 920 ${f(cx - 150)} 1010`, "#7c1d2c", 6, 0.9));
      break;
    }
    case "pashmina": {
      const red = "#8e1f2f";
      a.add(P(torsoD, cloth(red)));
      a.add(P(`M${f(cx - 56)} ${top - 4}C${f(cx - 54)} 706 ${f(cx - 26)} 726 ${f(cx)} 728C${f(cx + 26)} 726 ${f(cx + 54)} 706 ${f(cx + 56)} ${top - 4}Z`, skinFill));
      a.add(L(`M${f(cx - 58)} ${top}C${f(cx - 56)} 710 ${f(cx - 26)} 732 ${f(cx)} 734C${f(cx + 26)} 732 ${f(cx + 56)} 710 ${f(cx + 58)} ${top}`, darken(red, 0.35), 5));
      a.add(C(cx, 760, 6, a.rad([[0, "#fff6e0"], [1, "#b89a5a"]], 0.35, 0.35, 0.7)), L(`M${f(cx - 40)} 724Q${f(cx)} 770 ${f(cx + 40)} 724`, "#c9a860", 1.4, 0.8));
      const shawl = "#b9a68e";
      const piece = (dir: number, inner0: number, inner1: number, col: string): string => {
        const d = `M${f(cx + dir * 62)} 676C${f(cx + dir * 130)} 690 ${f(cx + dir * 200 * s)} 708 ${f(cx + dir * 248 * s)} 742C${f(cx + dir * 316 * s)} 770 ${f(cx + dir * 344 * s)} 860 ${f(cx + dir * 356 * s)} 1010L${f(cx + dir * inner1)} 1010C${f(cx + dir * (inner1 + 10))} 900 ${f(cx + dir * inner0)} 790 ${f(cx + dir * 62)} 676Z`;
        let tex = "";
        for (let i = 1; i < 5; i++) tex += L(`M${f(cx + dir * (80 + i * 26))} 690C${f(cx + dir * (100 + i * 34))} 800 ${f(cx + dir * (inner1 + i * 40))} 900 ${f(cx + dir * (inner1 + i * 44))} 1010`, darken(col, 0.3), 4, 0.3);
        let pz = "";
        for (let i = 0; i < 14; i++) {
          const px = cx + dir * a.r(inner1 + 20, 320);
          const py = a.r(760, 1000);
          pz += `M${f(px)} ${f(py)}c6 -10 14 -4 10 4c-3 6 -10 8 -10 -4z`;
        }
        tex += P(pz, darken(col, 0.25), op(0.35));
        tex += L(`M${f(cx + dir * (inner0 - 4))} 790C${f(cx + dir * (inner1 + 6))} 900 ${f(cx + dir * (inner1 + 6))} 960 ${f(cx + dir * (inner1 + 4))} 1010`, "#6a1a26", 6, 0.7);
        return blob(a, cx + dir * (inner1 + 10), 900, 40, 140, "#000000", 0.3) + P(d, a.lin([[0, lighten(col, 0.15)], [1, darken(col, 0.2)]], dir > 0 ? 0 : 1, 0, dir > 0 ? 1 : 0, 0.3)) + G(tex, a.clip(d));
      };
      a.add(piece(1, 104, 70, darken(shawl, 0.06)), piece(-1, 110, 90, shawl));
      break;
    }
  }
}

const SKINS: Record<string, Skin> = {
  p1: { base: "#b67c58", shade: "#85513a", light: "#dcaa84", lip: "#9a5242" },
  p2: { base: "#c99069", shade: "#9a6144", light: "#ebbd97", lip: "#a8454c" },
  p3: { base: "#99613f", shade: "#6a3d27", light: "#c28a64", lip: "#7a3c2e" },
  p4: { base: "#d6a07a", shade: "#a66d4e", light: "#f1c7a3", lip: "#b24a55" },
  p5: { base: "#c8916e", shade: "#966047", light: "#e8b999", lip: "#a05a4b" },
  p6: { base: "#ae7350", shade: "#7c4932", light: "#d69e78", lip: "#94404a" },
};

const PORTRAITS: Record<string, PortraitSpec> = {
  "img-portrait-01": {
    skin: SKINS.p1, female: false, age: 54, turn: 0.17, hair: "sidePart", hairColor: "#55504b", hairLight: "#c7c1b8",
    browColor: "#3a3430", outfit: "bandhgala", bg: "warmOffice", jaw: 1.06, smile: 0.6,
  },
  "img-portrait-02": {
    skin: SKINS.p2, female: true, age: 44, turn: 0.15, hair: "bun", hairColor: "#1b1513", hairLight: "#5a4a42",
    browColor: "#221a16", bindi: true, earrings: "jhumka", outfit: "saree", bg: "coolGrey", jaw: 0.96, smile: 0.7,
  },
  "img-portrait-03": {
    skin: SKINS.p3, female: false, age: 34, turn: -0.16, hair: "shortStyled", hairColor: "#17110e", hairLight: "#4d3c32",
    browColor: "#140e0b", beard: true, outfit: "blazer", bg: "screenOffice", jaw: 1.06, smile: 0.5,
  },
  "img-portrait-04": {
    skin: SKINS.p4, female: true, age: 34, turn: -0.14, hair: "shoulder", hairColor: "#231915", hairLight: "#6e5446",
    browColor: "#2a1d17", earrings: "stud", outfit: "kurta", bg: "greenGrey", jaw: 0.96, smile: 0.8,
  },
  "img-portrait-05": {
    skin: SKINS.p5, female: false, age: 64, turn: 0.14, hair: "whiteBack", hairColor: "#dedad3", hairLight: "#ffffff",
    browColor: "#9c958c", glasses: "rimless", frameColor: "#8c8478", outfit: "suit", bg: "books", jaw: 1.05, smile: 0.4,
  },
  "img-portrait-06": {
    skin: SKINS.p6, female: true, age: 55, turn: -0.15, hair: "bob", hairColor: "#3b3430", hairLight: "#a7a099",
    browColor: "#3a302b", glasses: "frame", frameColor: "#5a2a22", earrings: "pearl", outfit: "pashmina", bg: "warmStudio", jaw: 0.97, smile: 0.7,
  },
};

/* ------------------------------------------------------------------ */
/* Figures (used by scenes)                                            */
/* ------------------------------------------------------------------ */

interface Fig {
  x: number;
  g: number;
  h: number;
  kind: "man" | "woman" | "saree";
  skin: string;
  hair: string;
  top: string;
  bottom?: string;
  border?: string;
  pose?: "down" | "phone" | "hold" | "raise" | "point" | "tablet";
  pallu?: "head" | "shoulder";
  turban?: string;
  cap?: string;
  sil?: string;
  glow?: string;
}

function figure(a: Art, o: Fig): string {
  const { x, g, h } = o;
  const c = (v: string): string => o.sil ?? v;
  const hr = h * 0.068;
  const hy = g - h + hr;
  const sy = g - h * 0.8;
  const sw = h * (o.kind === "man" ? 0.125 : 0.108);
  const wy = g - h * 0.48;
  const ww = h * (o.kind === "man" ? 0.092 : 0.1);
  const aw = h * 0.052;
  const shade = (v: string): string => (o.sil ? o.sil : darken(v, 0.22));
  let s = "";
  s += E(x, g, h * 0.17, h * 0.02, "#000000", op(0.18));
  // lower body
  if (o.kind === "saree") {
    const sk = `M${f(x - ww)} ${f(wy)}L${f(x - ww * 1.45)} ${f(g)}L${f(x + ww * 1.45)} ${f(g)}L${f(x + ww)} ${f(wy)}Z`;
    s += P(sk, c(o.top));
    s += L(`M${f(x - ww * 0.2)} ${f(wy + 8)}L${f(x - ww * 0.4)} ${f(g - 4)}M${f(x + ww * 0.3)} ${f(wy + 8)}L${f(x + ww * 0.5)} ${f(g - 4)}`, shade(o.top), aw * 0.3, 0.6);
    if (!o.sil && o.border) s += P(`M${f(x - ww * 1.4)} ${f(g - h * 0.05)}L${f(x + ww * 1.4)} ${f(g - h * 0.05)}L${f(x + ww * 1.45)} ${f(g)}L${f(x - ww * 1.45)} ${f(g)}Z`, o.border);
  } else {
    const b = o.bottom ?? "#3a3a44";
    const kneeTop = o.kind === "woman" ? wy + h * 0.2 : wy;
    s += P(`M${f(x - ww)} ${f(kneeTop - 4)}L${f(x - ww * 0.95)} ${f(g - 4)}L${f(x - 3)} ${f(g - 4)}L${f(x - 2)} ${f(wy + h * 0.06)}L${f(x + 2)} ${f(wy + h * 0.06)}L${f(x + 3)} ${f(g - 4)}L${f(x + ww * 0.95)} ${f(g - 4)}L${f(x + ww)} ${f(kneeTop - 4)}Z`, c(b));
    s += E(x - ww * 0.5, g - 3, ww * 0.6, 4, c("#2a221e")) + E(x + ww * 0.5, g - 3, ww * 0.6, 4, c("#2a221e"));
  }
  // torso
  const hem = o.kind === "woman" ? wy + h * 0.2 : o.kind === "man" && o.turban ? wy + h * 0.12 : wy;
  const hemW = o.kind === "woman" ? ww * 1.25 : ww;
  const torso = `M${f(x - sw)} ${f(sy)}C${f(x - sw - 3)} ${f(sy + h * 0.12)} ${f(x - hemW - 2)} ${f(hem - h * 0.12)} ${f(x - hemW)} ${f(hem)}L${f(x + hemW)} ${f(hem)}C${f(x + hemW + 2)} ${f(hem - h * 0.12)} ${f(x + sw + 3)} ${f(sy + h * 0.12)} ${f(x + sw)} ${f(sy)}Q${f(x)} ${f(sy - h * 0.035)} ${f(x - sw)} ${f(sy)}Z`;
  s += P(torso, c(o.top));
  if (!o.sil) s += P(`M${f(x + sw * 0.2)} ${f(sy)}L${f(x + sw)} ${f(sy)}C${f(x + sw + 3)} ${f(sy + h * 0.12)} ${f(x + hemW + 2)} ${f(hem - h * 0.12)} ${f(x + hemW)} ${f(hem)}L${f(x + hemW * 0.4)} ${f(hem)}Z`, darken(o.top, 0.15), op(0.6));
  if (o.kind === "saree") {
    const pal = `M${f(x + sw * 0.9)} ${f(sy)}L${f(x + sw * 0.1)} ${f(sy - 1)}L${f(x - ww * 1.1)} ${f(wy + h * 0.1)}L${f(x - ww * 0.2)} ${f(wy + h * 0.12)}Z`;
    s += P(pal, shade(o.top));
    if (!o.sil && o.border) s += L(`M${f(x + sw * 0.1)} ${f(sy)}L${f(x - ww * 1.1)} ${f(wy + h * 0.1)}`, o.border, aw * 0.45);
  }
  // arms
  const arm = (pts: number[][]): string =>
    L(pts.map((p, i) => `${i ? "L" : "M"}${f(p[0])} ${f(p[1])}`).join(""), c(o.kind === "saree" ? o.skin : o.top), aw) +
    C(pts[pts.length - 1][0], pts[pts.length - 1][1], aw * 0.55, c(o.skin));
  const pose = o.pose ?? "down";
  const lS = [x - sw + aw * 0.3, sy + aw * 0.4];
  const rS = [x + sw - aw * 0.3, sy + aw * 0.4];
  if (pose === "down") {
    s += arm([lS, [x - sw - 4, wy - h * 0.06], [x - sw - 2, wy + h * 0.04]]) + arm([rS, [x + sw + 4, wy - h * 0.06], [x + sw + 2, wy + h * 0.04]]);
  } else if (pose === "phone") {
    s += arm([lS, [x - sw - 4, wy - h * 0.06], [x - sw - 2, wy + h * 0.04]]);
    s += arm([rS, [x + sw + 2, wy - h * 0.08], [x + sw * 0.25, sy + h * 0.12]]);
    s += R(x + sw * 0.1 - h * 0.025, sy + h * 0.06, h * 0.05, h * 0.085, o.glow ?? "#8fe3ff", `rx="${f(h * 0.008)}"`);
    s += blob(a, x + sw * 0.15, sy + h * 0.1, h * 0.09, h * 0.09, o.glow ?? "#8fe3ff", 0.45);
  } else if (pose === "hold" || pose === "tablet") {
    s += arm([lS, [x - sw - 2, wy - h * 0.1], [x - sw * 0.2, wy - h * 0.1]]) + arm([rS, [x + sw + 2, wy - h * 0.1], [x + sw * 0.2, wy - h * 0.1]]);
    if (pose === "hold") s += R(x - sw * 0.6, wy - h * 0.17, sw * 1.2, h * 0.09, c("#f4efe2"), `transform="rotate(-8 ${f(x)} ${f(wy - h * 0.12)})"`);
    else s += R(x - sw * 0.55, wy - h * 0.2, sw * 1.1, h * 0.08, "#1d2b3a") + R(x - sw * 0.48, wy - h * 0.19, sw * 0.96, h * 0.064, o.glow ?? "#7fe0ff");
  } else if (pose === "raise") {
    s += arm([lS, [x - sw - 4, wy - h * 0.06], [x - sw - 2, wy + h * 0.04]]) + arm([rS, [x + sw + h * 0.03, sy - h * 0.12], [x + sw + h * 0.02, sy - h * 0.26]]);
  } else {
    s += arm([lS, [x - sw - 4, wy - h * 0.06], [x - sw - 2, wy + h * 0.04]]) + arm([rS, [x + sw + h * 0.1, sy + h * 0.04], [x + sw + h * 0.22, sy - h * 0.06]]);
  }
  // neck + head
  s += R(x - hr * 0.38, hy + hr * 0.6, hr * 0.76, sy - hy - hr * 0.5, c(darken(o.skin, 0.12)));
  if (o.pallu === "head") s += P(`M${f(x - hr * 1.35)} ${f(sy + h * 0.04)}C${f(x - hr * 1.6)} ${f(hy - hr * 0.6)} ${f(x - hr * 0.9)} ${f(hy - hr * 1.5)} ${f(x)} ${f(hy - hr * 1.45)}C${f(x + hr * 0.9)} ${f(hy - hr * 1.5)} ${f(x + hr * 1.6)} ${f(hy - hr * 0.6)} ${f(x + hr * 1.35)} ${f(sy + h * 0.04)}Z`, shade(o.top));
  if (o.kind !== "man" && o.pallu !== "head") s += C(x - hr * 0.7, hy + hr * 0.1, hr * 0.55, c(o.hair));
  s += C(x, hy, hr, c(o.skin));
  if (!o.sil) s += P(`M${f(x + hr * 0.2)} ${f(hy - hr * 0.98)}A${f(hr)} ${f(hr)} 0 0 1 ${f(x + hr * 0.2)} ${f(hy + hr * 0.98)}Q${f(x + hr * 0.75)} ${f(hy)} ${f(x + hr * 0.2)} ${f(hy - hr * 0.98)}Z`, darken(o.skin, 0.3), op(0.35));
  if (o.turban) {
    s += P(`M${f(x - hr * 1.12)} ${f(hy - hr * 0.1)}C${f(x - hr * 1.3)} ${f(hy - hr * 1.6)} ${f(x + hr * 1.3)} ${f(hy - hr * 1.6)} ${f(x + hr * 1.12)} ${f(hy - hr * 0.1)}Q${f(x)} ${f(hy - hr * 0.5)} ${f(x - hr * 1.12)} ${f(hy - hr * 0.1)}Z`, c(o.turban));
    if (!o.sil) s += L(`M${f(x - hr)} ${f(hy - hr * 0.5)}Q${f(x)} ${f(hy - hr * 1.2)} ${f(x + hr)} ${f(hy - hr * 0.7)}`, darken(o.turban, 0.25), hr * 0.15, 0.7);
  } else if (o.cap) {
    s += P(`M${f(x - hr * 0.98)} ${f(hy - hr * 0.25)}L${f(x - hr * 0.9)} ${f(hy - hr * 1.05)}L${f(x + hr * 0.9)} ${f(hy - hr * 1.05)}L${f(x + hr * 0.98)} ${f(hy - hr * 0.25)}Z`, c(o.cap));
  } else if (o.pallu !== "head") {
    s += P(`M${f(x - hr * 1.04)} ${f(hy + hr * 0.1)}C${f(x - hr * 1.2)} ${f(hy - hr * 1.4)} ${f(x + hr * 1.2)} ${f(hy - hr * 1.4)} ${f(x + hr * 1.04)} ${f(hy)}Q${f(x + hr * 0.4)} ${f(hy - hr * 0.6)} ${f(x - hr * 0.6)} ${f(hy - hr * 0.5)}Q${f(x - hr * 0.85)} ${f(hy - hr * 0.2)} ${f(x - hr * 1.04)} ${f(hy + hr * 0.1)}Z`, c(o.hair));
  } else {
    s += P(`M${f(x - hr * 1.05)} ${f(hy + hr * 0.4)}C${f(x - hr * 1.3)} ${f(hy - hr * 1.3)} ${f(x + hr * 1.3)} ${f(hy - hr * 1.3)} ${f(x + hr * 1.05)} ${f(hy + hr * 0.4)}Q${f(x + hr * 0.6)} ${f(hy - hr * 0.7)} ${f(x)} ${f(hy - hr * 0.72)}Q${f(x - hr * 0.6)} ${f(hy - hr * 0.7)} ${f(x - hr * 1.05)} ${f(hy + hr * 0.4)}Z`, c(o.top));
    if (!o.sil && o.border) s += L(`M${f(x - hr * 1.02)} ${f(hy + hr * 0.3)}Q${f(x - hr * 0.6)} ${f(hy - hr * 0.68)} ${f(x)} ${f(hy - hr * 0.7)}Q${f(x + hr * 0.6)} ${f(hy - hr * 0.68)} ${f(x + hr * 1.02)} ${f(hy + hr * 0.3)}`, o.border, hr * 0.14);
  }
  return s;
}

/** Seated person seen from behind (head and shoulders). */
function backView(x: number, y: number, s: number, body: string, hair: string, braid = false, rim?: string): string {
  let o = P(`M${f(x - 44 * s)} ${f(y + 70 * s)}C${f(x - 44 * s)} ${f(y + 20 * s)} ${f(x - 30 * s)} ${f(y + 8 * s)} ${f(x)} ${f(y + 6 * s)}C${f(x + 30 * s)} ${f(y + 8 * s)} ${f(x + 44 * s)} ${f(y + 20 * s)} ${f(x + 44 * s)} ${f(y + 70 * s)}Z`, body);
  o += R(x - 8 * s, y - 6 * s, 16 * s, 16 * s, darken(hair === body ? body : "#6b4a36", 0.1));
  o += C(x, y - 18 * s, 17 * s, hair);
  if (braid) o += L(`M${f(x)} ${f(y - 4 * s)}L${f(x + 2 * s)} ${f(y + 34 * s)}`, hair, 7 * s);
  if (rim) o += L(`M${f(x - 15 * s)} ${f(y - 28 * s)}A${f(17 * s)} ${f(17 * s)} 0 0 1 ${f(x + 6 * s)} ${f(y - 34.5 * s)}`, rim, 2.5 * s, 0.7);
  return o;
}

/* ------------------------------------------------------------------ */
/* Scenes (1200 x 800)                                                 */
/* ------------------------------------------------------------------ */

const SW = 1200;
const SH = 800;

function circlesPath(pts: number[][]): string {
  return pts.map(([x, y, r]) => `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0`).join("");
}

function skyline(a: Art): void {
  const hz = 520;
  const rnd = a.rnd;
  a.add(R(0, 0, SW, hz + 2, a.lin([[0, "#1d1640"], [0.35, "#47296a"], [0.62, "#b24f78"], [0.82, "#f08850"], [1, "#ffc276"]])));
  a.add(blob(a, 840, hz - 20, 320, 180, "#ffb25e", 0.8), blob(a, 840, hz - 34, 80, 80, "#fff0c8", 0.9), C(840, hz - 34, 28, "#ffe7b4"));
  for (let i = 0; i < 9; i++) {
    const y = a.r(110, 430);
    a.add(E(a.r(0, 1200), y, a.r(120, 260), a.r(5, 13), mix("#f7a59a", "#6a4a8a", (430 - y) / 320), op(a.r(0.25, 0.5))));
  }
  let far = "";
  for (let x = 0; x < SW; ) {
    const w = a.r(18, 46);
    const h = a.r(20, 90) * (x < 760 ? 1 : 0.45);
    far += `M${f(x)} ${hz}V${f(hz - h)}h${f(w)}V${hz}Z`;
    x += w + a.r(0, 6);
  }
  a.add(P(far, "#7d5180", op(0.8)));
  let mid = "";
  let lit = "";
  let lit2 = "";
  for (let x = -10; x < 770; ) {
    const w = a.r(36, 82);
    const h = a.r(80, 270) * (1 - x / 1500);
    const top = hz - h;
    mid += `M${f(x)} ${hz}V${f(top)}h${f(w)}V${hz}Z`;
    const r0 = rnd();
    if (r0 < 0.3) mid += `M${f(x + w * 0.25)} ${f(top + 1)}v${f(-a.r(12, 40))}h${f(w * 0.5)}V${f(top + 1)}Z`;
    else if (r0 < 0.45) mid += `M${f(x + w / 2 - 1.5)} ${f(top + 1)}v${f(-a.r(30, 70))}h3V${f(top + 1)}Z`;
    else if (r0 < 0.55) mid += `M${f(x)} ${f(top + 1)}Q${f(x + w / 2)} ${f(top - w * 0.6)} ${f(x + w)} ${f(top + 1)}Z`;
    for (let wy = top + 10; wy < hz - 8; wy += 13) {
      for (let wx = x + 6; wx < x + w - 8; wx += 11) {
        const r = rnd();
        if (r < 0.14) lit += `M${f(wx)} ${f(wy)}h5v6h-5z`;
        else if (r < 0.2) lit2 += `M${f(wx)} ${f(wy)}h5v6h-5z`;
      }
    }
    x += w + a.r(-8, 3);
  }
  a.add(P(mid, a.lin([[0, "#3a2a55"], [1, "#1c1530"]])), P(lit, "#ffd590", op(0.9)), P(lit2, "#9fd0ff", op(0.6)));
  // heritage dome by the water
  a.add(P(`M90 ${hz}V470h120V${hz}ZM100 470Q150 400 200 470ZM146 412h8v-18h-8z`, "#2a1f40"));
  // sea
  a.add(R(0, hz, SW, SH - hz, a.lin([[0, "#6b3f6e"], [0.25, "#33264f"], [1, "#100d22"]])));
  let refl = "";
  for (let i = 0; i < 34; i++) {
    const y = hz + 6 + i * 8.5;
    const w = 150 * (1 - i / 44) * a.r(0.35, 1);
    refl += `M${f(840 - w / 2 + a.r(-14, 14))} ${f(y)}h${f(w)}v2.4h${f(-w)}z`;
  }
  a.add(P(refl, "#ffc27a", op(0.55)));
  let cityRefl = "";
  for (let i = 0; i < 70; i++) cityRefl += `M${f(a.r(0, 760))} ${f(hz + a.r(4, 150))}h${f(a.r(6, 22))}v2h${f(-a.r(6, 22))}z`;
  a.add(P(cityRefl, "#ffd590", op(0.3)));
  // sea link
  const deck = (t: number): [number, number] => [360 + t * 860, hz + 40 - t * 26 - Math.sin(t * Math.PI) * 10];
  let dk = "";
  for (let i = 0; i <= 20; i++) {
    const [x, y] = deck(i / 20);
    dk += `${i ? "L" : "M"}${f(x)} ${f(y)}`;
  }
  let piers = "";
  for (let t = 0.02; t < 1; t += 0.035) {
    const [x, y] = deck(t);
    piers += `M${f(x)} ${f(y)}v${f(14 - t * 6)}`;
  }
  a.add(L(piers, "#1a1330", 3), L(dk, "#140f26", 7), L(dk, "#f3b27a", 1.2, 0.7, `transform="translate(0 -3)"`));
  let cables = "";
  let pyl = "";
  for (const [t, ht] of [[0.4, 190], [0.7, 160]] as const) {
    const [px, py] = deck(t);
    const top = py - ht;
    pyl += `M${f(px - 14)} ${f(py)}L${f(px - 2)} ${f(top + ht * 0.35)}L${f(px - 3)} ${f(top)}L${f(px + 3)} ${f(top)}L${f(px + 2)} ${f(top + ht * 0.35)}L${f(px + 14)} ${f(py)}L${f(px + 9)} ${f(py)}L${f(px)} ${f(top + ht * 0.45)}L${f(px - 9)} ${f(py)}Z`;
    for (let k = 1; k <= 11; k++) {
      for (const dir of [-1, 1]) {
        const [cx2, cy2] = deck(t + dir * k * 0.017);
        cables += `M${f(px)} ${f(top + 8 + k * 3)}L${f(cx2)} ${f(cy2 - 3)}`;
      }
    }
  }
  a.add(L(cables, "#f0c4a8", 1, 0.55), P(pyl, "#1d1533"));
  let dl = "";
  for (let t = 0.01; t < 1; t += 0.022) {
    const [x, y] = deck(t);
    dl += `M${f(x)} ${f(y - 5)}h2v2h-2z`;
  }
  a.add(P(dl, "#ffe2a0"));
  // promenade lights (Queen's-necklace style curve)
  const q = (t: number): [number, number] => [(1 - t) * (1 - t) * -40 + 2 * (1 - t) * t * 300 + t * t * 700, (1 - t) * (1 - t) * 640 + 2 * (1 - t) * t * 560 + t * t * 800];
  let wall = `M-40 800L-40 ${f(q(0)[1])}`;
  for (let i = 0; i <= 16; i++) {
    const [x, y] = q(i / 16);
    wall += `L${f(x)} ${f(y + 8)}`;
  }
  a.add(P(wall + "L700 800Z", "#0b0918"));
  let bulbs = "";
  for (let i = 1; i < 26; i++) {
    const [x, y] = q(i / 26);
    a.add(blob(a, x, y, 16, 12, "#ffcf7a", 0.55));
    bulbs += `M${f(x - 2)} ${f(y)}a2 2 0 1 0 4 0a2 2 0 1 0 -4 0`;
  }
  a.add(P(bulbs, "#fff1c8"));
}

function datacentre(a: Art): void {
  const VX = 600;
  const VY = 330;
  const F = 560;
  const camH = 1.3;
  const pr = (x: number, y: number, z: number): [number, number] => [VX + (x * F) / z, VY - ((y - camH) * F) / z];
  const quad = (p: [number, number][]): string => polyD(p);
  a.add(R(0, 0, SW, SH, "#040913"));
  a.add(P(quad([[0, 0], [SW, 0], pr(1.2, 2.6, 16), pr(-1.2, 2.6, 16)]), a.lin([[0, "#02060d"], [1, "#0b1a2c"]])));
  a.add(P(quad([[0, SH], [SW, SH], pr(1.2, 0, 16), pr(-1.2, 0, 16)]), a.lin([[0, "#0d2238"], [1, "#081626"]], 0, 1, 0, 0)));
  // end wall glow
  const e0 = pr(-1.2, 0, 16);
  const e1 = pr(1.2, 2.6, 16);
  a.add(R(e0[0], e1[1], e1[0] - e0[0], e0[1] - e1[1], a.lin([[0, "#7ff3ff"], [1, "#1a8fc4"]])), blob(a, VX, VY, 260, 200, "#2ec9ff", 0.45));
  // floor lines
  let fl = "";
  for (let i = -3; i <= 3; i++) {
    const p0 = pr(i * 0.38, 0, 1);
    const p1 = pr(i * 0.38, 0, 16);
    fl += `M${f(p0[0])} ${f(p0[1])}L${f(p1[0])} ${f(p1[1])}`;
  }
  for (let z = 1.4; z < 16; z *= 1.22) {
    const p0 = pr(-1.2, 0, z);
    const p1 = pr(1.2, 0, z);
    fl += `M${f(p0[0])} ${f(p0[1])}L${f(p1[0])} ${f(p1[1])}`;
  }
  a.add(L(fl, "#3fd2ff", 1, 0.15));
  const ledCols = ["#39e1ff", "#4d8bff", "#4dffb0", "#ffb84d"];
  const drawRacks = (mirror: boolean, plain = false): string => {
    const m = mirror ? -1 : 1;
    let out = "";
    const leds: string[] = ["", "", "", ""];
    for (const side of [-1, 1]) {
      const xf = side * 1.2;
      for (let z0 = 14.4; z0 > 1.0; z0 -= 0.7) {
        const z1 = z0 + 0.64;
        const q0 = pr(xf, 0, z0);
        const q1 = pr(xf, 2.3 * m, z0);
        const q2 = pr(xf, 2.3 * m, z1);
        const q3 = pr(xf, 0, z1);
        const shade = clamp((z0 - 1) / 13, 0, 1);
        out += P(quad([q0, q1, q2, q3]), mix("#1a2b45", "#0a1322", shade));
        out += L(`M${f(q0[0])} ${f(q0[1])}L${f(q1[0])} ${f(q1[1])}`, "#5a7fae", Math.max(1, 6 / z0), 0.7);
        if (plain) continue;
        if (z0 < 6) {
          let un = "";
          for (let v = 0.25; v < 2.3; v += 0.36) {
            const u0 = pr(xf, v * m, z0);
            const u1 = pr(xf, v * m, z1);
            un += `M${f(u0[0])} ${f(u0[1])}L${f(u1[0])} ${f(u1[1])}`;
          }
          out += L(un, "#24395a", Math.max(1, 3 / z0));
        }
        const n = Math.round(clamp(16 / z0, 2, 10));
        for (let i = 0; i < n; i++) {
          const zz = z0 + 0.06 + a.rnd() * 0.5;
          const v = (0.15 + a.rnd() * 2.05) * m;
          const p = pr(xf, v, zz);
          const sz = Math.max(1.2, 9 / zz);
          leds[a.rnd() < 0.45 ? 0 : a.rnd() < 0.5 ? 1 : a.rnd() < 0.8 ? 2 : 3] += `M${f(p[0])} ${f(p[1])}h${f(sz * 1.6)}v${f(sz * 0.7)}h${f(-sz * 1.6)}z`;
        }
      }
    }
    leds.forEach((d, i) => {
      if (d) out += P(d, ledCols[i]);
    });
    return out;
  };
  a.add(G(drawRacks(true, true), op(0.22)));
  a.add(drawRacks(false));
  // ceiling light strips & trays
  let cl = "";
  for (let z = 1.6; z < 15; z += 1.3) cl += polyD([pr(-0.35, 2.9, z), pr(0.35, 2.9, z), pr(0.35, 2.9, z + 0.55), pr(-0.35, 2.9, z + 0.55)]);
  a.add(P(cl, "#c9f5ff", op(0.85)));
  let tray = "";
  for (const side of [-1, 1]) {
    const p0 = pr(side * 0.9, 2.75, 1);
    const p1 = pr(side * 0.9, 2.75, 16);
    tray += `M${f(p0[0])} ${f(p0[1])}L${f(p1[0])} ${f(p1[1])}`;
  }
  a.add(L(tray, "#1d3654", 8, 0.9), blob(a, VX, 700, 420, 90, "#2ec9ff", 0.18));
}

function farmDrone(a: Art): void {
  const hz = 330;
  a.add(R(0, 0, SW, hz + 40, a.lin([[0, "#9fd3f0"], [0.7, "#e4f1ea"], [1, "#f6efd2"]])));
  a.add(blob(a, 1010, 120, 200, 200, "#fff6d6", 0.9), C(1010, 120, 34, "#fffbe8"));
  for (let i = 0; i < 5; i++) a.add(E(a.r(0, 1200), a.r(50, 200), a.r(60, 140), a.r(10, 20), "#ffffff", op(a.r(0.4, 0.7))));
  a.add(P(spline([[-40, hz + 30, 1], [-40, hz - 20], [160, hz - 70], [330, hz - 36], [520, hz - 90], [760, hz - 46], [960, hz - 82], [1240, hz - 30], [1240, hz + 30, 1]]), "#a6c6c2"));
  a.add(P(spline([[-40, hz + 40, 1], [-40, hz], [220, hz - 30], [460, hz - 6], [700, hz - 34], [940, hz - 4], [1240, hz - 26], [1240, hz + 40, 1]]), "#7fac80"));
  const trees: number[][] = [];
  for (let x = -10; x < 1220; x += a.r(14, 34)) trees.push([x, hz + 14 - a.r(0, 10), a.r(9, 18)]);
  a.add(P(circlesPath(trees), "#3f6b45"));
  a.add(R(0, hz + 18, SW, SH - hz, "#86b858"));
  // patchwork band
  let x = 0;
  while (x < SW) {
    const w = a.r(70, 180);
    a.add(R(x, hz + 20, w, 46, a.pick(["#a9c85e", "#7fb24f", "#c8c86a", "#6fa04a", "#d6c27a"])));
    x += w;
  }
  // crop rows
  const vx = 640;
  const vy = hz + 6;
  const y0 = hz + 66;
  const X = (xb: number, y: number): number => vx + ((xb - vx) * (y - vy)) / (SH - vy);
  a.add(P(`M0 ${y0}L${f(X(560, y0))} ${y0}L560 ${SH}L0 ${SH}Z`, "#5f9a3f"));
  a.add(P(`M${f(X(640, y0))} ${y0}L${SW} ${y0}L${SW} ${SH}L640 ${SH}Z`, "#a8bf4f"));
  a.add(P(`M${f(X(560, y0))} ${y0}L${f(X(640, y0))} ${y0}L640 ${SH}L560 ${SH}Z`, "#c9a46a"));
  let rows = "";
  let rows2 = "";
  for (let i = -26; i < 26; i++) {
    const xb0 = vx + i * 60;
    const xb1 = xb0 + 26;
    if (xb1 > 560 && xb0 < 640) continue;
    const d = `M${f(X(xb0, y0))} ${y0}L${f(X(xb1, y0))} ${y0}L${f(xb1)} ${SH}L${f(xb0)} ${SH}Z`;
    if (xb0 < 600) rows += d;
    else rows2 += d;
  }
  a.add(P(rows, "#3f7a2c", op(0.75)), P(rows2, "#7f9a35", op(0.7)));
  a.add(R(0, y0 - 2, SW, 30, a.lin([[0, "#f6efd2", 0.5], [1, "#f6efd2", 0]])));
  // scan beam
  const dx = 470;
  const dy = 196;
  const fq: [number, number][] = [[330, 560], [600, 560], [650, 650], [290, 650]];
  a.add(P(polyD([[dx - 6, dy + 26], [dx + 6, dy + 26], fq[2], fq[3]]), a.lin([[0, "#5ff0ff", 0.45], [1, "#5ff0ff", 0.08]])));
  a.add(P(polyD(fq), "#5ff0ff", op(0.18)), L(polyD(fq), "#bffaff", 2, 0.9));
  let grid = "";
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    grid += `M${f(fq[0][0] + (fq[1][0] - fq[0][0]) * t)} 560L${f(fq[3][0] + (fq[2][0] - fq[3][0]) * t)} 650`;
  }
  grid += "M310 605L625 605";
  a.add(L(grid, "#d8fdff", 1.2, 0.6));
  for (const [cx, cy] of [[400, 590], [530, 620]]) a.add(L(`M${cx - 14} ${cy}h28M${cx} ${cy - 10}v20`, "#ffffff", 2, 0.85), C(cx, cy, 9, "none", sk("#ffffff", 1.5, 0.8)));
  // drone
  let dr = "";
  const motors: [number, number, number][] = [[-96, -10, 0.85], [96, -10, 0.85], [-118, 16, 1], [118, 16, 1]];
  for (const [mx, my] of motors) dr += L(`M${dx} ${dy}L${dx + mx} ${dy + my}`, "#3a444e", 7);
  for (const [mx, my, s] of motors) {
    dr += R(dx + mx - 7, dy + my - 12, 14, 14, "#2a3138", `rx="3"`);
    dr += E(dx + mx, dy + my - 13, 52 * s, 9 * s, "#eef4f7", `${op(0.4)} ${sk("#ffffff", 1, 0.6)}`);
  }
  dr += P(`M${dx - 44} ${dy + 6}C${dx - 44} ${dy - 18} ${dx - 24} ${dy - 24} ${dx} ${dy - 24}C${dx + 24} ${dy - 24} ${dx + 44} ${dy - 18} ${dx + 44} ${dy + 6}C${dx + 40} ${dy + 16} ${dx - 40} ${dy + 16} ${dx - 44} ${dy + 6}Z`, a.lin([[0, "#ffffff"], [1, "#b8c4cc"]]));
  dr += P(`M${dx - 30} ${dy - 14}C${dx - 20} ${dy - 21} ${dx + 20} ${dy - 21} ${dx + 30} ${dy - 14}`, "none", sk("#ffffff", 3, 0.9));
  dr += R(dx - 10, dy + 12, 20, 14, "#22292f", `rx="5"`) + C(dx, dy + 21, 5, "#5ff0ff");
  dr += C(dx - 34, dy + 2, 3, "#ff4d4d") + C(dx + 34, dy + 2, 3, "#4dff88");
  dr += L(`M${dx - 30} ${dy + 12}L${dx - 40} ${dy + 34}M${dx + 30} ${dy + 12}L${dx + 40} ${dy + 34}`, "#3a444e", 3);
  a.add(blob(a, dx, dy + 30, 120, 30, "#000000", 0.08), dr);
  // farmer
  a.add(
    figure(a, { x: 960, g: 776, h: 330, kind: "man", skin: "#8a5a3c", hair: "#1c1612", top: "#f1ede2", bottom: "#d9d2c0", pose: "phone", turban: "#e28a2b", glow: "#9ff3ff" }),
  );
  a.add(P(`M1060 800C1080 700 1120 660 1200 640L1200 800Z`, "#4f8a35", op(0.9)));
}

function classroom(a: Art): void {
  a.add(R(0, 0, SW, SH, a.lin([[0, "#f3d6aa"], [0.62, "#e9bf86"], [0.63, "#b07a4a"], [1, "#8a5a34"]])));
  // window + light beams
  a.add(R(40, 90, 200, 300, "#fff4d8"), L(polyD([[40, 90], [240, 90], [240, 390], [40, 390]]) + "M140 90V390M40 240H240", "#c79458", 10));
  a.add(P(polyD([[60, 110], [240, 110], [760, 800], [200, 800]]), a.lin([[0, "#fff6dc", 0.4], [1, "#fff6dc", 0]])));
  // screen
  a.add(R(352, 66, 520, 318, "#1a2230", `rx="10"`), R(366, 80, 492, 290, a.lin([[0, "#123a63"], [1, "#0c2440"]])));
  a.add(blob(a, 612, 225, 380, 230, "#5ec8ff", 0.28));
  const bars = [0.45, 0.7, 0.55, 0.85, 0.65, 0.95];
  bars.forEach((b, i) => a.add(R(392 + i * 34, 330 - b * 180, 22, b * 180, ["#5ec8ff", "#ffc65e", "#5ec8ff", "#ff8a5e", "#5ec8ff", "#7dffb0"][i])));
  a.add(L("M612 310L650 270L690 290L730 220L770 236L830 150", "#ffd36e", 4), L("M612 330H840", "#9fc6e8", 1.5, 0.6));
  a.add(C(796, 300, 40, "#2b5d8a"), P("M796 300L796 260A40 40 0 0 1 834 288Z", "#ffc65e"), P("M796 300L834 288A40 40 0 0 1 806 339Z", "#ff8a5e"));
  a.add(R(392, 100, 160, 14, "#ffffff", `rx="7" ${op(0.85)}`), R(392, 122, 100, 10, "#9fc6e8", `rx="5"`));
  // teacher
  a.add(figure(a, { x: 930, g: 520, h: 300, kind: "saree", skin: "#a8704c", hair: "#1c1513", top: "#2e7d6b", border: "#e2b04a", pose: "point" }));
  // desks & students (back rows nearest)
  const rows = [
    { y: 470, s: 0.62, n: 7, dx: 120, x0: 230 },
    { y: 560, s: 0.8, n: 6, dx: 160, x0: 170 },
    { y: 680, s: 1.05, n: 5, dx: 230, x0: 120 },
  ];
  const bodies = ["#3a4f7a", "#f1ede4", "#3a4f7a", "#7a2f3a", "#f1ede4", "#2f5f5a"];
  for (const r of rows) {
    for (let i = 0; i < r.n; i++) {
      const x = r.x0 + i * r.dx + a.r(-8, 8);
      const girl = a.rnd() < 0.5;
      a.add(backView(x, r.y, r.s, a.pick(bodies), "#1b1411", girl, "#ffdca0"));
      if (a.rnd() < 0.15) a.add(L(`M${f(x + 30 * r.s)} ${f(r.y + 20 * r.s)}L${f(x + 46 * r.s)} ${f(r.y - 60 * r.s)}`, "#a8704c", 10 * r.s));
    }
    a.add(R(0, r.y + 62 * r.s, SW, 22 * r.s, "#6b4426"), R(0, r.y + 62 * r.s, SW, 5 * r.s, "#a8754a"));
    for (let i = 0; i < r.n; i++) {
      if (a.rnd() < 0.6) {
        const x = r.x0 + i * r.dx + 26 * r.s;
        a.add(P(polyD([[x, r.y + 62 * r.s], [x + 40 * r.s, r.y + 62 * r.s], [x + 46 * r.s, r.y + 30 * r.s], [x + 6 * r.s, r.y + 30 * r.s]]), "#2a3240"), blob(a, x + 24 * r.s, r.y + 46 * r.s, 30 * r.s, 20 * r.s, "#7fe0ff", 0.5));
      }
    }
  }
  a.add(R(0, 0, SW, SH, a.rad([[0, "#000000", 0], [0.75, "#000000", 0], [1, "#3a1a00", 0.35]], 0.5, 0.45, 0.8)));
}

function health(a: Art): void {
  a.add(R(0, 0, SW, SH, a.lin([[0, "#eef8f7"], [0.68, "#d7efed"], [0.681, "#bfdcd9"], [1, "#a9cdca"]])));
  a.add(R(0, 520, SW, 14, "#8fc2bd"));
  // window
  a.add(R(940, 90, 210, 250, "#cfeaf4"), blob(a, 1045, 230, 110, 90, "#7fbf73", 0.9), L("M940 90h210v250h-210zM1045 90v250", "#ffffff", 10));
  // monitor with doctor
  a.add(R(170, 70, 560, 360, "#1f3a44", `rx="14"`), R(186, 86, 528, 304, a.lin([[0, "#dff3f6"], [1, "#b9e1e6"]])));
  a.add(R(186, 86, 528, 304, "#ffffff", op(0.3)), R(560, 110, 120, 140, "#f6fbfb"), P("M600 140h40v20h-40zM610 130h20v40h-20z", "#25b0a6"));
  a.add(
    figure(a, { x: 420, g: 660, h: 560, kind: "man", skin: "#9c6847", hair: "#1d1612", top: "#fbfbfb", bottom: "#4a6a8a", pose: "down" }),
  );
  a.add(R(186, 390, 528, 300, "#e9f5f3"), L("M380 300C370 340 400 380 430 360C450 345 446 320 440 300", "#2f4b5a", 4));
  a.add(R(170, 386, 560, 50, "#1f3a44"), C(410, 411, 15, "#e5484d"), C(460, 411, 15, "#3a5d6a"), C(510, 411, 15, "#3a5d6a"), R(612, 300, 86, 72, "#24414c", `rx="6"`), R(618, 306, 74, 60, "#5e8a96"));
  a.add(R(170, 386, 560, 2, "#5fd3c8"), R(186, 86, 528, 6, "#25b0a6"));
  // table and kit
  a.add(R(420, 560, 360, 18, "#2a7d78"), R(440, 578, 14, 180, "#1f5f5b"), R(746, 578, 14, 180, "#1f5f5b"));
  a.add(R(620, 512, 120, 48, "#ffffff", `rx="8"`), P("M672 524h16v8h8v16h-8v8h-16v-8h-8v-16h8z", "#e5484d"));
  a.add(R(480, 520, 90, 40, "#3a5d6a", `rx="6"`), R(490, 528, 44, 22, "#9ff3e8"), L("M540 560C560 590 600 590 610 560", "#3a5d6a", 4));
  // health worker and patient
  a.add(figure(a, { x: 900, g: 770, h: 430, kind: "saree", skin: "#a26a48", hair: "#1c1513", top: "#e2558e", border: "#2a9d8f", pose: "tablet", pallu: "shoulder" }));
  a.add(R(250, 660, 190, 20, "#7a5a3a"), R(262, 680, 12, 100, "#5a3f28"), R(416, 680, 12, 100, "#5a3f28"));
  a.add(figure(a, { x: 345, g: 780, h: 380, kind: "man", skin: "#8f5d3e", hair: "#d9d4cc", top: "#f2efe6", bottom: "#c9c2b0", pose: "hold", cap: "#ffffff" }));
  a.add(R(250, 640, 190, 26, "#8a6a48", `rx="6"`));
  a.add(C(1080, 470, 34, "#ffffff"), P("M1072 446h16v16h16v16h-16v16h-16v-16h-16v-16h16z", "#2aa198"));
  a.add(P("M110 780C90 700 120 640 150 620C170 650 180 720 160 780Z", "#3f8f6a"), R(110, 740, 60, 50, "#e3efe9"));
}

function solar(a: Art): void {
  const hz = 400;
  a.add(R(0, 0, SW, hz + 20, a.lin([[0, "#6fa6d9"], [0.55, "#f3d2a8"], [1, "#ffb36b"]])));
  a.add(blob(a, 840, hz, 360, 220, "#ffd58a", 0.9), C(840, hz - 4, 46, "#fff1c8"));
  for (let i = 0; i < 6; i++) a.add(P(`M${f(150 + i * 26)} ${f(130 + (i % 2) * 14)}q8 -8 14 0q6 -8 14 0`, "none", sk("#3a3a4a", 2, 0.7)));
  a.add(P(spline([[-40, hz + 20, 1], [-40, hz - 30], [200, hz - 70], [420, hz - 40], [640, hz - 60], [900, hz - 20], [1240, hz - 50], [1240, hz + 20, 1]]), "#a7a6c6", op(0.8)));
  a.add(R(0, hz - 4, SW, SH - hz, a.lin([[0, "#9cbc6a"], [1, "#5f8f3e"]])));
  // school building
  const bx = 120;
  const by = hz + 10;
  a.add(R(bx, by - 70, 300, 70, "#f1d9a8"), R(bx - 10, by - 82, 320, 16, "#c0573a"), R(bx, by - 18, 300, 18, "#d9a86a"));
  for (let i = 0; i < 6; i++) a.add(R(bx + 16 + i * 48, by - 56, 26, 26, "#3d6f9a"));
  a.add(R(bx + 260, by - 50, 24, 50, "#7a4a2a"), R(bx + 330, by - 130, 3, 130, "#6a6a6a"), R(bx + 333, by - 130, 36, 8, "#ff9933"), R(bx + 333, by - 122, 36, 8, "#ffffff"), R(bx + 333, by - 114, 36, 8, "#138808"));
  const trees: number[][] = [];
  for (let i = 0; i < 14; i++) trees.push([a.r(0, 1200), hz + a.r(-6, 8), a.r(16, 34)]);
  a.add(P(circlesPath(trees.filter((t) => t[0] < bx - 20 || t[0] > bx + 380)), "#4f7a3a"));
  // panel rows
  const rowsY = [440, 480, 528, 588, 662, 752];
  rowsY.forEach((y, k) => {
    const s = 0.4 + k * 0.28;
    const h = 30 * s;
    const x0 = -40 + k * 10;
    const x1 = SW + 40 - k * 10;
    const tilt = 12 * s;
    a.add(R(x0, y + 4, x1 - x0, 10 * s, "#000000", op(0.18)));
    let legs = "";
    for (let xx = x0 + 30; xx < x1; xx += 90 * s) legs += `M${f(xx)} ${f(y)}v${f(10 * s)}`;
    a.add(L(legs, "#4a5058", 2 + s));
    const top = `M${f(x0 + tilt)} ${f(y - h)}L${f(x1 - tilt)} ${f(y - h)}L${f(x1)} ${f(y)}L${f(x0)} ${f(y)}Z`;
    a.add(P(top, a.lin([[0, "#2c5aa0"], [0.5, "#1c3f7a"], [1, "#122a55"]])));
    let cells = "";
    const cw = 34 * s;
    for (let xx = x0 + cw; xx < x1; xx += cw) cells += `M${f(xx + tilt * 0.5)} ${f(y - h)}L${f(xx)} ${f(y)}`;
    cells += `M${f(x0 + tilt / 2)} ${f(y - h / 2)}H${f(x1 - tilt / 2)}`;
    a.add(L(cells, "#9cc3ff", 0.8 + s * 0.4, 0.45), L(`M${f(x0 + tilt)} ${f(y - h)}H${f(x1 - tilt)}`, "#d8e8ff", 1.5, 0.8));
    a.add(G(blob(a, 840 - k * 20, y - h / 2, 200 + k * 30, h, "#ffd9a0", 0.55), a.clip(top)));
  });
}

function network(a: Art): void {
  a.add(R(0, 0, SW, SH, a.rad([[0, "#10265a"], [1, "#040a1c"]], 0.45, 0.5, 0.75)));
  const cx = 540;
  const cy = 410;
  const pts: Pt[] = [];
  const ph = [a.r(0, 6), a.r(0, 6), a.r(0, 6)];
  for (let i = 0; i < 26; i++) {
    const t = (i / 26) * Math.PI * 2;
    const r = 280 * (1 + 0.16 * Math.sin(2 * t + ph[0]) + 0.1 * Math.sin(3 * t + ph[1]) + 0.07 * Math.sin(5 * t + ph[2]) + a.r(-0.04, 0.04));
    pts.push([cx + Math.cos(t) * r * 1.05, cy + Math.sin(t) * r * 0.92]);
  }
  const land = spline(pts);
  const inside = (x: number, y: number): boolean => {
    let c2 = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c2 = !c2;
    }
    return c2;
  };
  a.add(G(P(land, "#2ec9ff"), `${op(0.12)} transform="translate(10 14)"`));
  a.add(P(land, a.lin([[0, "#17407a"], [1, "#0b2148"]], 0, 0, 1, 1)), L(land, "#5fe0ff", 2.5, 0.8));
  let dots = "";
  for (let y = cy - 300; y < cy + 300; y += 18) for (let x = cx - 340; x < cx + 340; x += 18) if (inside(x, y)) dots += `M${x} ${y}h2v2h-2z`;
  a.add(P(dots, "#7fd8ff", op(0.35)));
  const nodes: number[][] = [];
  while (nodes.length < 24) {
    const x = a.r(cx - 300, cx + 300);
    const y = a.r(cy - 260, cy + 260);
    if (inside(x, y) && nodes.every((n) => Math.hypot(n[0] - x, n[1] - y) > 60)) nodes.push([x, y]);
  }
  let links = "";
  nodes.forEach((n, i) => {
    const near = nodes.map((m, j) => [Math.hypot(m[0] - n[0], m[1] - n[1]), j]).filter((d) => d[1] !== i).sort((p, q) => p[0] - q[0]).slice(0, 2);
    for (const [, j] of near) if (j > i || a.rnd() < 0.5) links += `M${f(n[0])} ${f(n[1])}L${f(nodes[j][0])} ${f(nodes[j][1])}`;
  });
  a.add(L(links, "#5fe0ff", 1.6, 0.55));
  const hub = nodes.reduce((b, n) => (Math.hypot(n[0] - cx, n[1] - cy) < Math.hypot(b[0] - cx, b[1] - cy) ? n : b));
  for (const r of [40, 70, 105]) a.add(C(hub[0], hub[1], r, "none", `${sk("#9ff3ff", 1.5, 0.5)} stroke-dasharray="${r / 6} ${r / 10}"`));
  for (const n of nodes) {
    const big = n === hub ? 2 : a.rnd() < 0.3 ? 1.4 : 1;
    a.add(blob(a, n[0], n[1], 20 * big, 20 * big, "#5fe0ff", 0.6), C(n[0], n[1], 4.5 * big, "#e8fdff"));
  }
  // AI chip
  const kx = 960;
  const ky = 190;
  a.add(L(`M${f(hub[0])} ${f(hub[1])}L${f(hub[0] + 120)} ${f(hub[1] - 120)}L${kx - 70} ${ky + 40}`, "#ff6ad5", 2, 0.7, `stroke-dasharray="6 6"`));
  let pins = "";
  for (let i = -3; i <= 3; i++) pins += `M${kx + i * 15} ${ky - 62}v-18M${kx + i * 15} ${ky + 62}v18M${kx - 62} ${ky + i * 15}h-18M${kx + 62} ${ky + i * 15}h18`;
  a.add(blob(a, kx, ky, 150, 150, "#ff6ad5", 0.3), L(pins, "#9ff3ff", 4), R(kx - 62, ky - 62, 124, 124, a.lin([[0, "#22306a"], [1, "#121a40"]]), `rx="14" ${sk("#9ff3ff", 3)}`));
  a.add(R(kx - 44, ky - 44, 88, 88, "none", `rx="8" ${sk("#ff6ad5", 2, 0.8)}`));
  a.add(L(`M${kx - 30} ${ky + 24}L${kx - 14} ${ky - 24}L${kx + 2} ${ky + 24}M${kx - 24} ${ky + 8}H${kx - 4}M${kx + 22} ${ky - 24}V${ky + 24}`, "#e8fdff", 7));
  for (const o of [0.25, 0.45, 0.7]) {
    const ps: number[][] = [];
    for (let i = 0; i < 20; i++) ps.push([Math.round(a.r(0, 1200)), Math.round(a.r(0, 800)), a.r(0.8, 2.2)]);
    a.add(P(circlesPath(ps), "#9fdcff", op(o)));
  }
}

function conference(a: Art): void {
  a.add(R(0, 0, SW, SH, "#07080f"));
  a.add(R(220, 70, 760, 330, "#0d0f1c", `rx="6"`), R(232, 82, 736, 306, a.lin([[0, "#3b1f7a"], [0.5, "#1f3fa8"], [1, "#0e8fc4"]], 0, 0, 1, 1)));
  a.add(L("M232 300C360 220 480 360 620 260S860 200 968 240", "#9ff3ff", 4, 0.8), L("M232 330C380 270 500 380 640 300S870 250 968 290", "#ff8ad8", 3, 0.6));
  for (let i = 0; i < 30; i++) a.add(C(a.r(240, 960), a.r(90, 380), a.r(1.5, 4), "#ffffff", op(a.r(0.2, 0.7))));
  a.add(C(600, 190, 54, "none", sk("#ffffff", 5, 0.85)), C(600, 190, 30, "#ffffff", op(0.85)));
  a.add(R(40, 120, 150, 230, "#1f3fa8", op(0.8)), R(1010, 120, 150, 230, "#1f3fa8", op(0.8)));
  a.add(blob(a, 600, 260, 520, 260, "#3d6bff", 0.35));
  // stage
  a.add(R(0, 470, SW, 80, a.lin([[0, "#1b1d2e"], [1, "#0c0d18"]])), R(0, 470, SW, 4, "#5fd8ff"));
  for (const sx of [300, 600, 900]) {
    a.add(P(polyD([[sx - 12, 0], [sx + 12, 0], [sx + 140, 500], [sx - 140, 500]]), a.lin([[0, "#fff4d6", 0.4], [1, "#fff4d6", 0.02]])));
    a.add(E(sx, 486, 150, 18, "#fff4d6", op(0.25)));
  }
  // panel table & speakers
  const seated = [440, 560, 680, 800];
  for (const x of seated) a.add(figure(a, { x, g: 500, h: 180, kind: "man", skin: "#1c1d2b", hair: "#0b0c14", top: "#1c1d2b", sil: "#161826" }));
  a.add(R(400, 430, 450, 50, "#20223a"), R(400, 430, 450, 4, "#ffd27a", op(0.8)));
  a.add(figure(a, { x: 250, g: 476, h: 230, kind: "saree", skin: "#141522", hair: "#0b0c14", top: "#141522", sil: "#141624", pose: "point" }));
  a.add(P("M270 476L284 400L346 400L360 476Z", "#262a48"), R(282, 396, 66, 8, "#5fd8ff"));
  // audience
  const rows = [
    { y: 600, s: 0.75, n: 13 },
    { y: 680, s: 0.95, n: 11 },
    { y: 770, s: 1.2, n: 9 },
  ];
  for (const r of rows) {
    for (let i = 0; i < r.n; i++) {
      const x = (i + 0.5) * (SW / r.n) + a.r(-20, 20);
      a.add(backView(x, r.y, r.s, "#05060b", "#05060b", false, "#3d6bff"));
      if (a.rnd() < 0.12) a.add(R(x + 20 * r.s, r.y - 20 * r.s, 12 * r.s, 20 * r.s, "#bfefff"), blob(a, x + 26 * r.s, r.y - 10 * r.s, 30 * r.s, 30 * r.s, "#9fdcff", 0.5));
    }
  }
  a.add(blob(a, 600, 520, 700, 180, "#5f7bff", 0.12));
}

function citizenService(a: Art): void {
  a.add(R(0, 0, SW, SH, a.lin([[0, "#fbf6ec"], [0.66, "#f1e8d8"], [0.661, "#d9d3c8"], [1, "#c9c2b6"]])));
  a.add(R(0, 300, SW, 16, "#f39a2b"), R(0, 316, SW, 6, "#1f8f87"));
  let tiles = "";
  for (let i = -10; i < 22; i++) tiles += `M${600 + i * 40} 528L${600 + i * 110} 800`;
  for (const y of [560, 610, 680, 780]) tiles += `M0 ${y}H${SW}`;
  a.add(L(tiles, "#b3ab9e", 1.2, 0.6));
  for (const lx of [200, 600, 1000]) a.add(R(lx - 80, 0, 160, 14, "#ffffff"), blob(a, lx, 20, 160, 40, "#fff7d6", 0.8));
  // floating UI cards
  const card = (x: number, y: number, w: number, h: number, accent: string, kind: number): void => {
    a.add(R(x + 6, y + 8, w, h, "#000000", `rx="14" ${op(0.08)}`), R(x, y, w, h, "#ffffff", `rx="14"`), R(x, y, 8, h, accent, `rx="4"`));
    a.add(R(x + 26, y + 22, w * 0.45, 10, "#2c3e50", `rx="5"`), R(x + 26, y + 42, w * 0.6, 8, "#b8c2cc", `rx="4"`));
    if (kind === 0) a.add(C(x + w - 40, y + h / 2, 20, accent), L(`M${x + w - 50} ${y + h / 2}l7 7l13 -14`, "#ffffff", 4));
    else if (kind === 1) a.add(R(x + 26, y + h - 30, w - 52, 10, "#e3e8ee", `rx="5"`), R(x + 26, y + h - 30, (w - 52) * 0.7, 10, accent, `rx="5"`));
    else a.add(C(x + w - 40, y + 34, 18, "#d9e6f2"), C(x + w - 40, y + 30, 7, "#7a8ea3"), R(x + 26, y + h - 30, 60, 14, accent, `rx="7"`));
  };
  card(90, 60, 250, 110, "#1f8f87", 0);
  card(470, 40, 260, 120, "#f39a2b", 1);
  card(860, 70, 250, 110, "#3a6fd8", 2);
  // counter
  a.add(figure(a, { x: 230, g: 600, h: 300, kind: "woman", skin: "#a26a48", hair: "#1c1513", top: "#3a6fd8", bottom: "#2c3e50", pose: "down" }));
  a.add(R(60, 470, 360, 26, "#e9e3d6"), R(70, 496, 340, 150, "#1f8f87"), R(70, 496, 340, 10, "#16706a"));
  a.add(R(250, 400, 120, 76, "#23313f", `rx="6"`), R(258, 408, 104, 58, "#8fe0ff"), R(302, 476, 16, 10, "#23313f"));
  a.add(C(140, 570, 26, "#ffffff", op(0.9)), P("M128 570l8 8l16 -16", "none", sk("#1f8f87", 5)));
  // kiosk
  a.add(R(1000, 360, 120, 300, "#2c3e50", `rx="18"`), R(1014, 380, 92, 150, a.lin([[0, "#bff2ff"], [1, "#6fc7f0"]]), `rx="6"`));
  a.add(R(1024, 396, 72, 12, "#ffffff", `rx="6"`), R(1024, 418, 50, 8, "#ffffff", `rx="4" ${op(0.7)}`), R(1024, 470, 30, 30, "#f39a2b", `rx="6"`), R(1062, 470, 30, 30, "#1f8f87", `rx="6"`));
  a.add(R(1030, 560, 60, 8, "#111a22", `rx="4"`), R(1040, 600, 40, 26, "#3d5368", `rx="4"`));
  // queue
  const people: Fig[] = [
    { x: 500, g: 690, h: 300, kind: "saree", skin: "#9a6242", hair: "#1c1513", top: "#c2185b", border: "#ffc94a", pallu: "head" },
    { x: 610, g: 700, h: 330, kind: "man", skin: "#8a5a3c", hair: "#2a201b", top: "#f2efe6", bottom: "#c9b48a", cap: "#ffffff" },
    { x: 720, g: 704, h: 310, kind: "woman", skin: "#b07850", hair: "#1c1513", top: "#2a9d8f", bottom: "#f2efe6", pose: "phone" },
    { x: 825, g: 712, h: 340, kind: "man", skin: "#9a6242", hair: "#1c1513", top: "#5b7bd5", bottom: "#2c3e50", pose: "hold" },
    { x: 935, g: 720, h: 230, kind: "woman", skin: "#a87048", hair: "#1c1513", top: "#f39a2b", bottom: "#7a2f3a" },
  ];
  for (const p of people) a.add(figure(a, p));
}

function cyber(a: Art): void {
  a.add(R(0, 0, SW, SH, a.rad([[0, "#141a44"], [1, "#04060f"]], 0.5, 0.5, 0.7)));
  const hr = 46;
  let hex = "";
  let hexFill = "";
  let hexFill2 = "";
  for (let row = 0; row < 13; row++) {
    for (let col = 0; col < 16; col++) {
      const x = col * hr * 1.732 + (row % 2 ? hr * 0.866 : 0);
      const y = row * hr * 1.5;
      const d = `M${Math.round(x)} ${Math.round(y - hr)}l40 23v46l-40 23l-40 -23v-46z`;
      hex += d;
      const r = a.rnd();
      if (r < 0.05) hexFill += d;
      else if (r < 0.08) hexFill2 += d;
    }
  }
  a.add(L(hex, "#3fd2ff", 1, 0.12), P(hexFill, "#3fd2ff", op(0.1)), P(hexFill2, "#ff4fd8", op(0.12)));
  let tr = "";
  let tr2 = "";
  let ends = "";
  for (let i = 0; i < 22; i++) {
    const ang = (i / 22) * Math.PI * 2 + a.r(-0.1, 0.1);
    let x = 600 + Math.cos(ang) * 190;
    let y = 400 + Math.sin(ang) * 190;
    let d = `M${f(x)} ${f(y)}`;
    for (let k = 0; k < 3; k++) {
      const len = a.r(60, 160);
      const dir = Math.round((ang + a.r(-0.6, 0.6)) / (Math.PI / 4)) * (Math.PI / 4);
      x += Math.cos(dir) * len;
      y += Math.sin(dir) * len;
      d += `L${f(x)} ${f(y)}`;
    }
    if (i % 3 === 0) tr2 += d;
    else tr += d;
    ends += `M${f(x - 5)} ${f(y)}a5 5 0 1 0 10 0a5 5 0 1 0 -10 0`;
  }
  a.add(L(tr, "#3fd2ff", 2.5, 0.7), L(tr2, "#ff4fd8", 2.5, 0.7), P(ends, "#e8fdff"));
  for (const [r, c, o] of [[250, "#3fd2ff", 0.5], [300, "#ff4fd8", 0.3], [350, "#3fd2ff", 0.2]] as const) a.add(C(600, 400, r, "none", `${sk(c, 2, o)} stroke-dasharray="${r / 8} ${r / 14}"`));
  a.add(blob(a, 600, 400, 300, 300, "#2a6dff", 0.5));
  const shield = "M600 210C660 250 720 262 770 262C770 420 720 520 600 590C480 520 430 420 430 262C480 262 540 250 600 210Z";
  a.add(P(shield, a.lin([[0, "#1d3a8a"], [1, "#0a1440"]])), L(shield, "#7ff0ff", 6));
  a.add(G(L(shield, "#ff4fd8", 2, 0.8), `transform="translate(600 400) scale(0.86) translate(-600 -400)"`));
  a.add(P("M600 225C655 262 712 274 757 276C755 300 750 320 744 340L600 400Z", "#ffffff", op(0.08)));
  a.add(L("M562 400V362C562 336 580 320 600 320C620 320 638 336 638 362V400", "#cfe9ff", 14));
  a.add(R(540, 394, 120, 100, a.lin([[0, "#ffd36e"], [1, "#e09a2a"]]), `rx="14"`), C(600, 434, 13, "#3a2a10"), R(594, 438, 12, 32, "#3a2a10", `rx="5"`));
  for (let i = 0; i < 40; i++) a.add(R(a.r(0, 1200), a.r(0, 800), 3, a.r(6, 18), a.pick(["#3fd2ff", "#ff4fd8"]), op(a.r(0.2, 0.6))));
}

function csrCommunity(a: Art): void {
  const hz = 420;
  a.add(R(0, 0, SW, hz + 20, a.lin([[0, "#bfe2ef"], [1, "#f7ecd0"]])));
  a.add(blob(a, 260, 140, 180, 180, "#fff6d6", 0.8));
  a.add(P(spline([[-40, hz + 20, 1], [-40, hz - 30], [260, hz - 60], [520, hz - 34], [800, hz - 70], [1240, hz - 40], [1240, hz + 20, 1]]), "#a9c8a8"));
  // trees
  const tree = (x: number, base: number, s: number, c1: string, c2: string): string =>
    R(x - 6 * s, base - 90 * s, 12 * s, 90 * s, "#6b4a2e") +
    P(circlesPath([[x - 40 * s, base - 110 * s, 40 * s], [x + 30 * s, base - 120 * s, 46 * s], [x - 5 * s, base - 160 * s, 50 * s]]), c1) +
    P(circlesPath([[x - 20 * s, base - 150 * s, 26 * s], [x + 30 * s, base - 130 * s, 22 * s]]), c2, op(0.7));
  a.add(tree(120, hz + 30, 1.4, "#3f7a3f", "#6aa452"), tree(1080, hz + 40, 1.6, "#2f6a3a", "#5c9a4a"), tree(900, hz + 10, 0.9, "#4f8a45", "#7ab35a"), tree(330, hz + 10, 0.8, "#4f8a45", "#7ab35a"));
  // hut
  a.add(R(620, hz - 50, 120, 70, "#d9a86a"), P(`M600 ${hz - 46}L680 ${hz - 100}L760 ${hz - 46}Z`, "#8a5a2c"), R(668, hz - 20, 24, 40, "#5a3a20"));
  a.add(R(0, hz + 10, SW, SH - hz, a.lin([[0, "#b9c96a"], [1, "#6f9a3e"]])));
  let grass = "";
  for (let i = 0; i < 90; i++) {
    const x = a.r(0, 1200);
    const y = a.r(hz + 40, 800);
    grass += `M${f(x)} ${f(y)}l${f(a.r(-4, 4))} ${f(-a.r(8, 18))}`;
  }
  a.add(L(grass, "#4f7a2c", 2, 0.6));
  const women: [string, string, string, Fig["pose"], Fig["pallu"]][] = [
    ["#e0457b", "#ffd166", "#9a6242", "hold", "head"],
    ["#f28c28", "#2a9d8f", "#b07850", "down", "shoulder"],
    ["#2a9d8f", "#f2c14e", "#8a5a3c", "phone", "head"],
    ["#7b3fa0", "#ffd166", "#a87048", "down", "shoulder"],
    ["#d62839", "#ffd166", "#9a6242", "hold", "head"],
    ["#f2c14e", "#c2185b", "#b98058", "down", "shoulder"],
    ["#1f7a4c", "#ff7aa8", "#8f5d3e", "tablet", "head"],
  ];
  const xs = [230, 350, 470, 590, 710, 830, 950];
  const order = [1, 3, 5, 0, 2, 4, 6];
  for (const i of order) {
    const [top, border, skin, pose, pallu] = women[i];
    const back = i % 2 === 1;
    a.add(figure(a, { x: xs[i] + a.r(-10, 10), g: back ? 660 : 720, h: back ? 330 : 360, kind: "saree", skin, hair: "#1c1513", top, border, pose, pallu, glow: "#bff4ff" }));
  }
}

function aiAbstract(a: Art): void {
  a.add(R(0, 0, SW, SH, a.lin([[0, "#0a0f3a"], [0.55, "#2a1a6e"], [1, "#6a35b8"]], 0, 0, 1, 1)));
  for (let k = 0; k < 7; k++) {
    const y0 = 120 + k * 90;
    const amp = a.r(40, 110);
    a.add(L(`M-20 ${f(y0)}C300 ${f(y0 - amp)} 500 ${f(y0 + amp)} 760 ${f(y0)}S1100 ${f(y0 - amp)} 1220 ${f(y0 + 20)}`, k % 2 ? "#7fd8ff" : "#c38bff", 2 + (k % 3), 0.35));
  }
  const bx = 520;
  const by = 400;
  const brain = spline([[bx - 250, by + 30], [bx - 240, by - 80], [bx - 160, by - 190], [bx - 30, by - 220], [bx + 100, by - 200], [bx + 210, by - 120], [bx + 240, by], [bx + 200, by + 110], [bx + 100, by + 150], [bx + 40, by + 200], [bx - 40, by + 170], [bx - 160, by + 150], [bx - 230, by + 100]]);
  a.add(blob(a, bx, by, 380, 320, "#7a5cff", 0.45));
  a.add(P(brain, "#1b1f6a", op(0.55)), L(brain, "#9fdcff", 3, 0.9));
  let gy = "";
  for (let i = 0; i < 9; i++) {
    const x0 = bx - 200 + a.r(0, 40);
    const y0 = by - 160 + i * 36;
    gy += `M${f(x0)} ${f(y0)}c30 -26 60 26 90 0s60 26 90 0`;
  }
  a.add(G(L(gy, "#c38bff", 3, 0.6), a.clip(brain)));
  const nodes: number[][] = [];
  for (let i = 0; i < 26; i++) nodes.push([a.r(bx - 200, bx + 210), a.r(by - 180, by + 140)]);
  let links = "";
  nodes.forEach((n, i) => {
    for (let j = i + 1; j < nodes.length; j++) if (Math.hypot(nodes[j][0] - n[0], nodes[j][1] - n[1]) < 110) links += `M${f(n[0])} ${f(n[1])}L${f(nodes[j][0])} ${f(nodes[j][1])}`;
  });
  a.add(G(L(links, "#9fdcff", 1.4, 0.6) + P(circlesPath(nodes.map((n) => [n[0], n[1], 4])), "#e8f7ff"), a.clip(brain)));
  // traces to chip
  const kx = 930;
  const ky = 400;
  let tr = "";
  for (let i = -3; i <= 3; i++) tr += `M${bx + 200} ${by + i * 30}H${f(780 + Math.abs(i) * 10)}L${kx - 90} ${ky + i * 20}`;
  a.add(L(tr, "#7fd8ff", 2.5, 0.8));
  let pins = "";
  for (let i = -3; i <= 3; i++) pins += `M${kx + i * 20} ${ky - 90}v-20M${kx + i * 20} ${ky + 90}v20M${kx + 90} ${ky + i * 20}h20`;
  a.add(blob(a, kx, ky, 170, 170, "#ff7ad9", 0.35), L(pins, "#c38bff", 5));
  a.add(R(kx - 90, ky - 90, 180, 180, a.lin([[0, "#3a2a9a"], [1, "#151550"]], 0, 0, 1, 1), `rx="22" ${sk("#9fdcff", 3)}`), R(kx - 54, ky - 54, 108, 108, a.lin([[0, "#7fd8ff"], [1, "#c38bff"]], 0, 0, 1, 1), `rx="12" ${op(0.9)}`));
  a.add(P(circlesPath([[kx, ky, 22]]), "#ffffff", op(0.9)), C(kx, ky, 40, "none", sk("#ffffff", 3, 0.7)));
  for (const [c2, o] of [["#ffffff", 0.7], ["#9fdcff", 0.5], ["#ff9ae6", 0.4], ["#ffffff", 0.3]] as const) {
    const ps: number[][] = [];
    for (let i = 0; i < 20; i++) ps.push([Math.round(a.r(0, 1200)), Math.round(a.r(0, 800)), a.r(0.8, 2.6)]);
    a.add(P(circlesPath(ps), c2, op(o)));
  }
}

/* ------------------------------------------------------------------ */
/* Full-page advertisements & cover art (820 x 1112)                   */
/* ------------------------------------------------------------------ */

const PW = 820;
const PH = 1112;

function adCloud(a: Art): void {
  a.add(R(0, 0, PW, PH, a.lin([[0, "#06173a"], [0.55, "#0a2856"], [1, "#04112a"]])));
  a.add(blob(a, 410, 380, 420, 320, "#1fb6ff", 0.35));
  // perspective grid floor
  let grid = "";
  for (let i = -12; i <= 12; i++) grid += `M${410 + i * 18} 560L${410 + i * 90} 700`;
  for (const y of [575, 595, 622, 657, 700]) grid += `M0 ${y}H${PW}`;
  a.add(G(L(grid, "#3fd2ff", 1, 0.35), a.clip("M0 556H820V700H0Z")));
  // government building
  let gov = `M250 600V520H570V600ZM230 520L410 470L590 520ZM350 470Q410 380 470 470ZM405 392h10v-30h-10z`;
  for (let i = 0; i < 7; i++) gov += `M${272 + i * 44} 590V530h14v60z`;
  a.add(P(gov, "#0f3a70"), P(gov, "none", sk("#7ff0ff", 2, 0.8)));
  // data streams to the cloud
  let streams = "";
  for (let i = -3; i <= 3; i++) streams += `M${410 + i * 40} 470C${410 + i * 40} 420 ${410 + i * 22} 380 ${410 + i * 22} 330`;
  a.add(L(streams, "#7ff0ff", 2, 0.6, `stroke-dasharray="4 8"`));
  // cloud
  const cloudD = `M210 330C170 330 150 300 150 270C150 232 182 206 220 210C226 160 270 126 320 130C350 90 400 74 450 92C500 80 556 112 570 160C620 150 668 190 666 240C700 252 712 290 694 316C684 330 664 334 650 330Z`;
  a.add(G(P(cloudD, "#000000"), `${op(0.25)} transform="translate(0 16)"`));
  a.add(P(cloudD, a.lin([[0, "#ffffff"], [0.6, "#bfeaff"], [1, "#58c8f5"]])));
  a.add(blob(a, 330, 200, 150, 70, "#ffffff", 0.7));
  // shield in cloud
  const sh = "M410 160C440 180 470 186 494 186C494 260 466 300 410 330C354 300 326 260 326 186C350 186 380 180 410 160Z";
  a.add(P(sh, a.lin([[0, "#0e3c86"], [1, "#071d48"]])), L(sh, "#1fb6ff", 4), L("M372 244l26 26l46 -52", "#7ff0ff", 10));
  // orbit nodes
  for (const [x, y] of [[120, 420], [700, 420], [150, 140], [690, 120], [90, 280], [740, 280]]) {
    a.add(L(`M${x} ${y}L${x < 410 ? 230 : 590} ${y < 300 ? 220 : 330}`, "#3fd2ff", 1.2, 0.4), blob(a, x, y, 26, 26, "#3fd2ff", 0.6), C(x, y, 6, "#e8fdff"));
  }
  // logo
  a.add(P("M70 92C56 92 50 82 50 74C50 64 58 58 68 59C70 46 82 38 94 40C102 30 118 30 126 40C138 38 148 48 146 60C154 62 158 70 154 80C152 88 146 92 140 92Z", "#7ff0ff"));
  a.add(L("M88 74l8 8l16 -16", "#06173a", 5), T(170, 80, 30, 700, "#ffffff", "NimbusGov"), T(334, 80, 30, 300, "#7ff0ff", "Cloud"));
  a.add(R(652, 52, 118, 32, "none", `rx="16" ${sk("#7ff0ff", 1.5, 0.7)}`), T(711, 73, 13, 700, "#7ff0ff", "MADE IN INDIA", `text-anchor="middle" letter-spacing="1"`));
  // copy
  a.add(T(60, 790, 66, 800, "#ffffff", "Sovereign cloud."), T(60, 862, 66, 800, "#36d1ff", "Citizen-scale."));
  a.add(T(60, 912, 21, 400, "#c9dcf2", "Secure, compliant infrastructure hosted in India for"), T(60, 940, 21, 400, "#c9dcf2", "ministries, states and smart cities — scaling from a"));
  a.add(T(60, 968, 21, 400, "#c9dcf2", "single department to a billion citizen transactions."));
  const feats = ["Data stays in India", "24×7 security ops", "99.99% uptime SLA"];
  feats.forEach((t, i) => {
    const x = 60 + i * 240;
    a.add(C(x + 10, 1010, 10, "#36d1ff"), L(`M${x + 5} 1010l4 4l7 -8`, "#06173a", 2.5), T(x + 28, 1016, 17, 700, "#ffffff", t));
  });
  a.add(R(0, 1046, PW, 66, "#36d1ff"), T(60, 1086, 20, 700, "#06173a", "nimbusgov.example"), T(760, 1086, 17, 400, "#06173a", "Book a sovereign-cloud briefing  →", `text-anchor="end"`));
}

function adBank(a: Art): void {
  const gold = "#e3b34c";
  a.add(R(0, 0, PW, PH, a.lin([[0, "#0c3a2c"], [1, "#062018"]])));
  // illustration panel
  a.add(R(40, 130, 740, 560, a.lin([[0, "#f7d98c"], [0.5, "#f3b85e"], [1, "#e58f3c"]]), `rx="24"`));
  const clipD = "M64 130H756Q780 130 780 154V666Q780 690 756 690H64Q40 690 40 666V154Q40 130 64 130Z";
  let ill = "";
  ill += blob(a, 560, 400, 260, 180, "#fff2c8", 0.9) + C(560, 420, 60, "#fff4d0");
  ill += P(spline([[20, 700, 1], [20, 420], [160, 330], [300, 400], [430, 300], [600, 380], [800, 320], [800, 700, 1]]), "#7d9a5a", op(0.85));
  ill += P(spline([[20, 700, 1], [20, 480], [200, 430], [380, 480], [560, 420], [800, 470], [800, 700, 1]]), "#3f7a45");
  ill += P(spline([[20, 700, 1], [20, 560], [260, 520], [520, 560], [800, 530], [800, 700, 1]]), "#22593a");
  // village houses
  for (const [hx, hy, s] of [[120, 540, 1], [210, 530, 0.8], [640, 535, 0.9]] as const) {
    ill += R(hx, hy - 40 * s, 70 * s, 40 * s, "#f1e2c4") + P(`M${hx - 8 * s} ${hy - 38 * s}L${hx + 35 * s} ${hy - 70 * s}L${hx + 78 * s} ${hy - 38 * s}Z`, "#b5522f") + R(hx + 28 * s, hy - 22 * s, 14 * s, 22 * s, "#6b4426");
  }
  ill += figure(a, { x: 300, g: 690, h: 330, kind: "saree", skin: "#9a6242", hair: "#1c1513", top: "#c2185b", border: gold, pose: "phone", pallu: "head", glow: "#bff4ff" });
  ill += figure(a, { x: 190, g: 700, h: 300, kind: "man", skin: "#8a5a3c", hair: "#1c1513", top: "#f2efe6", bottom: "#d9d2c0", turban: "#f2efe6", pose: "down" });
  // phone mock-up
  ill += R(486, 330, 190, 330, "#1b2a24", `rx="26"`) + R(498, 350, 166, 290, "#f6fbf8", `rx="14"`);
  ill += R(514, 370, 90, 12, "#0c3a2c", `rx="6"`) + C(581, 450, 38, "#1f9d63") + L("M563 450l12 12l24 -26", "#ffffff", 8);
  ill += R(526, 510, 110, 14, "#0c3a2c", `rx="7"`) + R(540, 534, 82, 10, "#9fb5aa", `rx="5"`) + R(514, 586, 134, 36, gold, `rx="18"`);
  a.add(G(ill, a.clip(clipD)));
  // logo
  a.add(C(80, 70, 30, gold), P("M58 82L74 56L84 70L92 60L104 82Z", "#0c3a2c"), C(92, 52, 5, "#0c3a2c"));
  a.add(T(124, 66, 28, 800, "#ffffff", "Sahyadri"), T(124, 92, 16, 400, gold, "CO-OPERATIVE BANK", `letter-spacing="3"`));
  a.add(T(780, 78, 15, 400, "#bcd3c6", "Since 1962 · Member-owned", `text-anchor="end"`));
  // copy
  a.add(T(48, 770, 56, 800, "#ffffff", "Banking that reaches"), T(48, 834, 56, 800, gold, "every gram panchayat."));
  a.add(T(48, 884, 21, 400, "#cfe0d6", "Open an account, send money and get crop credit without"), T(48, 912, 21, 400, "#cfe0d6", "leaving your village — through your local Bank Mitra and"));
  a.add(T(48, 940, 21, 400, "#cfe0d6", "the Sahyadri mobile app, in your own language."));
  const feats = ["Doorstep Bank Mitra", "UPI & micro-ATM", "Kisan credit in minutes"];
  feats.forEach((t, i) => {
    const x = 48 + i * 248;
    a.add(R(x, 970, 232, 46, "none", `rx="23" ${sk(gold, 1.5, 0.8)}`), C(x + 24, 993, 9, gold), T(x + 42, 999, 16, 700, "#ffffff", t));
  });
  a.add(R(0, 1046, PW, 66, gold), T(48, 1086, 20, 800, "#0c3a2c", "sahyadribank.example"), T(772, 1086, 17, 400, "#0c3a2c", "Visit your nearest branch or Bank Mitra", `text-anchor="end"`));
}

function coverArt(a: Art): void {
  a.add(R(0, 0, PW, PH, a.lin([[0, "#0b2350"], [0.35, "#1f4f8f"], [0.6, "#6f86b8"], [0.75, "#f2b07a"], [0.86, "#ffcf8a"], [1, "#f08a4b"]])));
  a.add(blob(a, 410, 800, 520, 300, "#ffd99a", 0.85), blob(a, 410, 780, 160, 140, "#fff4d6", 0.9));
  // constellation network in the sky (sparser near the top)
  const stars: number[][] = [];
  for (let i = 0; i < 46; i++) {
    const y = 200 + Math.pow(a.rnd(), 0.6) * 520;
    stars.push([a.r(30, 790), y]);
  }
  let links = "";
  stars.forEach((s, i) => {
    stars.forEach((t, j) => {
      if (j > i && Math.hypot(s[0] - t[0], s[1] - t[1]) < 105) links += `M${f(s[0])} ${f(s[1])}L${f(t[0])} ${f(t[1])}`;
    });
  });
  a.add(L(links, "#bfe9ff", 1.1, 0.45));
  for (const s of stars) a.add(blob(a, s[0], s[1], 12, 12, "#bfe9ff", 0.5), C(s[0], s[1], a.r(1.5, 3.2), "#ffffff", op(0.9)));
  for (let i = 0; i < 40; i++) a.add(C(a.r(0, 820), a.r(0, 420), a.r(0.6, 1.6), "#ffffff", op(a.r(0.2, 0.6))));
  // monument (Indo-Saracenic)
  const base = 1000;
  const mc = "#2a1d3c";
  let m = "";
  m += `M150 ${base}V860H670V${base}Z`;
  m += `M300 860V760H520V860Z`;
  m += `M318 760Q318 690 410 650Q502 690 502 760Z`;
  m += `M404 652v-36h12v36zM410 600a8 8 0 1 0 0.1 0z`;
  for (const tx of [210, 610]) {
    m += `M${tx - 34} 860V770h68v90Z`;
    m += `M${tx - 38} 772Q${tx - 38} 734 ${tx} 714Q${tx + 38} 734 ${tx + 38} 772Z`;
    m += `M${tx - 3} 716v-26h6v26z`;
  }
  for (const tx of [120, 700]) m += `M${tx - 14} ${base}V800h28V${base}ZM${tx - 18} 802Q${tx} 770 ${tx + 18} 802Z`;
  for (const cx2 of [340, 480]) m += `M${cx2 - 18} 760V740h36v20ZM${cx2 - 20} 742Q${cx2} 716 ${cx2 + 20} 742Z`;
  a.add(P(m, a.lin([[0, "#3a2850"], [1, mc]])));
  // arches cut-outs glowing
  let arches = "";
  arches += `M370 ${base}V900Q370 862 410 846Q450 862 450 900V${base}Z`;
  for (const ax of [190, 250, 570, 630]) arches += `M${ax - 18} ${base - 30}V905Q${ax - 18} 884 ${ax} 874Q${ax + 18} 884 ${ax + 18} 905V${base - 30}Z`;
  for (const ax of [330, 490]) arches += `M${ax - 14} 850V800Q${ax - 14} 784 ${ax} 776Q${ax + 14} 784 ${ax + 14} 800V850Z`;
  a.add(P(arches, a.lin([[0, "#ffd58a"], [1, "#f08a4b"]]), op(0.9)));
  a.add(L(`M150 860H670M300 760H520`, "#ffcf8a", 2, 0.5));
  // palms
  const palm = (x: number, y: number, h: number, lean: number): string => {
    const tx = x + lean;
    const ty = y - h;
    let s = L(`M${x} ${y}Q${x + lean * 0.2} ${y - h * 0.6} ${tx} ${ty}`, "#1a1226", 9);
    const fronds: [number, number][] = [[-96, 46], [-88, 6], [-56, -30], [-14, -44], [30, -40], [70, -14], [96, 30], [80, 64], [-70, 70]];
    for (const [dx, dy] of fronds) {
      const ex = tx + dx;
      const ey = ty + dy;
      const mx = tx + dx * 0.5;
      const my = ty + Math.min(dy, 0) * 0.9 - 26;
      s += P(`M${f(tx)} ${f(ty)}Q${f(mx)} ${f(my - 8)} ${f(ex)} ${f(ey)}Q${f(mx)} ${f(my + 12)} ${f(tx)} ${f(ty + 5)}Z`, "#1a1226");
    }
    s += C(tx, ty + 4, 8, "#1a1226");
    return s;
  };
  a.add(palm(60, 1060, 300, 20), palm(130, 1060, 230, -16), palm(760, 1060, 320, -24), palm(690, 1060, 220, 14));
  // ground & citizens with phones
  a.add(R(0, base - 6, PW, PH - base + 6, a.lin([[0, "#3a2546"], [1, "#160d1f"]])));
  const people: [number, number, Fig["kind"], Fig["pose"]][] = [
    [90, 250, "man", "phone"], [200, 220, "saree", "down"], [300, 270, "woman", "phone"], [520, 260, "man", "tablet"], [620, 230, "saree", "phone"], [730, 280, "man", "down"],
  ];
  for (const [x, h, kind, pose] of people) a.add(figure(a, { x, g: PH + 30, h, kind, skin: "#120a18", hair: "#120a18", top: "#120a18", sil: "#140c1c", pose, glow: "#9ff3ff" }));
  a.add(R(0, 0, PW, PH, a.lin([[0, "#000000", 0.25], [0.3, "#000000", 0], [1, "#000000", 0]])));
}

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

const CREDIT = "PressFlow sample artwork";

interface Entry {
  meta: Omit<SampleArtwork, "credit" | "width" | "height"> & { aspect: "portrait" | "scene" | "page" };
  draw: (a: Art) => void;
}

const DIMS = {
  portrait: { w: 800, h: 1000, W: 2400, H: 3000 },
  scene: { w: 1200, h: 800, W: 3000, H: 2000 },
  page: { w: 820, h: 1112, W: 2460, H: 3336 },
} as const;

const ENTRIES: Entry[] = [
  {
    meta: { id: "img-portrait-01", name: "Portrait — senior official in bandhgala", subject: "portrait", aspect: "portrait", alt: "Illustrated head-and-shoulders portrait of a man in his fifties with greying side-parted hair, wearing a navy bandhgala jacket over a white kurta collar, in a warm sunlit office." },
    draw: (a) => portrait(a, PORTRAITS["img-portrait-01"]),
  },
  {
    meta: { id: "img-portrait-02", name: "Portrait — administrator in teal saree", subject: "portrait", aspect: "portrait", alt: "Illustrated portrait of a woman in her forties with black hair in a low bun and a small bindi, wearing a teal silk saree with a gold border draped over her shoulder, against a cool blue-grey backdrop." },
    draw: (a) => portrait(a, PORTRAITS["img-portrait-02"]),
  },
  {
    meta: { id: "img-portrait-03", name: "Portrait — technology founder", subject: "portrait", aspect: "portrait", alt: "Illustrated portrait of a bearded man in his thirties with short styled black hair, wearing a charcoal blazer over an open-collar light blue shirt, in a modern office with glowing screens behind him." },
    draw: (a) => portrait(a, PORTRAITS["img-portrait-03"]),
  },
  {
    meta: { id: "img-portrait-04", name: "Portrait — programme director in maroon kurta", subject: "portrait", aspect: "portrait", alt: "Illustrated portrait of a confident woman in her thirties with shoulder-length dark hair, wearing a maroon kurta with a mustard dupatta, against a soft green-grey background." },
    draw: (a) => portrait(a, PORTRAITS["img-portrait-04"]),
  },
  {
    meta: { id: "img-portrait-05", name: "Portrait — senior advisor with bookshelf", subject: "portrait", aspect: "portrait", alt: "Illustrated portrait of a man in his sixties with white hair and rimless glasses, wearing a dark suit and burgundy tie, in front of a softly blurred bookshelf." },
    draw: (a) => portrait(a, PORTRAITS["img-portrait-05"]),
  },
  {
    meta: { id: "img-portrait-06", name: "Portrait — policy researcher with pashmina", subject: "portrait", aspect: "portrait", alt: "Illustrated portrait of a woman in her fifties with short grey-streaked hair and glasses, wearing a deep red top with a pashmina shawl, against a warm studio gradient." },
    draw: (a) => portrait(a, PORTRAITS["img-portrait-06"]),
  },
  {
    meta: { id: "img-skyline", name: "Coastal skyline at dusk", subject: "scene", aspect: "scene", alt: "Illustration of a Mumbai-style coastal skyline at dusk: lit towers against an orange-violet sky, a cable-stayed sea-link bridge across the bay, a curve of promenade lights and the sunset reflected in the sea." },
    draw: skyline,
  },
  {
    meta: { id: "img-datacentre", name: "Data centre aisle", subject: "scene", aspect: "scene", alt: "Illustration of a data centre aisle with rows of server racks receding in perspective, blue and cyan status LEDs, ceiling light strips and a glossy reflective floor." },
    draw: datacentre,
  },
  {
    meta: { id: "img-farm-drone", name: "Drone over farm fields", subject: "scene", aspect: "scene", alt: "Illustration of green farm fields in rows below hills, with a quadcopter drone scanning the crop with a cyan beam while a farmer in a saffron turban checks the readings on his phone." },
    draw: farmDrone,
  },
  {
    meta: { id: "img-classroom", name: "Digital classroom", subject: "scene", aspect: "scene", alt: "Illustration of a warmly lit digital classroom: students seen from behind at their desks face a large screen showing bar, line and pie charts while a teacher in a saree points to the data." },
    draw: classroom,
  },
  {
    meta: { id: "img-health", name: "Telemedicine at a rural health centre", subject: "scene", aspect: "scene", alt: "Illustration of a rural health centre in a clean teal and white palette: a doctor appears on a video-call screen while a community health worker with a tablet assists an elderly patient." },
    draw: health,
  },
  {
    meta: { id: "img-solar", name: "Solar rows at sunrise", subject: "scene", aspect: "scene", alt: "Illustration of rows of solar panels in a rural landscape at sunrise, with a small village school building, trees and distant hills under a peach and blue sky." },
    draw: solar,
  },
  {
    meta: { id: "img-network", name: "State data network map", subject: "data", aspect: "scene", alt: "Stylised illustration of an irregular state-like landmass on dark navy, covered with glowing network nodes and links, concentric data rings around a central hub and an AI chip motif." },
    draw: network,
  },
  {
    meta: { id: "img-conference", name: "Conference stage", subject: "event", aspect: "scene", alt: "Illustration of a conference stage with a large LED screen, spotlights, a speaker at a podium and a panel seated at a table, with silhouettes of the audience in the foreground." },
    draw: conference,
  },
  {
    meta: { id: "img-citizen-service", name: "Citizen service centre", subject: "scene", aspect: "scene", alt: "Illustration of a bright citizen service centre: an operator at a counter with a computer, citizens waiting in a queue, a self-service kiosk and floating tablet-style status cards." },
    draw: citizenService,
  },
  {
    meta: { id: "img-cyber", name: "Cybersecurity shield", subject: "abstract", aspect: "scene", alt: "Dark abstract cybersecurity illustration: a glowing shield with a padlock at the centre of radiating circuit traces over a hexagonal grid, with cyan and magenta accents." },
    draw: cyber,
  },
  {
    meta: { id: "img-csr-community", name: "Women's self-help group", subject: "scene", aspect: "scene", alt: "Illustration of a group of village women from a self-help group in colourful sarees standing together in a green field, holding a ledger, a phone and a tablet, with trees and a hut behind them." },
    draw: csrCommunity,
  },
  {
    meta: { id: "img-ai-abstract", name: "Abstract artificial intelligence", subject: "abstract", aspect: "scene", alt: "Abstract illustration of artificial intelligence: a brain outline filled with a glowing neural network, connected by circuit traces to a processor chip, over flowing lines and particles on a blue-violet gradient." },
    draw: aiAbstract,
  },
  {
    meta: { id: "img-ad-cloud", name: "Advertisement — NimbusGov Cloud", subject: "advertisement", aspect: "page", alt: "Full-page advertisement for the fictional NimbusGov Cloud: a glowing cloud with a security shield above a government building on a navy background, headline 'Sovereign cloud. Citizen-scale.' and contact nimbusgov.example." },
    draw: adCloud,
  },
  {
    meta: { id: "img-ad-bank", name: "Advertisement — Sahyadri Co-operative Bank", subject: "advertisement", aspect: "page", alt: "Full-page advertisement for the fictional Sahyadri Co-operative Bank in deep green and gold: a village woman using a phone in front of layered hills, with a mobile payment confirmation, headline 'Banking that reaches every gram panchayat.' and contact sahyadribank.example." },
    draw: adBank,
  },
  {
    meta: { id: "img-cover-art", name: "Cover art — digital governance sunrise", subject: "cover", aspect: "page", alt: "Illustrated magazine cover art: the silhouette of an Indo-Saracenic monument with domes and arches, flanked by palm trees and citizens holding glowing phones, under a sunrise sky overlaid with a constellation-like digital network." },
    draw: coverArt,
  },
];

export const sampleArtworks: SampleArtwork[] = ENTRIES.map((e) => {
  const d = DIMS[e.meta.aspect];
  return { id: e.meta.id, name: e.meta.name, subject: e.meta.subject, width: d.W, height: d.H, alt: e.meta.alt, credit: CREDIT };
});

const ENTRY_BY_ID = new Map<string, Entry>(ENTRIES.map((e) => [e.meta.id, e]));

export function renderSampleSvg(id: string): string {
  const e = ENTRY_BY_ID.get(id);
  if (!e) return "";
  const d = DIMS[e.meta.aspect];
  const a = new Art(id, d.w, d.h, d.W, d.H);
  e.draw(a);
  return a.svg();
}

const SRC_CACHE = new Map<string, string>();

export function getSampleImageSrc(id: string): string {
  const hit = SRC_CACHE.get(id);
  if (hit !== undefined) return hit;
  const svg = renderSampleSvg(id);
  const src = svg ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg) : "";
  if (svg) SRC_CACHE.set(id, src);
  return src;
}
