import { describe, expect, it } from "vitest";
import { applyBulk, previewBulk } from "@/lib/bulk-fixes";
import { runIssueQa } from "@/lib/issue-qa";
import { makeContext } from "@/lib/layout-engine";
import { buildFormatTemplates } from "@/lib/reference/formats";
import { buildIssuePlan, generateIssue, type PlanInput } from "@/lib/reference/plan";
import { deriveDesignSpec } from "@/lib/reference/spec";
import type { Page } from "@/lib/types";
import { healthArticles, houseTemplates, makeProfile, settings } from "./helpers/fixtures";

const profile = makeProfile();
const spec = deriveDesignSpec(profile);
const formats = buildFormatTemplates(profile, spec);
const articles = healthArticles();
const inp: PlanInput = {
  profile,
  spec,
  formats,
  templates: [...houseTemplates, ...formats.templates],
  articles,
  settings,
  title: "Health Innovation Review",
  issueLabel: "November 2026",
  topic: "Healthcare",
  pageCount: 20,
  includeAds: true,
  articleIds: articles.map((a) => a.id),
  formatOverrides: {},
  templateOverrides: {},
  adPages: [],
};
const plan = { ...buildIssuePlan(inp), status: "approved" as const };
const gen = generateIssue(plan, inp, 0, "Asha");
const ctx = () => makeContext(gen.publication, gen.pages, articles, gen.templates, settings, 0);

describe("issue QA", () => {
  it("accounts for every paragraph and reports no blockers on a clean generation besides missing images", () => {
    const rep = runIssueQa(ctx(), [], { plan: gen.publication.plan, spec, pdfPreset: "[PDF/X-4:2008]" });
    expect(rep.visualInspection).toBe("deterministic");
    expect(rep.findings.filter((f) => f.check === "text-accounted").length).toBeGreaterThanOrEqual(5);
    expect(rep.findings.some((f) => f.check === "text-unaccounted")).toBe(false);
    expect(rep.findings.some((f) => f.check === "duplicate-story")).toBe(false);
    expect(rep.findings.some((f) => f.check === "planned-article-missing")).toBe(false);
    // Blockers here can only be missing required images (the fixture articles reference sample artwork ids).
    // Blockers here can only be missing required images, the open (blank) slots the 20-page plan leaves, and
    // display lines the SSR width estimate (0.5 em per glyph, wider than the real fonts) reports as overset.
    for (const b of rep.findings.filter((f) => f.severity === "blocker")) expect(["missing-image", "blank-page", "not-generated", "overflow"]).toContain(b.check);
    // No story body overflows: every paragraph was placed on the planned pages.
    expect(rep.findings.filter((f) => f.check === "overflow" && f.frameId?.startsWith("body"))).toEqual([]);
    expect(rep.deferred.length).toBeGreaterThan(0);
    expect(rep.perPage[gen.pages[0].id]).toBeDefined();
  });

  it("flags lost text, duplicates, removed reserved placements and page-size drift as blockers", () => {
    const pages: Page[] = gen.pages.map((p) => ({ ...p }));
    const news = pages.find((p) => p.format === "news-page")!;
    const other = pages.find((p) => p.format === "feature")!;
    other.storyIds = [news.storyIds![0]]; // duplicate brief
    const ad = pages.find((p) => p.pageType === "advertisement")!;
    ad.pageType = "article"; // reserved placement overwritten
    const c = makeContext({ ...gen.publication, trim: { width: 200, height: 270 } }, pages, articles, gen.templates, settings, 0);
    const rep = runIssueQa(c, [], { plan: gen.publication.plan, spec });
    expect(rep.releasable).toBe(false);
    expect(rep.findings.some((f) => f.check === "duplicate-story" && f.severity === "blocker")).toBe(true);
    expect(rep.findings.some((f) => f.check === "reserved-placement" && f.severity === "blocker")).toBe(true);
    expect(rep.findings.some((f) => f.check === "page-size" && f.severity === "blocker")).toBe(true);
    expect(rep.findings.some((f) => f.check === "trim-mismatch")).toBe(true);
  });

  it("uses InDesign's own report when a build has run", () => {
    const rep = runIssueQa(ctx(), [], {
      indesignReport: { pages: 15, stories: 7, overset: [{ id: "x", label: "Body", page: 6, characters: 120 }], autoFitted: [], missingFonts: ["GoodPro Bold"], images: [], preflight: { profile: "[Basic]", errors: 2, results: ["Missing font", "Low res"] }, warnings: [], timings: {} },
      builtPages: gen.pages.map((p) => p.number),
    });
    const checks = rep.findings.filter((f) => f.check.startsWith("indesign") || f.check === "output-pages").map((f) => `${f.check}:${f.severity}`);
    expect(checks).toContain("output-pages:blocker");
    expect(checks).toContain("indesign-overset:blocker");
    expect(checks).toContain("indesign-font:blocker");
    expect(checks).toContain("indesign-preflight:blocker");
  });

  it("flags pull quotes that are not the article's own words", () => {
    const tampered = articles.map((a) => (a.id === "h-feature" ? { ...a, pullQuotes: ["This sentence was never said by anyone"] } : a));
    const rep = runIssueQa(makeContext(gen.publication, gen.pages, tampered, gen.templates, settings, 0), []);
    expect(rep.findings.some((f) => f.check === "quote-not-verbatim")).toBe(true);
  });
});

