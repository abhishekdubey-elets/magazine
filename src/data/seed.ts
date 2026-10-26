import type { ActivityEvent, Page, PageStatus, PageType, Publication, Section, Settings } from "@/lib/types";
import { ink } from "@/lib/design-tokens";

export const PUBLICATION_ID = "pub-tmi-2026-05";

export const sections: Section[] = [
  { id: "sec-front", name: "Front Matter", color: ink.navy },
  { id: "sec-leadership", name: "Leadership Insights", color: ink.blue },
  { id: "sec-cover", name: "Cover Story", color: "#1d3f7a" },
  { id: "sec-dpi", name: "DPI & Intelligent Governance", color: "#d9822b" },
  { id: "sec-csr", name: "CSR & Civil Society", color: ink.green },
  { id: "sec-digital", name: "Digital Transformation", color: "#2563c9" },
  { id: "sec-policy", name: "Public Policy", color: "#6b3fa0" },
  { id: "sec-events", name: "Events & Conclaves", color: "#c2410c" },
  { id: "sec-partners", name: "Partners", color: "#64748b" },
];

const T = "2026-05-22T11:30:00.000Z";

type PageSeed = [
  number,
  PageType,
  string,
  string | undefined,
  string | undefined,
  string | undefined,
  PageStatus,
  Record<string, string | null>?,
];

// number, type, title, section, template, article, status, imageOverrides
const pageSeeds: PageSeed[] = [
  [1, "cover", "Front cover", "sec-front", "tpl-cover", undefined, "approved"],
  [2, "advertisement", "Inside front cover — NimbusGov Cloud", "sec-partners", "tpl-advertisement", undefined, "approved", { "image.0": "img-ad-cloud" }],
  [3, "contents", "Contents", "sec-front", "tpl-contents", undefined, "approved"],
  [4, "editors-note", "Editor's note", "sec-front", "tpl-editors-note", "art-editors-note", "approved"],
  [5, "leadership-message", "Message — Principal Secretary, IT", "sec-leadership", "tpl-message", "art-msg-secretary", "approved"],
  [6, "interview", "Interview — Shalini Rao", "sec-leadership", "tpl-interview-classic", "art-int-mahadigital", "in-review"],
  [7, "feature", "Cover story opener", "sec-cover", "tpl-feature-opener", "art-cover-ai-state", "in-review"],
  [8, "article", "Cover story (continued)", "sec-cover", "tpl-continuation", "art-cover-ai-state", "in-review"],
  [9, "infographic", "Digital Maharashtra in numbers", "sec-cover", "tpl-infographic", "art-infographic", "in-review"],
  [10, "interview", "Interview — Dr. Neha Joshi", "sec-dpi", "tpl-interview-classic", "art-int-collector", "draft"],
  [11, "article", "Securing the digital backbone", "sec-dpi", "tpl-article-standard", "art-cyber", "draft"],
  [12, "article", "Case study — From counters to code", "sec-dpi", "tpl-case-study", "art-case-services", "in-review"],
  [13, "article", "Solar microgrids power rural schools", "sec-csr", "tpl-article-standard", "art-solar", "draft"],
  [14, "feature", "CSR 2.0 — opener", "sec-csr", "tpl-feature-hero", "art-csr-20", "in-review"],
  [15, "article", "CSR 2.0 (continued)", "sec-csr", "tpl-continuation", "art-csr-20", "in-review"],
  [16, "advertisement", "Advertisement — Sahyadri Co-operative Bank", "sec-partners", "tpl-advertisement", undefined, "approved", { "image.0": "img-ad-bank" }],
  [17, "interview", "Interview — Rohan Patil (awaiting layout)", "sec-digital", undefined, "art-int-bhashasetu", "planned"],
  [18, "article", "AI in the fields", "sec-digital", "tpl-article-standard", "art-agri-ai", "draft"],
  [19, "article", "Data protection and the public sector", "sec-policy", "tpl-article-standard", "art-policy-dpdp", "draft"],
  [20, "article", "Event report — TechMahaImpact 2026", "sec-events", "tpl-event-report", "art-event-conclave", "in-review"],
  [21, "article", "Sovereign cloud capacity expands", "sec-digital", "tpl-article-standard", "art-datacentre", "draft"],
  [22, "closing", "Back cover", "sec-front", "tpl-closing", "art-closing", "approved"],
];

export const seedPages: Page[] = pageSeeds.map(([number, pageType, title, sectionId, templateId, articleId, status, images]) => ({
  id: `page-${String(number).padStart(2, "0")}`,
  publicationId: PUBLICATION_ID,
  number,
  pageType,
  title,
  sectionId,
  templateId,
  articleId,
  status,
  contentOverrides: {},
  imageOverrides: images ?? {},
  frameOverrides: {},
  generatedAt: templateId ? "2026-05-20T09:15:00.000Z" : undefined,
  approvedAt: status === "approved" ? "2026-05-21T16:40:00.000Z" : undefined,
  updatedAt: T,
}));

