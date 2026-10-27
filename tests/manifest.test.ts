import { describe, expect, it } from "vitest";
import { buildInDesignManifestV2 } from "@/lib/indesign/build-manifest";
import { MANIFEST_SCHEMA, type IdText } from "@/lib/indesign/manifest-types";
import { makeContext } from "@/lib/layout-engine";
import { buildFormatTemplates } from "@/lib/reference/formats";
import { buildIssuePlan, generateIssue, type PlanInput } from "@/lib/reference/plan";
import { deriveDesignSpec } from "@/lib/reference/spec";
import { healthArticles, houseTemplates, makeProfile, settings } from "./helpers/fixtures";

const profile = makeProfile();
const spec = deriveDesignSpec(profile);
const formats = buildFormatTemplates(profile, spec);
const articles = healthArticles();
const inp: PlanInput = { profile, spec, formats, templates: [...houseTemplates, ...formats.templates], articles, settings, title: "HIR", issueLabel: "Nov 2026", topic: "Health", pageCount: 20, includeAds: true, articleIds: articles.map((a) => a.id), formatOverrides: {}, templateOverrides: {}, adPages: [] };
const gen = generateIssue({ ...buildIssuePlan(inp), status: "approved" }, inp, 0, "Asha");
const ctx = makeContext(gen.publication, gen.pages, articles, gen.templates, settings, 0);
const manifest = buildInDesignManifestV2(ctx, [], gen.pages.map((p) => p.number));

describe("InDesign manifest", () => {
  it("describes an editable document: parents, layers, named styles and objects", () => {
    expect(manifest.schema).toBe(MANIFEST_SCHEMA);
    expect(manifest.document.widthPt).toBeCloseTo(595.28, 1);
    expect(manifest.layers).toEqual(["Background", "Images", "Text", "Furniture"]);
    expect(manifest.parents!.length).toBeGreaterThanOrEqual(1);
    for (const p of manifest.parents!) {
      expect(p.prefix).toMatch(/^[B-Z]$/);
      const folio = [...p.left, ...p.right].filter((i) => i.type === "text" && (i as IdText).autoPageNumber) as IdText[];
      expect(folio).toHaveLength(2);
      expect(folio[0].paragraphs![0].style).toBe("PF/Page Number");
      for (const it of [...p.left, ...p.right]) expect(it.layer).toBe("Furniture");
    }
    const names = Object.keys(manifest.paragraphStyles);
    for (const n of ["PF/Headline", "PF/Body", "PF/Caption", "PF/Page Number", "PF/Running Head", "PF/Cover Title"]) expect(names.some((x) => x === n || x.startsWith(n + " "))).toBe(true);
    expect(names.some((n) => n.startsWith("PF/Body Subhead"))).toBe(false);
    const items = manifest.pages.flatMap((p) => p.items);
    expect(items.every((i) => i.name && i.layer)).toBe(true);
    expect(items.filter((i) => i.type === "image").every((i) => i.layer === "Images")).toBe(true);
    // Covers and advertisements carry no parent; editorial pages do.
    const cover = manifest.pages.find((p) => p.number === 1)!;
    expect(cover.parent).toBeNull();
    const editorial = manifest.pages.find((p) => p.number === 5)!;
    expect(editorial.parent).toBeTruthy();
    expect(manifest.parents!.some((p) => p.id === editorial.parent)).toBe(true);
    // Furniture is no longer repeated as page items.
    expect(items.some((i) => i.label === "Page number" || i.label === "Folio number")).toBe(false);
  });

  it("threads stories across continuation pages and keeps news briefs as their own frames", () => {
    for (const s of manifest.stories) {
      expect(s.frames.length).toBeGreaterThan(0);
      expect(s.paragraphs.length).toBeGreaterThan(0);
      for (const f of s.frames) expect(manifest.pages.some((p) => p.items.some((i) => i.id === f))).toBe(true);
    }
    const news = gen.pages.find((p) => p.format === "news-page")!;
    const page = manifest.pages.find((p) => p.pageId === news.id)!;
    const briefs = page.items.filter((i) => i.type === "text" && /^Brief \d$/.test(i.label)) as IdText[];
    expect(briefs.length).toBe(news.storyIds!.length);
    for (const b of briefs) {
      expect(b.story).toBeUndefined();
      expect(b.paragraphs!.length).toBeGreaterThan(0);
      expect(b.reportOverset).toBe(true);
    }
  });

  it("lists every font the styles use and every image link", () => {
    const families = new Set(Object.values(manifest.paragraphStyles).map((s) => `${s.family}|${s.fontStyle}`));
    for (const f of manifest.fonts) expect(families.has(`${f.family}|${f.fontStyle}`)).toBe(true);
    for (const l of manifest.links) expect(l.path.startsWith("links/")).toBe(true);
  });
});
