import { sampleArticles } from "@/data/articles";
import { defaultSettings } from "@/data/seed";
import { builtInTemplates } from "@/lib/templates";
import type { Article, ReferenceProfile, RefPage, RefPageType, RefRect, RefTextBlock } from "@/lib/types";

/**
 * A synthetic reference magazine (210 × 280 mm, 3-column body) with enough
 * measured structure for template derivation: cover, contents, message,
 * interview, article pages, feature opener, advertisement, a blank page.
 */

const W = 210;
const H = 280;
const BODY = 9.5;
const LEAD = 12.5;

const block = (x: number, y: number, w: number, h: number, size: number, text: string, extra: Partial<RefTextBlock> = {}): RefTextBlock => ({
  x,
  y,
  w,
  h,
  size,
  font: size >= BODY * 1.6 ? "GoodPro-Bold" : "Roboto-Regular",
  bold: size >= BODY * 1.6,
  lines: Math.max(1, Math.round(h / (size * 0.3528 * 1.25))),
  chars: Math.max(text.length, Math.round(w * h * 0.08)),
  text,
  leading: size === BODY ? LEAD : 0,
  ...extra,
});

const bodyCols = (y: number, h: number, cols = 3): RefTextBlock[] => {
  const live = W - 30;
  const g = 5;
  const cw = (live - g * (cols - 1)) / cols;
  return Array.from({ length: cols }, (_, i) => block(15 + i * (cw + g), y, cw, h, BODY, "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor", { lines: Math.round(h / (LEAD * 0.3528)), chars: Math.round(h * 9), font: "Roboto-Regular", bold: false }));
};

const furniture = (n: number): RefTextBlock[] => [
  block(n % 2 ? W - 60 : 15, 8, 45, 3, 7, "DIGITAL GOVERNANCE", { lines: 1, chars: 18 }),
  block(n % 2 ? W - 25 : 15, 266, 10, 4, 8, String(n), { lines: 1, chars: 2 }),
];

function page(number: number, type: RefPageType, blocks: RefTextBlock[], images: RefRect[], opts: Partial<RefPage> = {}): RefPage {
  const bodyChars = blocks.filter((b) => Math.abs(b.size - BODY) < 1).reduce((n, b) => n + b.chars, 0);
  const cols = new Set(blocks.filter((b) => Math.abs(b.size - BODY) < 1 && b.lines >= 4).map((b) => Math.round(b.x))).size;
  return {
    number,
    type,
    detectedType: type,
    confidence: 0.8,
    reasons: ["fixture"],
    blocks: [...blocks, ...furniture(number)],
    images,
    columns: Math.max(1, cols),
    runningHead: number > 3 && number < 11 ? "Digital Governance" : number >= 11 ? "Public Policy" : undefined,
    textChars: blocks.reduce((n, b) => n + b.chars, 0),
    bodyChars,
    imageCoverage: images.reduce((n, r) => n + (r.w * r.h) / (W * H), 0),
    ...opts,
  };
}

