import JSZip from "jszip";
import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "pglite://memory";
process.env.AUTH_SECRET ??= "test-secret-0123456789abcdefghijklmnopqrstuvwxyz";

/** Build lifecycle rules that do not need Adobe: release eligibility and the script bundle Adobe receives. */
describe("InDesign job lifecycle", () => {
  it("releases only clean, finished print builds with a PDF", async () => {
    const { evaluateRelease } = await import("@/server/print/jobs");
    const clean = { pages: 16, stories: 7, overset: [], autoFitted: [], missingFonts: [], images: [{ id: "i", page: 1, link: "links/a.svg", status: "placed" as const }], preflight: { profile: "[Basic]", errors: 0, results: [] }, warnings: [], timings: {} };
    const pdf = [{ name: "issue.pdf", kind: "pdf" as const, key: "k", bytes: 10 }];
    expect(evaluateRelease("succeeded", clean, pdf)).toEqual({ eligible: true, reasons: [] });
    expect(evaluateRelease("failed", clean, pdf).reasons[0]).toMatch(/did not finish cleanly/);
    expect(evaluateRelease("succeeded", undefined, pdf).reasons[0]).toMatch(/No InDesign build report/);
    expect(evaluateRelease("succeeded", clean, []).reasons[0]).toMatch(/No print PDF/);
    const dirty = { ...clean, overset: [{ id: "x", label: "Body", page: 3, characters: 40 }], missingFonts: ["GoodPro Bold"], preflight: { profile: "[Basic]", errors: 1, results: ["Missing font"] }, images: [{ id: "j", page: 2, link: "links/b.jpg", status: "failed" as const }] };
    const r = evaluateRelease("succeeded", dirty, pdf);
    expect(r.eligible).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/overset/);
    expect(r.reasons.join(" ")).toMatch(/Missing fonts/);
    expect(r.reasons.join(" ")).toMatch(/1 image\(s\) not placed/);
    expect(r.reasons.join(" ")).toMatch(/preflight found 1 error/);
  });

  it("bundles the build script for Adobe within the size limit and with the current version", async () => {
    const { scriptBundle, SCRIPT_NAME, SCRIPT_VERSION } = await import("@/server/indesign/pipeline");
    const zip = await JSZip.loadAsync(await scriptBundle());
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    expect(manifest.name).toBe(SCRIPT_NAME);
    expect(manifest.version).toBe(SCRIPT_VERSION);
    expect(SCRIPT_VERSION).toBe("1.1.0");
    const script = await zip.file("build.jsx")!.async("string");
    expect(script).toMatch(/PF\.createParents/);
    expect(script).toMatch(/SpecialCharacters\.AUTO_PAGE_NUMBER/);
    expect(/^[\x00-\x7f]*$/.test(script)).toBe(true); // ExtendScript stays ASCII
    expect((await zip.generateAsync({ type: "uint8array" })).length).toBeLessThan(5 * 1024 * 1024);
  });
});
