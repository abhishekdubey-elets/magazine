import type { ParagraphStyle, TextStyle } from "./types";

/** Brand colours for magazine pages (from the Tech Maha Impact print file). */
export const ink = {
  text: "#1f2633",
  navy: "#1d2b4f",
  blue: "#1f4ea1",
  orange: "#e07b24",
  green: "#138a43",
  cream: "#fbf3e6",
  muted: "#5b6475",
  rule: "#c9ced8",
  paper: "#ffffff",
} as const;

/** Rendering scale: CSS pixels per millimetre at 100% zoom. */
export const PX_PER_MM = 4;
export const MM_PER_PT = 0.352778;
export const ptToPx = (pt: number) => pt * MM_PER_PT * PX_PER_MM;

/** Placeholder accent token, resolved to the page's section colour at render time. */
export const ACCENT = "accent";

const s = (id: string, indesignName: string, style: TextStyle): ParagraphStyle => ({ id, indesignName, ...style });

/**
 * House paragraph styles. Each maps to an InDesign paragraph style name so
 * a future integration can apply styles rather than local formatting.
 */
export const paragraphStyles: Record<string, ParagraphStyle> = Object.fromEntries(
  [
    s("body", "Body/Justified", { font: "body", size: 9, leading: 12, weight: 400, color: ink.text, align: "justify", spaceAfter: 6 }),
    s("body-light", "Body/Message", { font: "body", size: 9.5, leading: 13.5, weight: 300, color: ink.text, align: "left", spaceAfter: 7 }),
    s("intro", "Body/Standfirst", { font: "body", size: 10.5, leading: 14.5, weight: 400, color: ink.text, align: "left" }),
    s("intro-bold", "Body/Standfirst Bold", { font: "body", size: 9.6, leading: 13, weight: 700, color: ACCENT, align: "left" }),
    s("headline-xl", "Head/XL", { font: "headline", size: 40, leading: 40, weight: 800, color: ACCENT, align: "left", tracking: -10 }),
    s("headline-l", "Head/L", { font: "headline", size: 30, leading: 31, weight: 800, color: ACCENT, align: "left", tracking: -10 }),
    s("headline-m", "Head/M", { font: "headline", size: 22, leading: 24, weight: 700, color: ink.navy, align: "left" }),
    s("display", "Display/Bebas", { font: "display", size: 78, leading: 70, weight: 400, color: ACCENT, align: "left", tracking: 10 }),
    s("deck", "Deck", { font: "headline", size: 13, leading: 16.5, weight: 300, color: "#3a4253", align: "left" }),
    s("kicker", "Furniture/Kicker", { font: "body", size: 7.5, leading: 9, weight: 700, color: ACCENT, align: "left", uppercase: true, tracking: 80 }),
    s("running-head", "Furniture/Running Head", { font: "body", size: 7, leading: 9, weight: 400, color: "#3a4253", align: "left", uppercase: true, tracking: 40 }),
    s("caption", "Caption", { font: "body", size: 7, leading: 9.4, weight: 400, italic: true, color: ink.muted, align: "left" }),
    s("pullquote", "Pull Quote", { font: "headline", size: 15, leading: 18, weight: 700, color: ACCENT, align: "left" }),
    s("byline", "Byline", { font: "body", size: 7.5, leading: 10, weight: 500, color: ink.muted, align: "left", uppercase: true, tracking: 40 }),
    s("name", "Name/Bold", { font: "headline", size: 15, leading: 17, weight: 700, color: ink.navy, align: "left" }),
    s("designation", "Name/Designation", { font: "body", size: 8, leading: 10.5, weight: 400, color: ink.muted, align: "left" }),
    s("facts", "Sidebar/Facts", { font: "body", size: 8, leading: 11, weight: 400, color: ink.text, align: "left" }),
    s("message-title", "Head/Message", { font: "body", size: 30, leading: 34, weight: 300, color: ink.navy, align: "left" }),
  ].map((p) => [p.id, p]),
);

export const styleOptions = Object.values(paragraphStyles).map((p) => ({ id: p.id, name: p.indesignName }));
