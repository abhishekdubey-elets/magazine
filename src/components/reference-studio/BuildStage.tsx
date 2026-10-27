"use client";

import { AlertTriangle, CheckCircle2, Download, Info, Layers, OctagonX, Package, Printer, RefreshCw, ShieldAlert, Undo2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { GatesSummary, InDesignJobCard } from "@/components/export/InDesignPanel";
import { PageThumb } from "@/components/page/PageRenderer";
import { FIX_LABELS, useRunFix } from "@/components/qa/FixHost";
import { toast } from "@/components/shell/toast";
import { Badge, Button, Card, CardHeader, cn, Modal, Segmented, Select } from "@/components/ui";
import { applyBulk, BULK_HELP, BULK_LABEL, previewBulk, type BulkOperation, type BulkPreview } from "@/lib/bulk-fixes";
import { buildHandoffZip, download, slug } from "@/lib/exporter";
import { useFonts } from "@/lib/hooks";
import type { GateResult } from "@/lib/indesign/manifest-types";
import { runIssueQa, type BulkOpKey, type IssueCategory, type IssueSeverity } from "@/lib/issue-qa";
import { makeContext } from "@/lib/layout-engine";
import { routes } from "@/lib/nav";
import { recordStage } from "@/lib/pilot";
import { runQa } from "@/lib/qa-engine";
import { deriveDesignSpec } from "@/lib/reference/spec";
import { useStore } from "@/lib/store";
import { useCan, useWorkspace } from "@/lib/sync/engine";
import type { Publication, QAFix, ReferenceProfile } from "@/lib/types";
import { checkPrintGates, fetchReadiness, GateError, integrationState, startInDesignJob, type ServerReadiness } from "@/services/indesign";
import { useEffect } from "react";
import { useStudio } from "./studio-state";

const SEV_ICON: Record<IssueSeverity, React.ReactNode> = { blocker: <OctagonX className="size-4 text-err" />, warning: <AlertTriangle className="size-4 text-warn" />, info: <Info className="size-4 text-info" /> };
const CATEGORIES: IssueCategory[] = ["content", "layout", "print", "visual", "approval"];
const BULK_OPS: BulkOpKey[] = ["reset-styles", "reset-geometry", "fill-frames", "add-continuations", "regenerate", "reapply-templates"];

/** Stage E — the generated issue: page previews, issue QA, bulk corrections and the InDesign build. */
export function BuildStage({ profile, publication }: { profile: ReferenceProfile; publication: Publication }) {
  const spec = profile.spec ?? deriveDesignSpec(profile);
  const allPages = useStore((s) => s.pages);
  const articles = useStore((s) => s.articles);
  const templates = useStore((s) => s.templates);
  const settings = useStore((s) => s.settings);
  const uploads = useStore((s) => s.uploads);
  const jobs = useStore((s) => s.exportJobs);
  const fontsVersion = useFonts((f) => f.version);
  const serverMode = useWorkspace((s) => s.setup?.mode === "server");
  const canFix = useCan("edit-pages");
  const canBuild = useCan("build-indesign");
  const runFix = useRunFix();
  const { pushUndo, popUndo, undo, stopTimer, startTimer } = useStudio();
  const [sev, setSev] = useState<"open" | IssueSeverity | "all">("open");
  const [cat, setCat] = useState<IssueCategory | "">("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [op, setOp] = useState<BulkOpKey>("reset-styles");
  const [targetTemplate, setTargetTemplate] = useState("");
  const [preview, setPreview] = useState<BulkPreview | null>(null);
  const [gates, setGates] = useState<GateResult | null>(null);
  const [server, setServer] = useState<ServerReadiness | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [qaRuns, setQaRuns] = useState(0);
  useEffect(() => void fetchReadiness().then(setServer), []);

  const pages = useMemo(() => allPages.filter((p) => p.publicationId === publication.id).sort((a, b) => a.number - b.number), [allPages, publication.id]);
  const ctx = useMemo(() => makeContext(publication, pages, articles, templates, settings, fontsVersion), [publication, pages, articles, templates, settings, fontsVersion]);
  const pubJobs = jobs.filter((j) => j.publicationId === publication.id && j.indesign);
  const latestReport = pubJobs.find((j) => j.status === "completed" && j.indesign?.report)?.indesign?.report;
  const report = useMemo(
    () => runIssueQa(ctx, uploads, { plan: publication.plan, spec, pdfPreset: spec.print.pdfPreset, minPpi: spec.print.minPpi, targetPpi: spec.print.targetPpi, gates: gates ?? undefined, indesignReport: latestReport, builtPages: pages.map((p) => p.number) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx, uploads, publication.plan, spec, gates, latestReport, qaRuns],
  );
  const shown = report.findings.filter((f) => (sev === "all" || (sev === "open" ? f.severity !== "info" : f.severity === sev)) && (!cat || f.category === cat));
  const approved = pages.filter((p) => p.status === "approved").length;
  const integration = integrationState(settings, server);
  const released = pubJobs.some((j) => j.indesign?.release?.status === "released");
  const built = pubJobs.some((j) => j.status === "completed" && j.indesign?.outputs.some((o) => o.kind === "pdf"));
  const outputLabel = released ? "Released print deliverable" : built ? "Real InDesign output (not yet released)" : "Browser preview only";

  const pilotPatch = (fn: (p: NonNullable<Publication["pilot"]>) => NonNullable<Publication["pilot"]>) => {
    const pub = useStore.getState().publications.find((p) => p.id === publication.id);
    if (pub?.pilot) useStore.getState().updatePublication(publication.id, { pilot: fn(pub.pilot) });
  };

  const rerunQa = () => {
    const ms = stopTimer("qaMs");
    pilotPatch((p) => {
      let next = ms ? recordStage(p, "qaMs", ms, `Issue QA reviewed (${report.blockers} blockers, ${report.warnings} warnings)`) : p;
      if (!next.events.some((e) => e.detail.startsWith("First QA run"))) next = { ...next, qaFailuresBefore: report.blockers + report.warnings, events: [...next.events, { at: new Date().toISOString(), stage: "note", detail: `First QA run: ${report.blockers} blockers, ${report.warnings} warnings` }] };
      return { ...next, unresolvedFailures: report.blockers };
    });
    useStore.getState().recordQaRun({ id: `qa-${Date.now()}`, at: new Date().toISOString(), errors: report.blockers, warnings: report.warnings, infos: report.infos, passed: 0, pagesChecked: pages.length });
    setQaRuns((n) => n + 1);
    startTimer("qaMs");
    toast(report.blockers ? "warning" : "success", "Issue QA complete", `${report.blockers} blockers · ${report.warnings} warnings · ${report.infos} notes`);
  };

  const fix = (pageId: string, f: QAFix) => {
    const issue = runQa(ctx, uploads).issues.find((i) => i.pageId === pageId && i.fixes.some((x) => JSON.stringify(x) === JSON.stringify(f)));
    if (!issue) return toast("info", "This fix is applied from the QA screen", "Open Quality Assurance for the page.");
    runFix(issue, f);
    pilotPatch((p) => ({ ...p, corrections: p.corrections + 1 }));
  };

  const select = (which: "all" | "blockers" | "none") => {
    if (which === "none") return setSelected(new Set());
    if (which === "all") return setSelected(new Set(pages.map((p) => p.id)));
    setSelected(new Set(pages.filter((p) => (report.perPage[p.id]?.blockers ?? 0) > 0).map((p) => p.id)));
  };
  const operation = (): BulkOperation => (op === "reapply-templates" ? { type: op, templateId: targetTemplate || undefined } : { type: op });
  const doPreview = () => {
    startTimer("correctionMs");
    setPreview(previewBulk(ctx, [...selected], operation()));
  };
  const apply = () => {
    if (!preview) return;
    const res = applyBulk(ctx, [...selected], operation(), templates);
    pushUndo({ label: BULK_LABEL[op], publicationId: publication.id, pages });
    useStore.getState().replacePages(publication.id, res.pages);
    const ms = stopTimer("correctionMs");
    pilotPatch((p) => recordStage({ ...p, corrections: p.corrections + res.applied }, "correctionMs", ms, `Bulk: ${BULK_LABEL[op]} on ${res.applied} page${res.applied === 1 ? "" : "s"}`));
    useStore.getState().log({ kind: "qa", message: `Bulk correction “${BULK_LABEL[op]}” applied to ${res.applied} page${res.applied === 1 ? "" : "s"} of ${publication.title}`, tone: "success" });
    toast("success", `${BULK_LABEL[op]} applied`, `${res.applied} page${res.applied === 1 ? "" : "s"} changed. Affected approvals were reset; QA re-ran.`);
    setPreview(null);
    setQaRuns((n) => n + 1);
  };
  const undoLast = () => {
    const last = popUndo();
    if (!last) return;
    useStore.getState().replacePages(last.publicationId, last.pages);
    toast("info", "Undone", last.label);
    setQaRuns((n) => n + 1);
  };

  const checkGates = async () => {
    setBusy("gates");
    try {
      setGates(await checkPrintGates(ctx, uploads, pages.map((p) => p.number), settings, "print"));
    } catch (e) {
      toast("error", "Print readiness check failed", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const build = async (kind: "print" | "documents") => {
    setBusy(kind);
    const name = `${slug(publication.masthead)}-${slug(publication.issueLabel)}-${kind === "print" ? "print" : "indesign"}`;
    const outputs = kind === "print" ? { pdf: true, indd: false, idml: false, jpeg: true } : { pdf: true, indd: true, idml: true, jpeg: true };
    try {
      const res = await startInDesignJob(ctx, uploads, pages.map((p) => p.number), settings, outputs, () => undefined);
      useStore.getState().addExportJob({ id: `exp-${Date.now()}`, publicationId: publication.id, format: kind === "print" ? "pdf-print" : "indd-native", fileName: name, pages: pages.map((p) => p.number), status: "running", createdAt: new Date().toISOString(), qa: { errors: report.blockers, warnings: report.warnings }, settings: { format: kind === "print" ? "pdf-print" : "indd-native", range: "all", customRange: "", bleed: true, cropMarks: true, quality: "high", embedFonts: true, includeQaReport: true, allowWithErrors: false }, indesign: { jobId: res.jobId, stage: "Queued at Adobe", outputs: [], kind: res.job?.kind, gates: res.gates, archived: res.job?.archived } });
      if (res.gates) setGates(res.gates);
      pilotPatch((p) => ({ ...p, events: [...p.events, { at: new Date().toISOString(), stage: "note", detail: `InDesign ${kind} build started (job ${res.jobId})` }] }));
      toast("info", "InDesign build started", "Adobe InDesign is building the pages; results appear below and in Export Center.");
    } catch (e) {
      if (e instanceof GateError) {
        setGates(e.gates);
        toast("warning", "Print build blocked by the server gates", "Fix the blocking checks, then build again.");
      } else toast("error", "InDesign build not started", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const handoff = async () => {
    setBusy("zip");
    try {
      const blob = await buildHandoffZip(ctx, uploads, pages.map((p) => p.number), runQa(ctx, uploads).issues);
      download(blob, `${slug(publication.masthead)}-${slug(publication.issueLabel)}-indesign-build-package.zip`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center gap-3 px-5 py-4">
        <div className="min-w-[260px] flex-1">
          <p className="text-[15px] font-semibold text-ink">{publication.title} — {publication.issueLabel}</p>
          <p className="text-[12.5px] text-muted">
            {pages.length} pages · {approved} approved · design spec v{publication.designSpecVersion} · plan {publication.plan?.status}
          </p>
        </div>
        <Badge tone={released ? "ok" : built ? "brand" : "neutral"} dot>{outputLabel}</Badge>
        <Badge tone={report.blockers ? "err" : report.warnings ? "warn" : "ok"}>{report.blockers ? `${report.blockers} blockers` : report.warnings ? `${report.warnings} warnings` : "QA clean"}</Badge>
        <Button variant="secondary" onClick={rerunQa}>
          <RefreshCw /> Re-run issue QA
        </Button>
        <Button href={routes.publication(publication.id)} variant="secondary">
          Open publication
        </Button>
      </Card>

      <Card>
        <CardHeader title="Pages" description="Browser preview of every generated page. Click a page to open it in Layout Studio; tick pages to include them in a bulk correction." actions={<Segmented size="sm" value="x" onChange={(v) => select(v as "all" | "blockers" | "none")} options={[{ value: "all", label: "Select all" }, { value: "blockers", label: "Select pages with blockers" }, { value: "none", label: "Clear" }]} />} />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3 p-5">
          {pages.map((p) => {
            const c = report.perPage[p.id];
            const on = selected.has(p.id);
            return (
              <div key={p.id} className={cn("rounded-lg border p-1.5", on ? "border-brand bg-brand-50/50" : "border-line")}>
                <Link href={routes.studio(p.id)} className="block overflow-hidden rounded-sm border border-line bg-white">
                  <PageThumb ctx={ctx} pageId={p.id} uploads={uploads} width={118} />
                </Link>
                <label className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                  <input type="checkbox" checked={on} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} aria-label={`Select page ${p.number}`} />
                  <span className="font-semibold text-ink">{p.number}</span>
                  <span className="min-w-0 flex-1 truncate text-muted" title={p.title}>{p.title}</span>
                </label>
                <div className="mt-0.5 flex items-center gap-1 text-[10.5px]">
                  <span className={cn("rounded px-1", p.status === "approved" ? "bg-ok-50 text-ok" : "bg-canvas text-muted")}>{p.status}</span>
                  {c?.blockers ? <span className="rounded bg-err-50 px-1 text-err">{c.blockers} blocker{c.blockers > 1 ? "s" : ""}</span> : null}
                  {c?.warnings ? <span className="rounded bg-warn-50 px-1 text-warn">{c.warnings}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader
            title={<span className="flex items-center gap-2"><ShieldAlert className="size-4 text-muted" /> Issue QA report</span>}
            description={`Content, layout, print and visual checks across the issue. Visual checks are deterministic (${report.visualInspection}); no vision model is configured. ${report.releasable ? "No blockers." : `${report.blockers} blocker${report.blockers > 1 ? "s" : ""} prevent release.`}`}
            actions={
              <div className="flex flex-wrap gap-2">
                <Segmented size="sm" value={sev} onChange={setSev} options={[{ value: "open", label: "Open" }, { value: "blocker", label: "Blockers" }, { value: "warning", label: "Warnings" }, { value: "info", label: "Info" }, { value: "all", label: "All" }]} />
                <Select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value as IssueCategory | "")} className="h-8 w-[130px] text-[12px]">
                  <option value="">All categories</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
            }
          />
          <ul className="divide-y divide-line">
            {shown.slice(0, 120).map((f) => (
              <li key={f.id} className="flex gap-3 px-5 py-2.5">
                <span className="mt-0.5 shrink-0">{SEV_ICON[f.severity]}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink">{f.title}</p>
                  <p className="text-[12px] text-ink-2">{f.detail}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge tone="neutral">{f.category}</Badge>
                    {f.pageId && (
                      <Link href={routes.studio(f.pageId, f.frameId)} className="text-[11.5px] text-brand hover:underline">
                        Open page {f.pageNumbers[0]}
                      </Link>
                    )}
                    {f.pageId && f.fixes.map((x) => (
                      <Button key={x.type} size="sm" variant="ghost" disabled={!canFix} onClick={() => fix(f.pageId!, x)}>
                        <Wand2 /> {FIX_LABELS[x.type]}
                      </Button>
                    ))}
                    {f.bulk && (
                      <button className="text-[11.5px] text-brand hover:underline" onClick={() => { setOp(f.bulk!); setSelected(new Set(pages.filter((p) => f.pageNumbers.includes(p.number) || !f.pageNumbers.length).map((p) => p.id))); }}>
                        Fix in bulk: {BULK_LABEL[f.bulk]}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
            {!shown.length && <li className="px-5 py-6 text-center text-[12.5px] text-muted">Nothing in this view.</li>}
          </ul>
          {report.deferred.length > 0 && (
            <div className="border-t border-line px-5 py-3 text-[11.5px] text-muted">
              <p className="font-semibold text-ink-2">Checked elsewhere</p>
              <ul className="mt-0.5 space-y-0.5">
                {report.deferred.map((d) => (
                  <li key={d}>• {d}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><Layers className="size-4 text-muted" /> Bulk corrections</span>} description={`${selected.size} page${selected.size === 1 ? "" : "s"} selected. Every operation shows its scope and effect before it is applied; approvals on changed pages are reset.`} />
            <div className="space-y-3 p-5">
              <Select aria-label="Operation" value={op} onChange={(e) => setOp(e.target.value as BulkOpKey)}>
                {BULK_OPS.map((k) => (
                  <option key={k} value={k}>
                    {BULK_LABEL[k]}
                  </option>
                ))}
              </Select>
              <p className="text-[12px] text-muted">{BULK_HELP[op]}</p>
              {op === "reapply-templates" && (
                <Select aria-label="Target template" value={targetTemplate} onChange={(e) => setTargetTemplate(e.target.value)}>
                  <option value="">Keep each page&apos;s template (clear overrides only)</option>
                  {templates.filter((t) => !t.trim || (Math.abs(t.trim.width - publication.trim.width) < 1 && Math.abs(t.trim.height - publication.trim.height) < 1)).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" disabled={!selected.size || !canFix} onClick={doPreview}>
                  Preview changes
                </Button>
                <Button variant="secondary" disabled={!undo.length} onClick={undoLast}>
                  <Undo2 /> Undo {undo.length ? `(${undo.length})` : ""}
                </Button>
              </div>
              <p className="text-[11.5px] text-muted">Never changes article text, photographs or fonts. Approve pages in Layout Studio once they are right.</p>
            </div>
          </Card>

          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><Printer className="size-4 text-muted" /> InDesign build</span>} description="The only engine that produces print files. Pages are built from named paragraph styles, parent pages and layers, so the document stays editable." />
            <div className="space-y-3 p-5">
              {serverMode ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" loading={busy === "gates"} disabled={!canBuild} onClick={checkGates}>
                      <ShieldAlert /> Check print readiness
                    </Button>
                    <Button variant="primary" loading={busy === "print"} disabled={!integration.usable || !canBuild || !!busy} onClick={() => build("print")}>
                      <Printer /> Build print PDF
                    </Button>
                    <Button variant="secondary" loading={busy === "documents"} disabled={!integration.usable || !canBuild || !!busy} onClick={() => build("documents")}>
                      <Package /> Build INDD + IDML
                    </Button>
                  </div>
                  {!integration.usable && <p className="rounded-md bg-canvas px-3 py-2 text-[12px] text-ink-2">{integration.reason} The readiness check runs on the server without Adobe.</p>}
                  {gates && <GatesSummary gates={gates} />}
                </>
              ) : (
                <>
                  <p className="rounded-md bg-warn-50 px-3 py-2 text-[12px] text-warn">Browser demo mode: InDesign builds need the server (database, Adobe and S3 credentials). What you see here is a browser preview, not an InDesign document.</p>
                  <Button variant="secondary" loading={busy === "zip"} onClick={handoff}>
                    <Download /> InDesign build package (manifest + stories + links)
                  </Button>
                </>
              )}
              <p className="text-[11.5px] text-muted">
                <CheckCircle2 className="mr-1 inline size-3 text-ok" /> Release requires InDesign&apos;s report to be clean (no overset, no missing fonts or images, zero preflight errors) and an editor&apos;s sign-off — see Export Center.
              </p>
            </div>
          </Card>
        </div>
      </div>

      {pubJobs.slice(0, 3).map((j) => (
        <InDesignJobCard key={j.id} job={j} />
      ))}

      {preview && (
        <Modal open onOpenChange={(o) => !o && setPreview(null)} title={`${BULK_LABEL[op]} — preview`} description={preview.summary} width="max-w-2xl" footer={<><Button variant="ghost" onClick={() => setPreview(null)}>Cancel</Button><Button variant="primary" disabled={!preview.affected.length} onClick={apply}>Apply to {preview.affected.length} page{preview.affected.length === 1 ? "" : "s"}</Button></>}>
          <p className="mb-2 text-[12px] text-muted">Scope: {preview.scope.join(", ")} · {preview.untouched} unchanged</p>
          <ul className="thin-scroll max-h-[320px] space-y-2 overflow-y-auto text-[12.5px]">
            {preview.affected.map((a) => (
              <li key={a.pageId} className="rounded-md border border-line px-3 py-2">
                <p className="font-medium text-ink">
                  Page {a.number} — {a.title} {a.reopens && <Badge tone="warn">approval reset</Badge>}
                </p>
                <ul className="mt-0.5 text-ink-2">
                  {a.changes.map((c) => (
                    <li key={c}>• {c}</li>
                  ))}
                </ul>
              </li>
            ))}
            {!preview.affected.length && <li className="text-muted">Nothing to change on the selected pages.</li>}
          </ul>
        </Modal>
      )}
    </div>
  );
}
