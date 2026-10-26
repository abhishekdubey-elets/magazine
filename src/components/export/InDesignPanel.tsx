"use client";

import { AlertTriangle, CheckCircle2, Download, ExternalLink, FileText, Loader2, Package, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fmtDateTime } from "@/components/common";
import { toast } from "@/components/shell/toast";
import { Badge, Card, CardHeader, cn } from "@/components/ui";
import type { JobOutput } from "@/lib/indesign/manifest-types";
import { useStore } from "@/lib/store";
import type { ExportJob } from "@/lib/types";
import { getInDesignJob, STAGE_LABEL } from "@/services/indesign";

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
              indesign: { ...job.indesign!, stage: STAGE_LABEL[view.status], outputs: view.outputs, report: view.report, errors: view.errors, expiresAt: new Date(Date.now() + 23 * 3600 * 1000).toISOString() },
            });
            log({ kind: "export", message: done ? `InDesign build finished: ${job.fileName} (${view.outputs.length} files)` : `InDesign build failed: ${job.fileName}`, actor: "Adobe InDesign API", tone: done ? "success" : "error" });
            toast(done ? "success" : "error", done ? "InDesign build finished" : "InDesign build failed", done ? `${view.outputs.length} files ready to download` : view.errors[0]);
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
        actions={<Badge tone={running ? "brand" : job.status === "completed" ? (problems ? "warn" : "ok") : "err"}>{running ? "Running" : job.status === "completed" ? (problems ? `${problems} issues` : "Clean") : "Failed"}</Badge>}
      />
      <div className="space-y-4 p-5">
        {running && <p className="text-[13px] text-ink-2">{d.stage ?? "Starting…"} You can leave this page — the job keeps running and results appear here.</p>}
        {job.status === "failed" && <p className="rounded-md bg-err-50 px-3 py-2 text-[12.5px] text-err">{job.message ?? "The InDesign job failed."}</p>}

        {files.length > 0 && (
          <div>
            <p className="mb-2 text-[12.5px] font-medium text-ink-2">Files {expired ? <span className="text-warn">(links expired — run the build again)</span> : <span className="text-muted">(links valid about 24 hours)</span>}</p>
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
        {r?.app?.version && <p className="text-[11.5px] text-muted">Built with InDesign {r.app.version}{r.timings.overall ? ` in ${(r.timings.overall / 1000).toFixed(1)} s` : ""}.</p>}
      </div>
    </Card>
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
