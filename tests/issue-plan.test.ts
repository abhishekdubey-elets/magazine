import { describe, expect, it } from "vitest";
import { makeContext, resolvePage } from "@/lib/layout-engine";
import { buildFormatTemplates, formatFor } from "@/lib/reference/formats";
import { buildIssuePlan, generateIssue, planToc, templateChoices, type PlanInput } from "@/lib/reference/plan";
import { deriveDesignSpec } from "@/lib/reference/spec";
import { countWords, parseBody } from "@/lib/text-engine";
import { healthArticles, houseTemplates, makeProfile, settings } from "./helpers/fixtures";

const profile = makeProfile();
const spec = { ...deriveDesignSpec(profile), review: { ...deriveDesignSpec(profile).review, status: "confirmed" as const } };
const formats = buildFormatTemplates(profile, spec);
const articles = healthArticles();

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    profile,
    spec,
    formats,
    templates: [...houseTemplates, ...formats.templates],
    articles,
    settings,
    title: "Health Innovation Review",
    issueLabel: "November 2026",
    topic: "Healthcare innovation",
    pageCount: 20,
    includeAds: true,
    articleIds: articles.map((a) => a.id),
    formatOverrides: {},
    templateOverrides: {},
    adPages: [],
    ...over,
  };
}

describe("format templates", () => {
  it("builds the six formats on the reference trim, styled from the spec", () => {
    const fmts = Object.values(formats.byFormat);
    expect(fmts).toHaveLength(6);
    for (const t of fmts) {
      expect(t.trim).toEqual({ width: 210, height: 280 });
      expect(t.format).toBeDefined();
      expect(t.referenceId).toBe("ref-test");
      const body = t.frames.find((f) => f.bind === "body");
      if (body) expect(body.style?.size).toBe(9.5);
    }
    expect(formats.byFormat.interview.derivation).toBe("geometry");
    expect(formats.byFormat["news-page"].derivation).toBe("adapted");
    expect(formats.byFormat["news-page"].frames.some((f) => f.bind === "story.1.body")).toBe(true);
    expect(formats.byFormat["company-profile"].name).toMatch(/adapted|inferred/);
  });

  it("chooses formats from content types", () => {
    expect(formatFor("interview")).toBe("interview");
    expect(formatFor("leadership-message")).toBe("government-perspective");
    expect(formatFor("news-report")).toBe("news-page");
    expect(formatFor("company-profile")).toBe("company-profile");
    expect(formatFor("feature")).toBe("feature");
  });
});

