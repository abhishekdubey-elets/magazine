"use client";

import { Clock, Copy, Timer } from "lucide-react";
import { useMemo, useState } from "react";
import { fmtDateTime } from "@/components/common";
import { toast } from "@/components/shell/toast";
import { Badge, Button, Card, CardHeader, cn, Field, Input } from "@/components/ui";
import { useFonts } from "@/lib/hooks";
import { runIssueQa } from "@/lib/issue-qa";
import { makeContext } from "@/lib/layout-engine";
import { fmtMs, pilotReportText, pilotSummary, totalMs } from "@/lib/pilot";
import { deriveDesignSpec, FORMAT_LABEL } from "@/lib/reference/spec";
import { useStore } from "@/lib/store";
import type { PilotRun, Publication, ReferenceProfile } from "@/lib/types";
import { useStudio } from "./studio-state";

/** Stage F — the pilot comparison: real timings, corrections, failures, approval and time saved. */
export function PilotStage({ profile, publication }: { profile: ReferenceProfile; publication: Publication }) {
  const spec = profile.spec ?? deriveDesignSpec(profile);
  const allPages = useStore((s) => s.pages);
  const articles = useStore((s) => s.articles);
  const templates = useStore((s) => s.templates);
  const settings = useStore((s) => s.settings);
  const uploads = useStore((s) => s.uploads);
  const jobs = useStore((s) => s.exportJobs);
  const fontsVersion = useFonts((f) => f.version);
  const { pilotPages, setPilotPages } = useStudio();
  const [baseline, setBaseline] = useState(String(publication.pilot?.manualBaselineMinutes ?? ""));

  const pages = useMemo(() => allPages.filter((p) => p.publicationId === publication.id).sort((a, b) => a.number - b.number), [allPages, publication.id]);
  const ctx = useMemo(() => makeContext(publication, pages, articles, templates, settings, fontsVersion), [publication, pages, articles, templates, settings, fontsVersion]);
  const pubJobs = jobs.filter((j) => j.publicationId === publication.id && j.indesign);
  const report = useMemo(() => runIssueQa(ctx, uploads, { plan: publication.plan, spec, pdfPreset: spec.print.pdfPreset, minPpi: spec.print.minPpi, targetPpi: spec.print.targetPpi, indesignReport: pubJobs.find((j) => j.status === "completed")?.indesign?.report }), [ctx, uploads, publication.plan, spec, pubJobs]);

  // Live facts about the output and approvals complete the recorded pilot.
  const pilot: PilotRun | undefined = useMemo(() => {
    const p = publication.pilot;
    if (!p) return undefined;
    const completed = pubJobs.filter((j) => j.status === "completed" && j.indesign?.outputs.some((o) => o.kind === "pdf"));
    const buildMs = completed.reduce((n, j) => n + (j.indesign?.report?.timings.overall ?? j.durationMs ?? 0), 0);
    const released = pubJobs.some((j) => j.indesign?.release?.status === "released");
    const rejected = pubJobs.some((j) => j.indesign?.release?.status === "rejected");
    return {
      ...p,
      referencePages: pilotPages.length ? pilotPages : p.referencePages,
      timings: { ...p.timings, buildMs: p.timings.buildMs || buildMs },
      output: completed.length ? "indesign" : pages.some((x) => x.status !== "planned") ? "browser-preview" : "none",
      approvalStatus: released ? "released" : rejected ? "rejected" : pages.length && pages.every((x) => x.status === "approved") ? "approved" : "pending",
      unresolvedFailures: report.blockers,
    };
  }, [publication.pilot, pubJobs, pages, report.blockers, pilotPages]);

  if (!pilot) return <Card className="p-6 text-[13px] text-muted">No pilot run is recorded for this issue. Generate the issue from the plan to start one.</Card>;
  const s = pilotSummary(pilot);
  const saveBaseline = () => {
    const minutes = Number(baseline);
    useStore.getState().updatePublication(publication.id, { pilot: { ...pilot, manualBaselineMinutes: minutes > 0 ? minutes : undefined } });
    toast("success", "Baseline saved", minutes > 0 ? `${minutes} minutes for the same pages by hand.` : "Baseline cleared.");
  };
  const copy = async () => {
    await navigator.clipboard.writeText(pilotReportText(pilot, `${publication.title} — ${publication.issueLabel}`));
    toast("success", "Report copied");
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
      <div className="space-y-5">
        <Card>
          <CardHeader
            title={<span className="flex items-center gap-2"><Timer className="size-4 text-muted" /> Time comparison</span>}
            description="Automated timings are measured from the actual steps in this session. The manual baseline is what the same pages take with the current process."
            actions={<Badge tone={s.passed ? "ok" : "neutral"} dot>{s.passed ? "Pilot passed" : "Pilot not yet passed"}</Badge>}
          />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <Stat label="Pages produced" value={String(s.pages)} sub={`${pilot.formatsTested.length} formats: ${pilot.formatsTested.map((f) => FORMAT_LABEL[f]).join(", ") || "—"}`} />
            <Stat label="Automated total" value={fmtMs(s.automatedMs)} sub="analysis + planning + generation + build + QA + corrections" />
            <Stat label="Manual baseline" value={s.manualBaselineMinutes ? `${s.manualBaselineMinutes} min` : "—"} sub="entered by the team" />
            <Stat label="Time saved" value={s.timeSavedPercent === undefined ? "—" : `${s.timeSavedPercent}%`} sub={s.speedUp ? `${s.speedUp}× faster` : "needs the manual baseline"} tone={s.timeSavedPercent === undefined ? undefined : s.timeSavedPercent > 0 ? "ok" : "err"} />
            <Stat label="Corrections" value={String(s.corrections)} sub={`${s.qaFailuresBefore} QA failures before correction`} />
            <Stat label="Unresolved failures" value={String(s.unresolvedFailures)} sub={`approval: ${s.approvalStatus} · output: ${s.output}`} tone={s.unresolvedFailures ? "err" : "ok"} />
          </div>
          <table className="w-full border-t border-line text-[12.5px]">
            <tbody>
              {s.timings.map((t) => (
                <tr key={t.stage} className="border-b border-line/70">
                  <td className="px-5 py-1.5 text-ink-2">{t.label}</td>
                  <td className="py-1.5 pr-5 text-right text-ink tabular-nums">{fmtMs(t.ms)}</td>
                </tr>
              ))}
              <tr>
                <td className="px-5 py-2 font-semibold text-ink">Total elapsed (automated)</td>
                <td className="py-2 pr-5 text-right font-semibold text-ink tabular-nums">{fmtMs(totalMs(pilot.timings))}</td>
              </tr>
            </tbody>
          </table>
          <p className={cn("border-t border-line px-5 py-3 text-[12.5px]", s.passed ? "text-ok" : "text-ink-2")}>{s.verdict}</p>
        </Card>

        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Clock className="size-4 text-muted" /> How the timings were measured</span>} />
          <ul className="divide-y divide-line">
            {pilot.events.map((e, i) => (
              <li key={i} className="flex gap-3 px-5 py-2 text-[12px]">
                <span className="w-[120px] shrink-0 text-muted">{fmtDateTime(e.at)}</span>
                <span className="text-ink-2">{e.detail}</span>
              </li>
            ))}
            {!pilot.events.length && <li className="px-5 py-4 text-[12px] text-muted">No events yet.</li>}
          </ul>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader title="Manual baseline" description="Minutes the team needs to produce these pages by hand with the current InDesign process." />
          <div className="flex items-end gap-2 p-5">
            <Field label="Minutes" htmlFor="pilot-baseline" className="flex-1">
              <Input id="pilot-baseline" type="number" min={0} value={baseline} onChange={(e) => setBaseline(e.target.value)} placeholder="e.g. 480" />
            </Field>
            <Button variant="primary" onClick={saveBaseline}>
              Save
            </Button>
          </div>
          <p className="px-5 pb-4 text-[11.5px] text-muted">Time saved (%) = ((manual − automated) ÷ manual) × 100. No speed-up is claimed until a comparable baseline is recorded.</p>
        </Card>
        <Card>
          <CardHeader title="Reference pages sampled" description="The 10–15 reference pages the pilot reproduces (defaults to the layout model pages)." />
          <div className="p-5">
            <Input aria-label="Reference pages" defaultValue={pilot.referencePages.join(", ")} onBlur={(e) => setPilotPages(e.target.value.split(/[,\s]+/).map(Number).filter((n) => n > 0))} placeholder="e.g. 4, 5, 6, 7, 8" />
            <p className="mt-2 text-[11.5px] text-muted">{pilot.referencePages.length} pages · {profile.name}</p>
          </div>
        </Card>
        <Card>
          <CardHeader title="Report" actions={<Button size="sm" variant="secondary" onClick={copy}><Copy /> Copy</Button>} />
          <pre className="thin-scroll overflow-x-auto px-5 py-4 text-[11.5px] leading-relaxed whitespace-pre-wrap text-ink-2">{pilotReportText(pilot, `${publication.title} — ${publication.issueLabel}`)}</pre>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "err" }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="text-[11.5px] text-muted">{label}</p>
      <p className={cn("mt-0.5 text-[20px] font-semibold tabular-nums", tone === "ok" ? "text-ok" : tone === "err" ? "text-err" : "text-ink")}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </div>
  );
}
