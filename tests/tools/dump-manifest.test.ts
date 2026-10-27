import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderSampleSvg } from "@/lib/artwork";
import { buildInDesignManifestV2 } from "@/lib/indesign/build-manifest";
import { makeContext } from "@/lib/layout-engine";
import { buildFormatTemplates } from "@/lib/reference/formats";
import { buildIssuePlan, generateIssue, type PlanInput } from "@/lib/reference/plan";
import { deriveDesignSpec } from "@/lib/reference/spec";
import { healthArticles, houseTemplates, makeProfile, settings } from "../helpers/fixtures";

/**
 * Tooling, not a check: writes a studio-generated manifest and its sample
 * image links to DUMP_MANIFEST_DIR so `scripts/indesign-mock.mjs` can run the
 * ExtendScript build against it. Skipped unless DUMP_MANIFEST_DIR is set.
 */
describe.skipIf(!process.env.DUMP_MANIFEST_DIR)("dump manifest", () => {
  it("writes manifest.json and links/", () => {
    const dir = process.env.DUMP_MANIFEST_DIR!;
    fs.mkdirSync(path.join(dir, "links"), { recursive: true });
    const profile = makeProfile();
    const spec = deriveDesignSpec(profile);
    const formats = buildFormatTemplates(profile, spec);
    const articles = healthArticles();
    const inp: PlanInput = { profile, spec, formats, templates: [...houseTemplates, ...formats.templates], articles, settings, title: "Health Innovation Review", issueLabel: "November 2026", topic: "Health", pageCount: 20, includeAds: true, articleIds: articles.map((a) => a.id), formatOverrides: {}, templateOverrides: {}, adPages: [] };
    const gen = generateIssue({ ...buildIssuePlan(inp), status: "approved", approvedBy: "tool" }, inp, 0, "tool");
    const ctx = makeContext(gen.publication, gen.pages, articles, gen.templates, settings, 0);
    const manifest = buildInDesignManifestV2(ctx, [], gen.pages.map((p) => p.number));
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
    let written = 0;
    for (const l of manifest.links) {
      if (l.source !== "sample") continue;
      const svg = renderSampleSvg(l.assetId);
      if (svg) {
        fs.writeFileSync(path.join(dir, l.path), svg);
        written++;
      }
    }
    expect(manifest.pages.length).toBe(20);
    console.log(`manifest: ${manifest.pages.length} pages, ${manifest.parents?.length} parents, ${Object.keys(manifest.paragraphStyles).length} styles, ${written}/${manifest.links.length} links written to ${dir}`);
  });
});