describe("issue planner", () => {
  it("plans a new-topic issue with cover, ads, contents, every article and a table of contents", () => {
    const plan = buildIssuePlan(input());
    expect(plan.pageCount).toBe(20);
    expect(plan.entries.map((e) => e.number)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(plan.entries[0].kind).toBe("cover");
    expect(plan.entries[1].kind).toBe("advertisement");
    expect(plan.entries[2].kind).toBe("contents");
    expect(plan.entries.at(-1)!.kind).toBe("advertisement");
    const kinds = new Set(plan.entries.map((e) => e.kind));
    for (const k of ["interview", "feature", "government-perspective", "event-report", "news-page", "company-profile"]) expect(kinds.has(k as never)).toBe(true);
    // News reports share one page: lead + briefs.
    const news = plan.entries.find((e) => e.kind === "news-page")!;
    expect(news.storyIds).toEqual(["h-news-3"]);
    expect(news.articleId).toBe("h-news-2");
    // The full-length report is too long for a news lead, so it gets a page of its own.
    const promoted = plan.entries.find((e) => e.articleId === "h-news-1")!;
    expect(promoted.kind).toBe("feature");
    expect(promoted.reason).toMatch(/Too long for a news page lead/);
    // Every selected article appears exactly once (as lead or brief).
    const used = plan.entries.flatMap((e) => [e.articleId, ...(e.storyIds ?? [])]).filter(Boolean);
    for (const a of articles) expect(used.filter((id) => id === a.id)).toHaveLength(1 + plan.entries.filter((e) => e.kind === "continuation" && e.articleId === a.id).length);
    const toc = planToc(plan, articles);
    expect(toc.length).toBeGreaterThanOrEqual(6);
    expect(toc.find((t) => t.format === "news-page")!.stories).toHaveLength(1);
    expect(plan.unresolved).toEqual([]);
    expect(plan.status).toBe("draft");
  });

  it("allocates continuation pages from measured capacity and never cuts text", () => {
    const long = { ...articles[1], id: "h-long", body: Array.from({ length: 4 }, () => articles[1].body).join("\n\n") };
    const plan = buildIssuePlan(input({ articles: [...articles, long], articleIds: ["h-long"], pageCount: 8 }));
    const first = plan.entries.find((e) => e.articleId === "h-long" && e.kind !== "continuation")!;
    const cont = plan.entries.filter((e) => e.continuesId === first.id);
    expect(cont.length).toBeGreaterThanOrEqual(1);
    expect(cont.every((c) => c.kind === "continuation" && c.number > first.number)).toBe(true);
    expect(first.reason).toMatch(/words, template holds/);
  });

  it("refuses silently dropping content: too many articles becomes an unresolved conflict", () => {
    const plan = buildIssuePlan(input({ pageCount: 4 }));
    expect(plan.unresolved.length).toBeGreaterThan(0);
    expect(plan.unresolved[0]).toMatch(/Not enough pages/);
  });

  it("respects editor overrides: format, template and reserved ad pages", () => {
    const choices = templateChoices(input(), "feature", articles[1]);
    expect(choices[0].id).toBe(formats.byFormat.feature.id);
    const alt = choices.find((t) => t.id !== choices[0].id)!;
    const plan = buildIssuePlan(input({ formatOverrides: { "h-news-1": "feature" }, templateOverrides: { "h-feature": alt.id }, adPages: [7] }));
    expect(plan.entries.find((e) => e.articleId === "h-news-1")!.kind).toBe("feature");
    expect(plan.entries.find((e) => e.articleId === "h-feature")!.templateId).toBe(alt.id);
    expect(plan.entries.find((e) => e.number === 7)!.kind).toBe("advertisement");
    expect(plan.entries.find((e) => e.number === 7)!.reserved).toBe(true);
  });

  it("reports required images against what the article has", () => {
    const plan = buildIssuePlan(input());
    const iv = plan.entries.find((e) => e.kind === "interview")!;
    expect(iv.requiredImages).toBeGreaterThanOrEqual(1);
    expect(iv.imagesAvailable).toBe(articles[0].imageIds.length);
  });
});

describe("issue generation", () => {
  it("refuses to generate from an unapproved plan", () => {
    const plan = buildIssuePlan(input());
    const res = generateIssue(plan, input(), 0, "Asha");
    expect(res.ok).toBe(false);
    expect(res.problems[0]).toMatch(/not been approved/);
  });

  it("generates pages that preserve every paragraph of the source text", () => {
    const plan = { ...buildIssuePlan(input()), status: "approved" as const };
    const res = generateIssue(plan, input(), 0, "Asha");
    expect(res.problems).toEqual([]);
    expect(res.ok).toBe(true);
    expect(res.pages).toHaveLength(20);
    expect(res.publication.trim).toEqual({ width: 210, height: 280 });
    expect(res.publication.plan?.status).toBe("generated");
    expect(res.publication.designSpecVersion).toBe(spec.version);
    const ctx = makeContext(res.publication, res.pages, articles, res.templates, settings, 0);
    for (const a of articles) {
      const story = res.pages.filter((p) => p.articleId === a.id).sort((x, y) => x.number - y.number);
      if (!story.length) continue; // briefs are checked below
      let placed = 0;
      for (const p of story) for (const el of resolvePage(ctx, p).elements) if (el.frame.bind === "body") placed += countWords(el.text);
      const last = resolvePage(ctx, story.at(-1)!);
      expect(placed + last.storyOversetWords).toBeGreaterThanOrEqual(countWords(a.body) - 1);
      expect(last.storyOversetWords).toBe(0);
    }
    const news = res.pages.find((p) => p.format === "news-page")!;
    const r = resolvePage(ctx, news);
    const brief1 = r.elements.find((e) => e.frame.bind === "story.1.title")!;
    expect(brief1.text).toBe(articles.find((a) => a.id === news.storyIds![0])!.title);
    const brief1Body = r.elements.find((e) => e.frame.bind === "story.1.body")!;
    expect(brief1Body.slices!.length).toBeGreaterThan(0);
    expect(parseBody(articles.find((a) => a.id === news.storyIds![0])!.body)[0].words.slice(0, 3).join(" ")).toContain(brief1Body.slices![0].text.split(" ")[0]);
  });

  it("stops with an explanation when a story cannot fit its planned pages", () => {
    const huge = { ...articles[1], id: "h-huge", body: Array.from({ length: 30 }, () => articles[1].body).join("\n\n") };
    const inp = input({ articles: [...articles, huge], articleIds: ["h-huge"], pageCount: 8 });
    const plan = { ...buildIssuePlan(inp), status: "approved" as const };
    expect(plan.unresolved.some((u) => /words more than/.test(u))).toBe(true);
    const res = generateIssue(plan, inp, 0, "Asha");
    expect(res.ok).toBe(false);
    expect(res.problems.some((p) => /words more than|do not fit/.test(p))).toBe(true);
  });
});
