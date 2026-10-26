import type { DemoState } from "./store";
import { routes } from "./nav";

export const GUIDE_PAGE = "page-17";
export const GUIDE_ARTICLE = "art-int-bhashasetu";
export const GUIDE_MISSING_IMAGE_PAGE = "page-10";

export interface GuideStep {
  title: string;
  body: string;
  href: string;
  cta: string;
  done: (s: DemoState, visited: string[]) => boolean;
}

const after = (iso: string | undefined, start?: string) => !!iso && (!start || iso >= start);

/** Scenario for stakeholder walkthroughs. Completion is detected from real state. */
export const GUIDE_STEPS: GuideStep[] = [
  {
    title: "Open the publication",
    body: "Start in the Tech Maha Impact — May 2026 workspace: page plan, sections and progress.",
    href: routes.publication("pub-tmi-2026-05"),
    cta: "Open publication",
    done: (_s, v) => v.some((p) => p.startsWith("/publications/pub-tmi")),
  },
  {
    title: "Select an interview article",
    body: "Open ‘Vernacular AI for the Next Hundred Million’ (page 17) in AI Content Preparation.",
    href: routes.prepare(GUIDE_ARTICLE),
    cta: "Open article",
    done: (_s, v) => v.some((p) => p.startsWith("/prepare")),
  },
  {
    title: "Review AI preparation suggestions",
    body: "Run Classify, Generate Summary and Extract Pull Quotes, then accept the suggestions you agree with.",
    href: routes.prepare(GUIDE_ARTICLE),
    cta: "Go to suggestions",
    done: (s) => {
      const a = s.articles.find((x) => x.id === GUIDE_ARTICLE);
      return !!a?.summary && a.pullQuotes.length > 0;
    },
  },
  {
    title: "Generate the page layout",
    body: "In Layout Studio, click Generate Layout on page 17. PressFlow validates content, picks a template and fills it.",
    href: routes.studio(GUIDE_PAGE),
    cta: "Open page 17",
    done: (s) => s.pages.find((p) => p.id === GUIDE_PAGE)?.status !== "planned",
  },
  {
    title: "Edit the headline",
    body: "Double-click the headline on the page (or use the properties panel) and change the wording.",
    href: routes.studio(GUIDE_PAGE, "headline"),
    cta: "Edit headline",
    done: (s) => s.pages.find((p) => p.id === GUIDE_PAGE)?.contentOverrides.title !== undefined,
  },
  {
    title: "Resolve the missing-image error",
    body: "Page 10 has no portrait. Open it from QA and place an image from the asset library.",
    href: routes.studio(GUIDE_MISSING_IMAGE_PAGE, "portrait"),
    cta: "Open page 10",
    done: (s) => {
      const p = s.pages.find((x) => x.id === GUIDE_MISSING_IMAGE_PAGE);
      const a = s.articles.find((x) => x.id === "art-int-collector");
      return !!p?.imageOverrides["image.0"] || !!a?.imageIds.length;
    },
  },
  {
    title: "Run QA again",
    body: "Re-run the browser preflight and confirm the error count went down.",
    href: routes.qa(),
    cta: "Open QA",
    done: (s) => s.qaRuns.some((r) => after(r.at, s.guide.startedAt)),
  },
  {
    title: "Export a preview",
    body: "Generate a downloadable PDF proof or the structured content package.",
    href: routes.export(),
    cta: "Open Export Center",
    done: (s) => s.exportJobs.some((j) => j.status === "completed" && after(j.createdAt, s.guide.startedAt)),
  },
];
