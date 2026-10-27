"use client";

import { AlertTriangle, BadgeCheck, CheckCircle2, Download, ExternalLink, FileText, Loader2, OctagonX, Package, Printer, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fmtDateTime } from "@/components/common";
import { toast } from "@/components/shell/toast";
import { Badge, Button, Card, CardHeader, cn, Textarea } from "@/components/ui";
import type { GateResult, JobOutput, JobView } from "@/lib/indesign/manifest-types";
import { useCan } from "@/lib/sync/engine";
import { useStore } from "@/lib/store";
import type { ExportJob } from "@/lib/types";
import { decidePrintRelease, getInDesignJob, STAGE_LABEL } from "@/services/indesign";

const POLL_MS = 5000;
const MAX_AGE_MS = 30 * 60 * 1000;

/** Polls every running InDesign job until it finishes, then records outputs and the build report. */
export function useInDesignPolling() {
  const jobs = useStore((s) => s.exportJobs);
  const settings = useStore((s) => s.settings);
  const running = jobs.filter((j) => j.status === "running" && j.indesign?.jobId);
  const key = running.map((j) => j.id).join(",");
  const busy = useRef(false);

  useEffect(() => {
    if (!running.length) return;
    const tick = async () => {
      if (busy.current) return;
      busy.current = true;
      const { updateExportJob, log } = useStore.getState();
      for (const job of useStore.getState().exportJobs.filter((j) => j.status === "running" && j.indesign?.jobId)) {
        try {
          const view = await getInDesignJob(job.indesign!.jobId, settings);
          const done = view.status === "succeeded" || view.status === "partial_success";
          if (done || view.status === "failed") {
            const ms = Date.now() - new Date(job.createdAt).getTime();
            updateExportJob(job.id, {
              status: done ? "completed" : "failed",
              durationMs: ms,
              message: view.status === "failed" ? view.errors.join("; ") || "InDesign job failed." : view.status === "partial_success" ? "Finished with some errors." : undefined,
              indesign: { ...job.indesign!, ...serverFields(view), stage: STAGE_LABEL[view.status], outputs: view.outputs, report: view.report, errors: view.errors },
            });
            const awaiting = view.release?.status === "pending";
            log({ kind: "export", message: done ? `InDesign build finished: ${job.fileName} (${view.outputs.length} files)${awaiting ? " — clean, awaiting editor release" : ""}` : `InDesign build failed: ${job.fileName}`, actor: "Adobe InDesign API", tone: done ? "success" : "error" });
            toast(
              done ? "success" : "error",
              done ? (awaiting ? "Print build is clean" : "InDesign build finished") : "InDesign build failed",
              done ? (awaiting ? "An editor can now release it to print." : view.release?.reasons.length ? view.release.reasons[0] : `${view.outputs.length} files ready to download`) : view.errors[0],
            );
          } else {
            updateExportJob(job.id, { indesign: { ...job.indesign!, stage: STAGE_LABEL[view.status] } });
            if (Date.now() - new Date(job.createdAt).getTime() > MAX_AGE_MS) {
              updateExportJob(job.id, { status: "failed", message: "No result after 30 minutes — check the job in Adobe's status API.", indesign: { ...job.indesign!, stage: "Timed out" } });
            }
          }
        } catch (e) {
          updateExportJob(job.id, { indesign: { ...job.indesign!, stage: `Status check failed: ${e instanceof Error ? e.message : String(e)} — retrying` } });
        }
      }
      busy.current = false;
    };
    void tick();
    const t = setInterval(tick, POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** Server-mode fields of a job view; demo-mode links expire with Adobe's temporary storage. */
function serverFields(view: JobView) {
  return view.archived
    ? { kind: view.kind, gates: view.gates, release: view.release, archived: true, expiresAt: undefined }
    : { expiresAt: new Date(Date.now() + 23 * 3600 * 1000).toISOString() };
}

const ICON: Record<JobOutput["kind"], React.ReactNode> = {
  pdf: <FileText className="size-4 text-err" />,
  indd: <Package className="size-4 text-[#d9306f]" />,
  idml: <Package className="size-4 text-[#d9306f]" />,
  jpeg: <FileText className="size-4 text-muted" />,
  report: <FileText className="size-4 text-muted" />,
  other: <FileText className="size-4 text-muted" />,
};

export function InDesignJobCard({ job }: { job: ExportJob }) {
  const [showAll, setShowAll] = useState(false);
  const d = job.indesign!;
  const running = job.status === "running";
  const expired = d.expiresAt ? new Date(d.expiresAt).getTime() < Date.now() : false;
  const files = d.outputs.filter((o) => o.kind !== "jpeg");
  const previews = d.outputs.filter((o) => o.kind === "jpeg");
  const r = d.report;
  const problems = r ? r.overset.length + r.missingFonts.length + r.images.filter((i) => i.status !== "placed").length + (r.preflight?.errors ?? 0) : 0;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {running ? <Loader2 className="size-4 animate-spin text-brand" /> : job.status === "completed" ? <CheckCircle2 className="size-4 text-ok" /> : <XCircle className="size-4 text-err" />}
            InDesign build · {job.fileName}
          </span>
        }
        description={`${job.pages.length} page${job.pages.length === 1 ? "" : "s"} · started ${fmtDateTime(job.createdAt)}${job.durationMs && !running ? ` · ${Math.round(job.durationMs / 1000)} s` : ""} · job ${d.jobId}`}
        actions={
          <Badge tone={running ? "brand" : job.status === "completed" ? (d.release?.status === "released" ? "ok" : problems ? "warn" : "ok") : "err"}>
            {running ? "Running" : job.status === "completed" ? (d.release?.status === "released" ? "Released" : problems ? `${problems} issues` : "Clean") : "Failed"}
          </Badge>
        }
      />
      <div className="space-y-4 p-5">
        {running && <p className="text-[13px] text-ink-2">{d.stage ?? "Starting…"} You can leave this page — the job keeps running and results appear here.</p>}
        {d.kind === "print" && job.status === "completed" && d.release && <ReleasePanel job={job} />}
        {job.status === "failed" && <p className="rounded-md bg-err-50 px-3 py-2 text-[12.5px] text-err">{job.message ?? "The InDesign job failed."}</p>}

        {files.length > 0 && (
          <div>
            <p className="mb-2 text-[12.5px] font-medium text-ink-2">
              Files{" "}
              {d.archived ? (
                <span className="text-muted">(archived in the workspace)</span>
              ) : expired ? (
                <span className="text-warn">(links expired — run the build again)</span>
              ) : (
                <span className="text-muted">(links valid about 24 hours)</span>
              )}
            </p>
            <ul className="grid gap-2 sm:grid-cols-3">
              {files.map((o) => (
                <li key={o.path}>
                  <a
                    href={expired ? undefined : o.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn("flex items-center gap-2.5 rounded-lg border border-line px-3 py-2.5 text-[13px] transition", expired ? "pointer-events-none opacity-50" : "hover:border-brand hover:bg-brand-50/40")}
                  >
                    {ICON[o.kind]}
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{o.name}</span>
                    <Download className="size-4 text-muted" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {previews.length > 0 && !expired && (
          <div>
            <p className="mb-2 text-[12.5px] font-medium text-ink-2">Pages rendered by InDesign</p>
            <div className="thin-scroll flex gap-3 overflow-x-auto pb-1">
              {(showAll ? previews : previews.slice(0, 12)).map((o) => (
                <a key={o.path} href={o.url} target="_blank" rel="noopener noreferrer" className="shrink-0" title={o.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={o.url} alt={o.name} className="h-40 rounded-sm border border-line shadow-card" loading="lazy" />
                </a>
              ))}
              {previews.length > 12 && !showAll && (
                <button className="shrink-0 rounded-md border border-dashed border-line px-4 text-[12.5px] text-muted hover:text-ink" onClick={() => setShowAll(true)}>
                  +{previews.length - 12} more
                </button>
              )}
            </div>
          </div>
        )}

        {r && (
          <div className="grid gap-3 md:grid-cols-2">
            <ReportList title="Overset text (InDesign)" ok="All text fits its frames." items={r.overset.map((o) => `Page ${o.page} · ${o.label}: ${o.characters} characters hidden`)} />
            <ReportList title="Fonts" ok="All fonts installed." items={r.missingFonts.map((f) => `Missing: ${f} — upload it to the fonts folder`)} />
            <ReportList title="Images" ok={`${r.images.length} images placed.`} items={r.images.filter((i) => i.status !== "placed").map((i) => `Page ${i.page}: ${i.status === "missing" ? "no image assigned" : `could not place ${i.link} (${i.message ?? "error"})`}`)} />
            <ReportList
              title={`Preflight${r.preflight ? ` · ${r.preflight.profile}` : ""}`}
              ok={r.preflight ? "No preflight errors." : "Preflight did not run."}
              warnIfEmpty={!r.preflight}
              items={r.preflight?.results ?? []}
            />
            {r.autoFitted.length > 0 && <ReportList title="Display lines shrunk to fit" ok="" tone="info" items={r.autoFitted.map((a) => `Page ${a.page} · ${a.label}: ${Math.round(a.scale * 100)}%`)} />}
            {r.warnings.length > 0 && <ReportList title="Warnings" ok="" items={r.warnings} />}
          </div>
        )}
        {d.errors && d.errors.length > 0 && <ReportList title="Adobe errors" ok="" items={d.errors} />}
        {d.gates && <GatesSummary gates={d.gates} compact />}
        {r?.app?.version && <p className="text-[11.5px] text-muted">Built with InDesign {r.app.version}{r.timings.overall ? ` in ${(r.timings.overall / 1000).toFixed(1)} s` : ""}.</p>}
      </div>
    </Card>
  );
}

/** Editor sign-off for a print build (server mode). */
function ReleasePanel({ job }: { job: ExportJob }) {
  const d = job.indesign!;
  const rel = d.release!;
  const canRelease = useCan("release-print");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"release" | "reject" | null>(null);
  const decide = async (decision: "release" | "reject") => {
    setBusy(decision);
    try {
      const view = await decidePrintRelease(d.jobId, decision, note.trim() || undefined);
      useStore.getState().updateExportJob(job.id, { indesign: { ...d, release: view.release } });
      useStore.getState().log({ kind: "export", message: decision === "release" ? `Released to print: ${job.fileName}` : `Print build rejected: ${job.fileName} — ${note.trim()}`, tone: decision === "release" ? "success" : "warning" });
      toast(decision === "release" ? "success" : "info", decision === "release" ? "Released to print" : "Build rejected", decision === "release" ? "The PDF is signed off for the printer." : undefined);
    } catch (e) {
      toast("error", "Could not record the decision", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  if (rel.status === "released") {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-ok/30 bg-ok-50 px-3.5 py-3 text-[13px]">
        <BadgeCheck className="mt-0.5 size-5 shrink-0 text-ok" />
        <div>
          <p className="font-semibold text-ink">Released to print</p>
          <p className="text-ink-2">
            Signed off by {rel.by ?? "an editor"}
            {rel.at ? ` · ${fmtDateTime(rel.at)}` : ""}
            {rel.note ? ` — “${rel.note}”` : ""}
          </p>
        </div>
      </div>
    );
  }
  if (rel.status === "rejected") {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-err/30 bg-err-50 px-3.5 py-3 text-[13px]">
        <OctagonX className="mt-0.5 size-5 shrink-0 text-err" />
        <div>
          <p className="font-semibold text-ink">Rejected by {rel.by ?? "an editor"}</p>
          {rel.note && <p className="text-ink-2">“{rel.note}”</p>}
        </div>
      </div>
    );
  }
  if (!rel.eligible) {
    return (
      <div className="rounded-lg border border-warn/30 bg-warn-50 px-3.5 py-3 text-[13px]">
        <p className="flex items-center gap-1.5 font-semibold text-ink">
          <AlertTriangle className="size-4 text-warn" /> Not releasable — fix and build again
        </p>
        <ul className="mt-1 space-y-0.5 text-[12.5px] text-ink-2">
          {rel.reasons.map((x) => (
            <li key={x}>• {x}</li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="space-y-2.5 rounded-lg border border-brand/30 bg-brand-50/50 px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        <Printer className="size-4 text-brand" /> Clean print build — awaiting editor release
      </p>
      <p className="text-[12.5px] text-ink-2">InDesign reported no overset text, no missing fonts or images and no preflight errors. Check the page previews, then release it to the printer.</p>
      {canRelease ? (
        <>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note for the record (required to reject)" aria-label="Release note" className="text-[12.5px]" />
          <div className="flex gap-2">
            <Button size="sm" loading={busy === "release"} disabled={!!busy} onClick={() => void decide("release")}>
              <BadgeCheck /> Release to print
            </Button>
            <Button size="sm" variant="secondary" loading={busy === "reject"} disabled={!!busy || !note.trim()} onClick={() => void decide("reject")}>
              Reject
            </Button>
          </div>
        </>
      ) : (
        <p className="text-[12px] text-muted">An editor releases builds to print.</p>
      )}
    </div>
  );
}

/** Results of the server's print quality gates. */
export function GatesSummary({ gates, compact }: { gates: GateResult; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  const blocks = gates.checks.filter((c) => c.status === "block").length;
  const warns = gates.checks.filter((c) => c.status === "warn").length;
  return (
    <div className="rounded-lg border border-line">
      <button className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12.5px] font-semibold text-ink" onClick={() => setOpen(!open)} aria-expanded={open}>
        {blocks ? <OctagonX className="size-4 text-err" /> : warns ? <AlertTriangle className="size-4 text-warn" /> : <CheckCircle2 className="size-4 text-ok" />}
        Print quality checks {gates.kind === "documents" ? "(documents build — advisory)" : ""}
        <span className="font-normal text-muted">
          · {blocks ? `${blocks} blocking` : "nothing blocking"}
          {warns ? ` · ${warns} to review` : ""}
        </span>
        <span className="ml-auto text-[11.5px] font-normal text-brand">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <ul className="space-y-2 border-t border-line px-3 py-2.5">
          {gates.checks.map((c) => (
            <li key={c.id} className="text-[12.5px]">
              <p className="flex items-start gap-1.5">
                {c.status === "block" ? <OctagonX className="mt-0.5 size-3.5 shrink-0 text-err" /> : c.status === "warn" ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" /> : <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok" />}
                <span>
                  <span className="font-medium text-ink">{c.label}</span> <span className="text-ink-2">— {c.detail}</span>
                </span>
              </p>
              {c.items && c.items.length > 0 && c.status !== "pass" && <GateItems items={c.items} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GateItems({ items }: { items: string[] }) {
  const [all, setAll] = useState(false);
  return (
    <ul className="mt-1 ml-5 space-y-0.5 text-[12px] text-ink-2">
      {(all ? items : items.slice(0, 6)).map((t, i) => (
        <li key={i} className="break-words">
          • {t}
        </li>
      ))}
      {items.length > 6 && (
        <li>
          <button className="text-brand hover:underline" onClick={() => setAll(!all)}>
            {all ? "Show fewer" : `Show all ${items.length}`}
          </button>
        </li>
      )}
    </ul>
  );
}

function ReportList({ title, ok, items, tone = "warn", warnIfEmpty }: { title: string; ok: string; items: string[]; tone?: "warn" | "info"; warnIfEmpty?: boolean }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, 5);
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
        {items.length ? <AlertTriangle className={cn("size-4", tone === "warn" ? "text-warn" : "text-info")} /> : warnIfEmpty ? <AlertTriangle className="size-4 text-warn" /> : <CheckCircle2 className="size-4 text-ok" />}
        {title}
        {items.length > 0 && <span className="font-normal text-muted">({items.length})</span>}
      </p>
      {items.length === 0 ? (
        ok && <p className="mt-1 text-[12px] text-muted">{ok}</p>
      ) : (
        <ul className="mt-1.5 space-y-0.5 text-[12px] text-ink-2">
          {shown.map((t, i) => (
            <li key={i} className="break-words">
              • {t}
            </li>
          ))}
          {items.length > 5 && (
            <li>
              <button className="text-brand hover:underline" onClick={() => setOpen(!open)}>
                {open ? "Show fewer" : `Show all ${items.length}`} <ExternalLink className="inline size-3" />
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
