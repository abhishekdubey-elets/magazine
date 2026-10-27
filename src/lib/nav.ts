import { BookOpen, Download, FileText, LayoutDashboard, LayoutGrid, PenTool, Settings, ShieldCheck, Workflow, type LucideIcon } from "lucide-react";

export type NavGroup = "overview" | "templates" | "placement" | "checks" | "output" | "manage";

export interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  description: string;
  group: NavGroup;
}

/** Sidebar groups, in order, named after the production goals they serve. */
export const NAV_GROUPS: { id: NavGroup; label: string }[] = [
  { id: "overview", label: "" },
  { id: "templates", label: "1 · Reusable templates" },
  { id: "placement", label: "2 · Automated placement" },
  { id: "checks", label: "3 · Fitting & checks" },
  { id: "output", label: "4 · Corrections & export" },
  { id: "manage", label: "Manage" },
];

/** Single source of truth for navigation and breadcrumbs. */
export const NAV: NavItem[] = [
  { href: "/", label: "Overview", short: "Overview", icon: LayoutDashboard, description: "Where the issue stands against the four production goals", group: "overview" },
  { href: "/reference-studio", label: "Design Studio", short: "Design", icon: Workflow, description: "Learn a reference magazine's design system, build the six format templates, plan and generate a new issue", group: "templates" },
  { href: "/templates", label: "Templates", short: "Templates", icon: LayoutGrid, description: "Reusable page templates for interviews, articles, government perspectives, event reports, news pages and company profiles", group: "templates" },
  { href: "/content", label: "Content Library", short: "Content", icon: FileText, description: "Articles, interviews, images and captions that the layouts place", group: "placement" },
  { href: "/studio", label: "Layout Studio", short: "Studio", icon: PenTool, description: "Automatic text and image placement with house styles; refine pages", group: "placement" },
  { href: "/qa", label: "Quality Assurance", short: "QA", icon: ShieldCheck, description: "Content fitting, overflow, missing images and formatting checks; bulk corrections", group: "checks" },
  { href: "/export", label: "Export Center", short: "Export", icon: Download, description: "PDF proofs, print-ready PDF and InDesign documents", group: "output" },
  { href: "/publications", label: "Publications", short: "Publications", icon: BookOpen, description: "Issues, page plans and progress", group: "manage" },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings, description: "Brand, typography, page grid, fonts and integrations", group: "manage" },
];

export const routes = {
  overview: () => "/",
  publication: (id: string) => `/publications/${id}`,
  content: (q?: string) => (q ? `/content?q=${encodeURIComponent(q)}` : "/content"),
  prepare: (articleId?: string) => (articleId ? `/prepare?article=${articleId}` : "/prepare"),
  studio: (pageId?: string, frameId?: string) =>
    pageId ? `/studio?page=${pageId}${frameId ? `&frame=${frameId}` : ""}` : "/studio",
  qa: () => "/qa",
  create: () => "/reference-studio",
  referenceStudio: (ref?: string) => (ref ? `/reference-studio?ref=${ref}` : "/reference-studio"),
  export: () => "/export",
  templates: () => "/templates",
  settings: () => "/settings",
};

/** Routes that are reachable from inside the app but not listed in the sidebar. */
const HIDDEN: { prefix: string; label: string }[] = [
  { prefix: "/prepare", label: "AI Content Preparation" },
  { prefix: "/proof", label: "Print proof" },
];

export function navFor(pathname: string) {
  if (pathname === "/") return NAV[0];
  const item = NAV.slice(1).find((n) => pathname.startsWith(n.href));
  if (item) return item;
  const hidden = HIDDEN.find((h) => pathname.startsWith(h.prefix));
  return hidden ? { ...NAV[0], href: hidden.prefix, label: hidden.label, short: hidden.label } : undefined;
}
