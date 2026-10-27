import { describe, expect, it } from "vitest";
import { applySpec, confirmFinding, confirmSpec, deriveDesignSpec, getFinding, lowConfidenceFindings, LOW_CONFIDENCE } from "@/lib/reference/spec";
import { DESIGN_SPEC_SCHEMA } from "@/lib/types";
import { makeProfile } from "./helpers/fixtures";

describe("design specification", () => {
  const profile = makeProfile();
  const spec = deriveDesignSpec(profile);

  it("records every property as a finding with confidence, source and evidence", () => {
    expect(spec.schema).toBe(DESIGN_SPEC_SCHEMA);
    expect(spec.version).toBe(1);
    expect(spec.page.trim.value).toEqual({ width: 210, height: 280 });
    expect(spec.page.trim.source).toBe("extracted");
    expect(spec.page.trim.confidence).toBeGreaterThan(0.9);
    expect(spec.page.bleed.value).toBe(3);
    expect(spec.page.margins.evidence).toEqual([5, 6, 7, 9, 10]);
    expect(spec.page.columns.value).toBe(3);
    expect(spec.typography.body.value.size).toBe(9.5);
    expect(spec.typography.body.value.leading).toBe(12.5);
    expect(spec.typography.headline.value.size).toBe(32);
    expect(spec.structure.sections.value.map((s) => s.name)).toEqual(["Digital Governance", "Public Policy"]);
    for (const f of [spec.page.trim, spec.page.margins, spec.typography.body, spec.identity.palette]) {
      expect(f.confidence).toBeGreaterThanOrEqual(0);
      expect(f.confidence).toBeLessThanOrEqual(1);
      expect(["extracted", "inferred", "default", "confirmed"]).toContain(f.source);
    }
  });

  it("detects furniture and image patterns from the measured pages", () => {
    expect(spec.page.furniture.value.runningHead).toBe("top-outside");
    expect(spec.page.furniture.value.folio).toBe("bottom-outside");
    expect(spec.images.aspectRatios.value.length).toBeGreaterThan(0);
    expect(spec.images.aspectRatios.value.reduce((n, r) => n + r.share, 0)).toBeGreaterThan(90);
  });

  it("maps every editorial format to a layout, labelling inferred ones", () => {
    const by = Object.fromEntries(spec.layouts.map((l) => [l.format, l]));
    expect(Object.keys(by).sort()).toEqual(["company-profile", "event-report", "feature", "government-perspective", "interview", "news-page"]);
    expect(by.interview.derivation).toBe("geometry");
    expect(by.interview.sourcePage).toBe(5);
    expect(by["government-perspective"].sourcePage).toBe(4);
    expect(by["news-page"].examples.length).toBeGreaterThan(0);
    expect(spec.review.warnings.join(" ")).toContain("Blank pages in the reference: 11");
  });

  it("marks defaults as low confidence so editors are asked to confirm them", () => {
    const scanned = deriveDesignSpec(makeProfile({ hasTextLayer: false, evidence: undefined, trimSource: "mediabox", bleedSource: "none", bleed: 0 }));
    expect(scanned.page.bleed.source).toBe("default");
    expect(scanned.page.bleed.confidence).toBeLessThan(LOW_CONFIDENCE);
    expect(scanned.typography.body.source).toBe("default");
    const low = lowConfidenceFindings(scanned).map((f) => f.path);
    expect(low).toContain("page.bleed");
    expect(low).toContain("typography.body");
    expect(scanned.review.warnings.some((w) => /scanned or outlined/.test(w))).toBe(true);
    expect(scanned.review.warnings.some((w) => /No TrimBox/.test(w))).toBe(true);
  });

  it("lets an editor correct a finding and keeps it across rebuilds", () => {
    const edited = confirmFinding(spec, "page.margins", { top: 20, bottom: 20, inside: 18, outside: 14 }, "Asha");
    const f = getFinding(edited, "page.margins")!;
    expect(f.source).toBe("confirmed");
    expect(f.confidence).toBe(1);
    expect(f.detected).toEqual({ top: 22, bottom: 18, inside: 15, outside: 15 });
    expect(edited.version).toBe(2);
    expect(edited.review.edited).toEqual(["page.margins"]);
    // Re-analysing the same reference must not discard the editor's correction.
    const rebuilt = deriveDesignSpec(profile, edited);
    expect(getFinding(rebuilt, "page.margins")!.value).toEqual({ top: 20, bottom: 20, inside: 18, outside: 14 });
    expect(rebuilt.version).toBe(3);
    const confirmed = confirmSpec(rebuilt, "Asha");
    expect(confirmed.review.status).toBe("confirmed");
    expect(confirmed.review.confirmedBy).toBe("Asha");
    const applied = applySpec(profile, confirmed);
    expect(applied.margins.inside).toBe(18);
    expect(applied.spec?.version).toBe(confirmed.version);
  });

  it("rejects unknown findings", () => {
    expect(() => confirmFinding(spec, "page.nothing", 1)).toThrow(/Unknown finding/);
  });
});