export function makeProfile(overrides: Partial<ReferenceProfile> = {}): ReferenceProfile {
  const pages: RefPage[] = [
    page(1, "cover", [block(15, 150, 180, 40, 52, "THE FUTURE OF HEALTH")], [{ x: 0, y: 0, w: W, h: H }, { x: 15, y: 10, w: 60, h: 18 }]),
    page(2, "advertisement", [block(20, 250, 100, 5, 8, "www.example.com +91 22 1234 5678", { lines: 1 })], [{ x: 0, y: 0, w: W, h: H }]),
    page(3, "contents", [block(15, 25, 100, 14, 30, "Contents"), ...bodyCols(60, 180, 2)], [{ x: 120, y: 60, w: 75, h: 60 }]),
    page(4, "message", [block(15, 25, 100, 12, 26, "Message"), ...bodyCols(55, 200, 1).map((b) => ({ ...b, w: 110 })), block(132, 100, 60, 7, 12, "Dr. Anita Deshmukh", { font: "GoodPro-Bold", bold: true, lines: 1, chars: 18 }), block(132, 108, 60, 4, 7.5, "Secretary, Health", { lines: 1, chars: 17 })], [{ x: 132, y: 25, w: 62, h: 74 }]),
    page(5, "interview", [block(15, 28, 112, 22, 28, "Building Digital Trust at Scale"), block(15, 53, 112, 10, 12, "A conversation about platforms", { font: "GoodPro-Light", bold: false, lines: 2 }), ...bodyCols(110, 148, 3), block(132, 94, 58, 7, 12, "Shalini Rao", { font: "GoodPro-Bold", bold: true, lines: 1, chars: 11 }), block(132, 101, 58, 4, 7.5, "Chief Executive, MahaDigital", { lines: 1, chars: 28 }), block(15, 66, 112, 30, 9.6, "Why does trust matter now?", { font: "Roboto-Bold", bold: true, lines: 3, chars: 240 })], [{ x: 132, y: 22, w: 58, h: 70 }]),
    page(6, "article", [block(15, 28, 180, 24, 32, "Clinics in the cloud"), block(15, 55, 180, 10, 12, "Telemedicine reaches the taluka", { font: "GoodPro-Light", bold: false, lines: 2 }), ...bodyCols(150, 108, 3), block(15, 142, 115, 6, 7, "Patients wait at a rural clinic", { font: "Roboto-Italic", lines: 1, chars: 30 })], [{ x: 15, y: 70, w: 115, h: 70 }]),
    page(7, "article", [block(15, 28, 180, 24, 32, "Data that heals"), ...bodyCols(60, 198, 3)], [{ x: 135, y: 60, w: 55, h: 40 }]),
    page(8, "feature-opener", [block(15, 190, 180, 40, 48, "THE SOVEREIGN CLOUD"), block(15, 235, 120, 16, 12, "How the state built its own platform", { font: "GoodPro-Light", bold: false, lines: 3 })], [{ x: 0, y: 0, w: W, h: H }]),
    page(9, "article", [block(15, 28, 180, 24, 32, "Continued story"), ...bodyCols(60, 198, 3)], []),
    page(10, "article", [...bodyCols(25, 233, 3)], [], { runningHead: "Digital Governance" }),
    page(11, "other", [], [], { reasons: ["No text and no images"], confidence: 0.9 }),
    page(12, "advertisement", [block(20, 250, 100, 5, 8, "contact@brand.example", { lines: 1 })], [{ x: 0, y: 0, w: W, h: H }]),
  ];
  return {
    id: "ref-test",
    name: "Health Innovation Review",
    fileName: "health-innovation-review.pdf",
    fileSize: 12_000_000,
    createdAt: "2026-10-27T08:00:00.000Z",
    durationMs: 4200,
    pageCount: 48,
    trim: { width: W, height: H },
    trimSource: "trimbox",
    bleed: 3,
    bleedSource: "bleedbox",
    margins: { top: 22, bottom: 18, inside: 15, outside: 15 },
    columns: 3,
    gutter: 5,
    hasTextLayer: true,
    body: { font: "Roboto-Regular", role: "body", size: BODY, leading: LEAD, align: "justify" },
    headline: { font: "GoodPro-Bold", role: "headline", size: 32 },
    deck: { font: "GoodPro-Light", role: "headline", size: 12 },
    caption: { font: "Roboto-Italic", role: "body", size: 7 },
    typeScale: [
      { size: 32, share: 4, sample: "Clinics in the cloud" },
      { size: 12, share: 6, sample: "Telemedicine reaches the taluka" },
      { size: BODY, share: 78, sample: "Lorem ipsum" },
      { size: 7, share: 5, sample: "Patients wait" },
    ],
    fonts: [
      { name: "Roboto-Regular", share: 70, role: "body", substitute: "Roboto" },
      { name: "GoodPro-Bold", share: 18, role: "headline", substitute: "Roboto Condensed" },
      { name: "GoodPro-Light", share: 7, role: "headline", substitute: "Roboto Condensed" },
      { name: "Roboto-Italic", share: 5, role: "body", substitute: "Roboto" },
    ],
    palette: ["#0b5fa4", "#e26b1f", "#1d2b4f"],
    sections: [
      { name: "Digital Governance", pages: [4, 5, 6, 7, 8, 9, 10] },
      { name: "Public Policy", pages: [11, 12] },
    ],
    pages,
    previews: {},
    notes: [],
    evidence: {
      gridPages: [5, 6, 7, 9, 10],
      gutterSamples: 10,
      marginSamples: { top: 5, bottom: 5, inside: 5, outside: 5 },
      bodyBlocks: 14,
      headlineSamples: 6,
      deckSamples: 3,
      captionSamples: 1,
      textPages: 10,
      blankPages: [11],
    },
    oddSizes: [],
    ...overrides,
  };
}

export const settings = structuredClone(defaultSettings);
export const houseTemplates = structuredClone(builtInTemplates);

/** Articles for a different topic (healthcare), built from the sample library so bodies are realistic. */
export function healthArticles(): Article[] {
  const pick = (id: string) => structuredClone(sampleArticles.find((a) => a.id === id)!);
  const interview = pick("art-int-mahadigital");
  interview.id = "h-interview";
  interview.title = "Digital Health Records for Every Citizen";
  const feature = pick("art-health");
  feature.id = "h-feature";
  const gov = pick("art-msg-secretary");
  gov.id = "h-gov";
  gov.contentType = "government-perspective";
  gov.title = "A Healthier State by Design";
  gov.summary = "The Health Department's plan to connect every primary health centre.";
  const event = pick("art-event-conclave");
  event.id = "h-event";
  event.title = "Health Innovation Conclave 2026";
  const news1 = pick("art-solar");
  news1.id = "h-news-1";
  news1.title = "Telemedicine kiosks open in 40 blocks";
  news1.contentType = "news-report";
  const news2 = pick("art-datacentre");
  news2.id = "h-news-2";
  news2.title = "Vaccine cold chain goes digital";
  news2.contentType = "news-report";
  news2.body = news2.body.split("\n\n")[0];
  const news3 = structuredClone(news2);
  news3.id = "h-news-3";
  news3.title = "Hospital beds tracked in real time";
  news3.body = news1.body.split("\n\n")[0];
  const profile = pick("art-case-services");
  profile.id = "h-company";
  profile.title = "MedLink Systems";
  profile.contentType = "company-profile";
  profile.facts = [
    { label: "Founded", value: "2014" },
    { label: "Headquarters", value: "Pune" },
    { label: "Website", value: "medlink.example" },
  ];
  return [interview, feature, gov, event, news1, news2, news3, profile];
}
