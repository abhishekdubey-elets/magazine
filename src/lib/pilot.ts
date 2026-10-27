import type { EditorialFormat, PilotRun, PilotTimings } from "./types";

/**
 * Pilot mode: real timings for producing 10–15 pages from a reference, and the
 * comparison with the team's manual baseline. Timings are recorded from the
 * actual steps (analysis, planning, generation, InDesign build, QA, corrections);
 * the manual baseline is entered by the team.
 */

export const STAGE_LABEL: Record<keyof PilotTimings, string> = {
  analysisMs: "Reference analysis",
  planningMs: "Design review & issue planning",
  generationMs: "Layout generation",
  buildMs: "InDesign build",
  qaMs: "Quality assurance",
  correctionMs: "Corrections",
};

export function newPilot(referenceId: string, referencePages: number[], pageCount: number): PilotRun {
  return {
    id: `pilot-${Date.now().toString(36)}`,
    referenceId,
    startedAt: new Date().toISOString(),
    referencePages,
    pageCount,
    formatsTested: [],
    timings: { analysisMs: 0, planningMs: 0, generationMs: 0, buildMs: 0, qaMs: 0, correctionMs: 0 },
    corrections: 0,
    qaFailuresBefore: 0,
    unresolvedFailures: 0,
    output: "none",
    approvalStatus: "pending",
    events: [],
  };
}

/** Add measured time to a stage (ms) with a note on how it was measured. */
export function recordStage(p: PilotRun, stage: keyof PilotTimings, ms: number, detail: string): PilotRun {
  const add = Math.max(0, Math.round(ms));
  return { ...p, timings: { ...p.timings, [stage]: p.timings[stage] + add }, events: [...p.events, { at: new Date().toISOString(), stage, detail: `${detail} (+${fmtMs(add)})` }] };
}

export function noteEvent(p: PilotRun, detail: string): PilotRun {
  return { ...p, events: [...p.events, { at: new Date().toISOString(), stage: "note", detail }] };
}

export const totalMs = (t: PilotTimings) => Object.values(t).reduce((a, b) => a + b, 0);

/** Time saved (%) = ((manual − automated) / manual) × 100. Undefined without a manual baseline. */
export function timeSavedPercent(manualMinutes: number | undefined, automatedMs: number): number | undefined {
  if (!manualMinutes || manualMinutes <= 0) return undefined;
  const manualMs = manualMinutes * 60_000;
  return Math.round(((manualMs - automatedMs) / manualMs) * 1000) / 10;
}

/** Speed-up factor (manual ÷ automated), e.g. 10 for "10× faster". */
export function speedUp(manualMinutes: number | undefined, automatedMs: number): number | undefined {
  if (!manualMinutes || manualMinutes <= 0 || automatedMs <= 0) return undefined;
  return Math.round(((manualMinutes * 60_000) / automatedMs) * 10) / 10;
}

export function fmtMs(ms: number) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m} min ${s} s`;
}

export interface PilotSummary {
  pages: number;
  manualBaselineMinutes?: number;
  automatedMs: number;
  timings: { stage: keyof PilotTimings; label: string; ms: number }[];
  corrections: number;
  qaFailuresBefore: number;
  unresolvedFailures: number;
  approvalStatus: PilotRun["approvalStatus"];
  output: PilotRun["output"];
  timeSavedPercent?: number;
  speedUp?: number;
  formatsTested: EditorialFormat[];
  /** The pilot passes only with a releasable result, no unresolved failures and a recorded baseline. */
  passed: boolean;
  verdict: string;
}

export function pilotSummary(p: PilotRun): PilotSummary {
  const automatedMs = totalMs(p.timings);
  const saved = timeSavedPercent(p.manualBaselineMinutes, automatedMs);
  const released = p.approvalStatus === "released";
  // Only a real InDesign production run can pass; browser previews are measured but never count as output.
  const clean = p.unresolvedFailures === 0 && p.output === "indesign";
  const passed = clean && released && saved !== undefined;
  const verdict = !p.manualBaselineMinutes
    ? "Enter the manual baseline (minutes the same pages take by hand) to compute the time saved."
    : p.output === "none"
      ? "No output produced yet."
      : p.unresolvedFailures > 0
        ? `${p.unresolvedFailures} quality failure${p.unresolvedFailures > 1 ? "s" : ""} unresolved — the pilot does not pass until they are fixed.`
        : !released
          ? "Output is clean; the pilot passes once an editor releases it to print."
          : p.output !== "indesign"
            ? "Measured on browser previews only — the InDesign build was not run."
            : `Passed: ${saved}% time saved against the manual baseline (${speedUp(p.manualBaselineMinutes, automatedMs)}× faster).`;
  return {
    pages: p.pageCount,
    manualBaselineMinutes: p.manualBaselineMinutes,
    automatedMs,
    timings: (Object.keys(STAGE_LABEL) as (keyof PilotTimings)[]).map((stage) => ({ stage, label: STAGE_LABEL[stage], ms: p.timings[stage] })),
    corrections: p.corrections,
    qaFailuresBefore: p.qaFailuresBefore,
    unresolvedFailures: p.unresolvedFailures,
    approvalStatus: p.approvalStatus,
    output: p.output,
    timeSavedPercent: saved,
    speedUp: speedUp(p.manualBaselineMinutes, automatedMs),
    formatsTested: p.formatsTested,
    passed,
    verdict,
  };
}

/** Plain-text comparison report (for the record and for pasting into a review). */
export function pilotReportText(p: PilotRun, title: string): string {
  const s = pilotSummary(p);
  const lines = [
    `Pilot report — ${title}`,
    `Pages produced: ${s.pages}`,
    `Reference pages sampled: ${p.referencePages.join(", ") || "—"}`,
    `Formats tested: ${s.formatsTested.join(", ") || "none"}`,
    `Manual baseline: ${s.manualBaselineMinutes ? `${s.manualBaselineMinutes} min` : "not entered"}`,
    ...s.timings.map((t) => `${t.label}: ${fmtMs(t.ms)}`),
    `Total automated time: ${fmtMs(s.automatedMs)}`,
    `Manual corrections: ${s.corrections}`,
    `QA failures before correction: ${s.qaFailuresBefore}`,
    `Unresolved failures: ${s.unresolvedFailures}`,
    `Output: ${s.output}`,
    `Approval status: ${s.approvalStatus}`,
    `Time saved: ${s.timeSavedPercent === undefined ? "—" : `${s.timeSavedPercent}%`}${s.speedUp ? ` (${s.speedUp}×)` : ""}`,
    `Verdict: ${s.verdict}`,
  ];
  return lines.join("\n");
}