export const seedPublications: Publication[] = [
  {
    id: PUBLICATION_ID,
    title: "Tech Maha Impact",
    masthead: "TechMahaImpact",
    issueLabel: "May 2026",
    issueDate: "2026-05-25",
    stage: "layout",
    description:
      "Special compendium for Maharashtra's premier CSR & Technology Conclave — governance innovation, CSR 2.0 and digital public infrastructure.",
    website: "egov.eletsonline.com",
    tagline: "The ultimate resource for Governance Innovations",
    sections,
    pageIds: seedPages.map((p) => p.id),
    trim: { width: 205, height: 278 },
    bleed: 5,
    updatedAt: T,
    updatedBy: "Shyam Kishore",
    coverColor: ink.blue,
  },
  {
    id: "pub-egov-2026-04",
    title: "eGov Magazine",
    masthead: "eGov",
    issueLabel: "April 2026",
    issueDate: "2026-04-15",
    stage: "published",
    description: "Monthly edition on e-governance and smart cities.",
    website: "egov.eletsonline.com",
    tagline: "The ultimate resource for Governance Innovations",
    sections,
    pageIds: [],
    trim: { width: 205, height: 278 },
    bleed: 5,
    updatedAt: "2026-04-14T18:20:00.000Z",
    updatedBy: "Om Prakash Thakur",
    coverColor: "#c2410c",
  },
  {
    id: "pub-health-2026-06",
    title: "eHealth Magazine",
    masthead: "eHealth",
    issueLabel: "June 2026",
    issueDate: "2026-06-20",
    stage: "planning",
    description: "Healthcare technology special: telemedicine, ABDM and hospital digitisation.",
    website: "ehealth.eletsonline.com",
    tagline: "Healthcare innovation in focus",
    sections,
    pageIds: [],
    trim: { width: 205, height: 278 },
    bleed: 5,
    updatedAt: "2026-05-18T10:05:00.000Z",
    updatedBy: "Ankush Singh",
    coverColor: ink.green,
  },
];

export const seedActivity: ActivityEvent[] = [
  { id: "act-1", kind: "export", message: "PDF proof prepared for pages 1–5 (front section)", actor: "Shyam Kishore", at: "2026-05-22T10:58:00.000Z", tone: "success" },
  { id: "act-2", kind: "qa", message: "Overflow warning resolved on page 6 — switched to Classic Q&A template", actor: "Ankush Singh", at: "2026-05-22T10:21:00.000Z", pageId: "page-06", tone: "success" },
  { id: "act-3", kind: "qa", message: "Image missing on page 10 — portrait pending from district office", actor: "QA engine", at: "2026-05-22T09:47:00.000Z", pageId: "page-10", tone: "error" },
  { id: "act-4", kind: "layout", message: "Layout draft generated for page 20 — Event Report template", actor: "PressFlow (demo)", at: "2026-05-21T17:32:00.000Z", pageId: "page-20" },
  { id: "act-5", kind: "content", message: "Author biography added for Dr. Suresh Nair", actor: "Sahaj Anand", at: "2026-05-21T15:10:00.000Z", articleId: "art-csr-20" },
  { id: "act-6", kind: "ai", message: "Article classified as Interview (confidence 0.94): ‘Vernacular AI for the Next Hundred Million’", actor: "PressFlow (demo)", at: "2026-05-21T12:02:00.000Z", articleId: "art-int-bhashasetu" },
  { id: "act-7", kind: "content", message: "Cover story approved by Editor-in-Chief", actor: "Dr. Kavya Iyer", at: "2026-05-20T19:45:00.000Z", articleId: "art-cover-ai-state", tone: "success" },
  { id: "act-8", kind: "layout", message: "Advertisements placed on pages 2 and 16", actor: "Shubham Kumar", at: "2026-05-20T11:30:00.000Z" },
];

export const defaultSettings: Settings = {
  brand: { organisation: "Elets Technomedia Pvt Ltd", primary: ink.blue, accent: ink.orange, ink: ink.text, paper: "#ffffff" },
  typography: { headlineFont: "Roboto Condensed", bodyFont: "Roboto", baseBodySize: 9, baseLeading: 12 },
  page: {
    width: 205,
    height: 278,
    bleed: 5,
    marginTop: 22,
    marginBottom: 20,
    marginInside: 15,
    marginOutside: 15,
    gutter: 5,
    columns: 3,
  },
  images: { minEffectivePpi: 200, defaultFit: "cover", compressUploads: true },
  exportDefaults: { format: "pdf-proof", quality: "standard", bleed: false, cropMarks: false },
  integration: { mode: "browser-demo", endpoint: "" },
};

export const DEMO_USER = "Shyam Kishore";
export const DEMO_USER_ROLE = "Deputy Art Director";
