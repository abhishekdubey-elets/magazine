import {
  BookOpen,
  Download,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  PenTool,
  Settings,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  description: string;
}

/** Single source of truth for navigation, breadcrumbs and the command menu. */
export const NAV: NavItem[] = [
  { href: "/", label: "Overview", short: "Overview", icon: LayoutDashboard, description: "Production status for the active issue" },
  { href: "/publications", label: "Publications", short: "Publications", icon: BookOpen, description: "Issues, page plans and progress" },
  { href: "/content", label: "Content Library", short: "Content", icon: FileText, description: "Articles, interviews and messages" },
  { href: "/prepare", label: "AI Content Preparation", short: "AI Prep", icon: Sparkles, description: "Classify, summarise and prepare copy for layout" },
  { href: "/create", label: "Create Like This", short: "Create", icon: WandSparkles, description: "Analyse a reference magazine and build a similar issue" },
  { href: "/studio", label: "Layout Studio", short: "Studio", icon: PenTool, description: "Generate and refine magazine pages" },
  { href: "/qa", label: "Quality Assurance", short: "QA", icon: ShieldCheck, description: "Browser preflight across all pages" },
  { href: "/export", label: "Export Center", short: "Export", icon: Download, description: "PDF proofs, packages and InDesign handoff" },
  { href: "/templates", label: "Templates", short: "Templates", icon: LayoutGrid, description: "Structured page templates" },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings, description: "Brand, typography, page and integrations" },
];

export const routes = {
  overview: () => "/",
  publication: (id: string) => `/publications/${id}`,
  content: (q?: string) => (q ? `/content?q=${encodeURIComponent(q)}` : "/content"),
  prepare: (articleId?: string) => (articleId ? `/prepare?article=${articleId}` : "/prepare"),
  studio: (pageId?: string, frameId?: string) =>
    pageId ? `/studio?page=${pageId}${frameId ? `&frame=${frameId}` : ""}` : "/studio",
  qa: () => "/qa",
  create: () => "/create",
  export: () => "/export",
  templates: () => "/templates",
  settings: () => "/settings",
};

export function navFor(pathname: string) {
  if (pathname === "/") return NAV[0];
  return NAV.slice(1).find((n) => pathname.startsWith(n.href));
}
