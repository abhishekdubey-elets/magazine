import { describe, expect, it } from "vitest";
import { newPilot, pilotReportText, pilotSummary, recordStage, speedUp, timeSavedPercent, totalMs } from "@/lib/pilot";

describe("pilot timing", () => {
  it("computes time saved with the agreed formula", () => {
    // Manual 600 min, automated 60 min → ((600 − 60) / 600) × 100 = 90 %
    expect(timeSavedPercent(600, 60 * 60_000)).toBe(90);
    expect(speedUp(600, 60 * 60_000)).toBe(10);
    expect(timeSavedPercent(undefined, 1000)).toBeUndefined();
    expect(timeSavedPercent(0, 1000)).toBeUndefined();
    // Slower than manual is negative, not clamped.
    expect(timeSavedPercent(10, 20 * 60_000)).toBe(-100);
  });

  it("records real stage timings and does not claim a pass without baseline, release and clean output", () => {
    let p = newPilot("ref-test", [4, 5, 6, 7, 8], 12);
    p = recordStage(p, "analysisMs", 4200, "Reference analysed");
    p = recordStage(p, "planningMs", 90_000, "Plan approved");
    p = recordStage(p, "generationMs", 3100, "16 pages generated");
    p = recordStage(p, "qaMs", 2000, "QA run");
    expect(totalMs(p.timings)).toBe(99_300);
    expect(p.events).toHaveLength(4);
    let s = pilotSummary(p);
    expect(s.passed).toBe(false);
    expect(s.verdict).toMatch(/Enter the manual baseline/);
    p = { ...p, manualBaselineMinutes: 480, output: "indesign", approvalStatus: "released", unresolvedFailures: 0, formatsTested: ["interview", "feature"] };
    s = pilotSummary(p);
    expect(s.passed).toBe(true);
    expect(s.timeSavedPercent).toBeCloseTo(99.7, 1);
    expect(s.verdict).toMatch(/Passed/);
    const text = pilotReportText(p, "Health Innovation Review");
    expect(text).toContain("Pages produced: 12");
    expect(text).toContain("Formats tested: interview, feature");
    expect(text).toContain("Time saved: 99.7%");
    // Browser-only output never passes as a real InDesign pilot.
    expect(pilotSummary({ ...p, output: "browser-preview" }).passed).toBe(false);
    expect(pilotSummary({ ...p, unresolvedFailures: 2 }).verdict).toMatch(/2 quality failures unresolved/);
  });
});