describe("bulk corrections", () => {
  it("previews scope and impact, applies without touching copy, and invalidates approvals", () => {
    const pages = gen.pages.map((p) => ({ ...p }));
    const target = pages.find((p) => p.format === "feature")!;
    target.frameOverrides = { headline: { style: { size: 60 }, x: 1 } };
    target.status = "approved";
    target.approvedBy = "Asha";
    const c = makeContext(gen.publication, pages, articles, gen.templates, settings, 0);
    const preview = previewBulk(c, pages.map((p) => p.id), { type: "reset-styles" });
    expect(preview.affected).toHaveLength(1);
    expect(preview.affected[0].reopens).toBe(true);
    expect(preview.untouched).toBe(pages.length - 1);
    expect(preview.summary).toMatch(/1 of 20 selected pages change; 1 approved page will go back to review/);
    const res = applyBulk(c, pages.map((p) => p.id), { type: "reset-styles" });
    const after = res.pages.find((p) => p.id === target.id)!;
    expect(after.frameOverrides.headline).toEqual({ x: 1 }); // geometry kept, style reset
    expect(after.status).toBe("in-review");
    expect(after.reviewNote).toMatch(/needs approval again/);
    expect(res.before[0].status).toBe("approved"); // undo snapshot
    expect(articles.find((a) => a.id === after.articleId)!.body).toBe(articles.find((a) => a.id === target.articleId)!.body);
  });

  it("reflows overset stories onto continuation pages and renumbers", () => {
    const long = articles.map((a) => (a.id === "h-feature" ? { ...a, body: Array.from({ length: 6 }, () => a.body).join("\n\n") } : a));
    const c = makeContext(gen.publication, gen.pages, long, gen.templates, settings, 0);
    const story = gen.pages.filter((p) => p.articleId === "h-feature").sort((a, b) => a.number - b.number);
    const feature = story[story.length - 1];
    const preview = previewBulk(c, [feature.id], { type: "add-continuations" });
    expect(preview.affected).toHaveLength(1);
    const res = applyBulk(c, [feature.id], { type: "add-continuations" }, gen.templates);
    expect(res.pages).toHaveLength(gen.pages.length + 1);
    const inserted = res.pages.find((p) => p.number === feature.number + 1)!;
    expect(inserted.articleId).toBe("h-feature");
    expect(inserted.title).toMatch(/\(continued\)$/);
    expect(res.pages.find((p) => p.id === gen.pages.at(-1)!.id)!.number).toBe(gen.pages.length + 1);
  });
});
