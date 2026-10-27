"use client";

import { AlertTriangle, CheckCircle2, Download, FileArchive, FileImage, FileJson, FileText, Package, Printer, ShieldAlert, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EmptyState, fmtBytes, fmtDateTime, PageHeader } from "@/components/common";
import { GatesSummary, InDesignJobCard } from "@/components/export/InDesignPanel";
import { PageRenderer } from "@/components/page/PageRenderer";
import { toast } from "@/components/shell/toast";
import { Badge, Button, Card, CardHeader, cn, Field, Input, Progress, Segmented, Switch } from "@/components/ui";
import { buildContentPackage, buildHandoffZip, buildPdf, buildPngZip, capturePages, download, parseRange, ppiFor, slug } from "@/lib/exporter";
import { useQa } from "@/lib/hooks";
import { resolvePage } from "@/lib/layout-engine";
import { useStore } from "@/lib/store";
import type { GateResult } from "@/lib/indesign/manifest-types";
import { useWorkspace } from "@/lib/sync/engine";
import type { ExportFormat, ExportJob, ExportSettings } from "@/lib/types";
import { checkPrintGates, fetchReadiness, GateError, integrationState, startInDesignJob, type ServerReadiness } from "@/services/indesign";

interface FormatDef {
  id: ExportFormat;
  label: string;
  description: string;
  icon: React.ReactNode;
  ext: string;
  available: boolean;
  note?: string;
}

const FORMATS: FormatDef[] = [
  { id: "pdf-proof", label: "PDF preview (proof)", description: "Browser-rendered pages for review. Optional bleed and crop marks.", icon: <FileText />, ext: "pdf", available: true },
  { id: "pdf-web", label: "Web PDF", description: "Compressed, screen-resolution PDF for email and web sharing.", icon: <FileText />, ext: "pdf", available: true },
  { id: "png-pages", label: "Page preview images", description: "One PNG per page in a ZIP — for social, approvals and CMS.", icon: <FileImage />, ext: "zip", available: true },
  { id: "json-package", label: "Structured content package", description: "JSON: page definitions, text, image references and styles.", icon: <FileJson />, ext: "json", available: true },
  { id: "indesign-handoff", label: "InDesign build package", description: "ZIP with the exact InDesign build manifest (points, paragraph styles, threading), stories and image links. No .indd inside.", icon: <Package />, ext: "zip", available: true },
  { id: "pdf-print", label: "Print-ready PDF via InDesign", description: "Built by Adobe InDesign in the cloud: real paragraph styles, InDesign composition, Adobe preflight, PDF/X with bleed and crop marks, plus page previews.", icon: <Printer />, ext: "pdf", available: false },
  { id: "indd-native", label: "InDesign documents (.indd + .idml)", description: "Editable InDesign files with paragraph styles and threaded stories, plus a print PDF and page previews.", icon: <Package />, ext: "indd", available: false },
];

const INDESIGN: ExportFormat[] = ["pdf-print", "indd-native"];

const RASTER: ExportFormat[] = ["pdf-proof", "pdf-web", "png-pages"];

export default function ExportPage() {
  return (
    <Suspense fallback={null}>
      <ExportCenter />
    </Suspense>
  );
}

function ExportCenter() {
  const params = useSearchParams();
  const { issues, ctx } = useQa();
  const uploads = useStore((s) => s.uploads);
  const jobs = useStore((s) => s.exportJobs);
  const defaults = useStore((s) => s.settings.exportDefaults);
  const settings = useStore((s) => s.settings);
  const [server, setServer] = useState<ServerReadiness | null>(null);
  useEffect(() => void fetchReadiness().then(setServer), []);
  const indesign = integrationState(settings, server);
  const formats = FORMATS.map((f) => (INDESIGN.includes(f.id) ? { ...f, available: indesign.usable, note: indesign.usable ? undefined : indesign.reason } : f));
  const addJob = useStore((s) => s.addExportJob);
  const log = useStore((s) => s.log);
  const pub = ctx.publication;
  const pages = useMemo(() => [...ctx.pages].sort((a, b) => a.number - b.number), [ctx.pages]);
  const initialPages = params.get("pages");
  const [cfg, setCfg] = useState<ExportSettings>({
    format: defaults.format,
    range: initialPages ? "custom" : "all",
    customRange: initialPages ?? "1-5",
    bleed: defaults.bleed,
    cropMarks: defaults.cropMarks,
    quality: defaults.quality,
    embedFonts: true,
    includeQaReport: true,
    allowWithErrors: false,
  });
  const set = (p: Partial<ExportSettings>) => setCfg((c) => ({ ...c, ...p }));
  const [progress, setProgress] = useState<{ label: string; value: number } | null>(null);
  const [renderPages, setRenderPages] = useState<number[]>([]);
  const [last, setLast] = useState<{ blob: Blob; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gates, setGates] = useState<GateResult | null>(null);
  const [checking, setChecking] = useState(false);
  const serverMode = useWorkspace((s) => s.setup?.mode === "server");
  const hostRef = useRef<HTMLDivElement>(null);

  let selected: number[] = [];
  let rangeError: string | null = null;
  try {
    selected = cfg.range === "all" ? pages.map((p) => p.number) : parseRange(cfg.customRange, pages.length);
    if (!selected.length) rangeError = "No pages in range.";
  } catch (e) {
    rangeError = e instanceof Error ? e.message : String(e);
  }
  const selIssues = issues.filter((i) => selected.includes(i.pageNumber));
  const errs = selIssues.filter((i) => i.severity === "error");
  const warns = selIssues.filter((i) => i.severity === "warning");
  const unapproved = pages.filter((p) => selected.includes(p.number) && p.status !== "approved").length;
  const fmt = formats.find((f) => f.id === cfg.format)!;
  const isRaster = RASTER.includes(cfg.format);
  const isInDesign = INDESIGN.includes(cfg.format);
  const blocked = errs.length > 0 && !cfg.allowWithErrors && cfg.format !== "json-package";
  const busy = !!progress;

  useEffect(() => {
    if (cfg.format === "pdf-web") setCfg((c) => ({ ...c, quality: "draft", bleed: false, cropMarks: false }));
  }, [cfg.format]);

  const base = `${slug(pub.masthead)}-${slug(pub.issueLabel)}`;
  const rangeLabel = selected.length === pages.length ? "all" : `p${selected[0]}-${selected[selected.length - 1]}`;

  const record = (status: ExportJob["status"], fileName: string, size?: number, ms?: number, message?: string) => {
    addJob({ id: `exp-${Date.now()}`, publicationId: pub.id, format: cfg.format, fileName, pages: selected, status, sizeBytes: size, createdAt: new Date().toISOString(), durationMs: ms, qa: { errors: errs.length, warnings: warns.length }, message, settings: cfg });
  };

  const waitForRender = () =>
    new Promise<HTMLElement[]>((resolve) => {
      const tick = (n = 0) => {
        const nodes = Array.from(hostRef.current?.querySelectorAll<HTMLElement>("[data-export-page]") ?? []);
        if (nodes.length === selected.length || n > 100) resolve(nodes);
        else setTimeout(() => tick(n + 1), 30);
      };
      tick();
    });

  const run = async () => {
    setError(null);
    setLast(null);
    if (rangeError) return;
    if (blocked) {
      const msg = `${errs.length} QA error${errs.length > 1 ? "s" : ""} on the selected pages. Resolve them or allow export with errors.`;
      setError(msg);
      record("blocked", `${base}-${rangeLabel}.${fmt.ext}`, undefined, undefined, msg);
      return;
    }
    if (isInDesign) return runInDesign();
    const t0 = performance.now();
    let blob: Blob;
    let name = `${base}-${rangeLabel}`;
    try {
      if (cfg.format === "json-package") {
        setProgress({ label: "Serialising page definitions…", value: 50 });
        const pkg = buildContentPackage(ctx, uploads, selected, issues, cfg.includeQaReport);
        blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
        name += "-content-package.json";
      } else if (cfg.format === "indesign-handoff") {
        setProgress({ label: "Building manifest, stories and links…", value: 40 });
        blob = await buildHandoffZip(ctx, uploads, selected, issues);
        name += "-indesign-handoff.zip";
      } else {
        setProgress({ label: "Preparing pages…", value: 2 });
        setRenderPages(selected);
        await new Promise((r) => setTimeout(r, 60));
        const nodes = await waitForRender();
        const images = await capturePages(nodes, cfg.quality, cfg.format === "png-pages" ? "png" : "jpeg", (i) =>
          setProgress({ label: i < nodes.length ? `Rendering page ${selected[i]} (${i + 1}/${nodes.length})…` : "Assembling file…", value: 5 + (i / nodes.length) * 85 }),
        );
        if (cfg.format === "png-pages") {
          blob = await buildPngZip(images, selected, base);
          name += "-pages.zip";
        } else {
          blob = await buildPdf(images, selected, ctx, { bleed: cfg.bleed, cropMarks: cfg.cropMarks, format: "jpeg", title: `${pub.title} — ${pub.issueLabel}` });
          name += cfg.format === "pdf-web" ? "-web.pdf" : "-proof.pdf";
        }
      }
      const ms = Math.round(performance.now() - t0);
      download(blob, name);
      setLast({ blob, name });
      record("completed", name, blob.size, ms);
      log({ kind: "export", message: `${fmt.label} exported — ${selected.length} page${selected.length > 1 ? "s" : ""} (${fmtBytes(blob.size)})`, tone: "success" });
      toast("success", "Export ready", `${name} · ${fmtBytes(blob.size)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Export failed: ${msg}`);
      record("failed", name, undefined, undefined, msg);
      toast("error", "Export failed", msg);
    } finally {
      setProgress(null);
      setRenderPages([]);
    }
  };

  const checkGates = async () => {
    setChecking(true);
    setError(null);
    try {
      setGates(await checkPrintGates(ctx, uploads, selected, settings, cfg.format === "pdf-print" ? "print" : "documents"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  const runInDesign = async () => {
    const name = `${base}-${rangeLabel}${cfg.format === "pdf-print" ? "-print" : "-indesign"}`;
    const id = `exp-${Date.now()}`;
    setProgress({ label: "Preparing the InDesign job…", value: 10 });
    setGates(null);
    try {
      const outputs = cfg.format === "pdf-print" ? { pdf: true, indd: false, idml: false, jpeg: true } : { pdf: true, indd: true, idml: true, jpeg: true };
      const res = await startInDesignJob(ctx, uploads, selected, settings, outputs, (label) => setProgress({ label, value: 40 }));
      addJob({
        id,
        publicationId: pub.id,
        format: cfg.format,
        fileName: name,
        pages: selected,
        status: "running",
        createdAt: new Date().toISOString(),
        qa: { errors: errs.length, warnings: warns.length },
        settings: cfg,
        indesign: { jobId: res.jobId, stage: "Queued at Adobe", outputs: [], kind: res.job?.kind, gates: res.gates, archived: res.job?.archived },
      });
      if (res.gates) setGates(res.gates);
      log({ kind: "export", message: `InDesign build started — ${res.pages} pages, ${res.links} images, ${res.fonts} font files`, actor: "Adobe InDesign API" });
      toast("info", "InDesign build started", "Adobe InDesign is building the pages. Results appear here when it finishes.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof GateError) {
        setGates(e.gates);
        const n = e.gates.checks.filter((c) => c.status === "block").length;
        setError(`${n} print quality check${n === 1 ? "" : "s"} failed — nothing was sent to InDesign. See the checks below.`);
        record("blocked", name, undefined, undefined, msg);
        toast("warning", "Print build blocked", "Fix the blocking checks, then build again.");
        return;
      }
      setError(`Could not start the InDesign build: ${msg}`);
      record("failed", name, undefined, undefined, msg);
      toast("error", "InDesign build not started", msg);
    } finally {
      setProgress(null);
    }
  };
  const indesignJobs = jobs.filter((j) => j.publicationId === pub.id && j.indesign).slice(0, 3);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-6 lg:p-8">
      <PageHeader
        title="Export Center"
        description="Proofs and data packages are produced in the browser. Print-ready PDF/X and native InDesign files are built by Adobe InDesign in the cloud once the integration is set up in Settings."
        actions={
          <Button href={`/proof?pages=${encodeURIComponent(selected.length ? (cfg.range === "all" ? `1-${pages.length}` : cfg.customRange) : "1")}`}>
            <Printer /> Open print view (vector)
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Format" description={`${pub.title} — ${pub.issueLabel}`} />
            <div className="grid gap-2.5 p-4 md:grid-cols-2">
              {formats.map((f) => (
                <button
                  key={f.id}
                  disabled={!f.available || busy}
                  onClick={() => set({ format: f.id })}
                  className={cn(
                    "flex gap-3 rounded-lg border p-3 text-left transition",
                    !f.available ? "cursor-not-allowed border-dashed border-line bg-canvas/60" : cfg.format === f.id ? "border-brand ring-2 ring-brand-100" : "border-line hover:border-line-strong",
                  )}
                  aria-pressed={cfg.format === f.id}
                >
                  <span className={cn("mt-0.5 [&_svg]:size-[18px]", f.available ? "text-brand" : "text-faint")}>{f.icon}</span>
                  <span className="min-w-0">
                    <span className={cn("block text-[13px] font-semibold", f.available ? "text-ink" : "text-muted")}>{f.label}</span>
                    <span className="block text-[12px] leading-snug text-muted">{f.description}</span>
                    {f.note && <p className="mt-1.5 rounded bg-canvas px-2 py-1 text-[11.5px] leading-snug break-words text-muted">{f.note}</p>}
                  </span>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Settings" />
            <div className="grid gap-5 p-5 md:grid-cols-2">
              <div className="space-y-3">
                <Field label="Pages">
                  <Segmented
                    value={cfg.range}
                    onChange={(v) => set({ range: v })}
                    options={[
                      { value: "all", label: `All pages (${pages.length})` },
                      { value: "custom", label: "Page range" },
                    ]}
                  />
                </Field>
                {cfg.range === "custom" && (
                  <Field label="Page range" htmlFor="ex-range" hint={rangeError ? <span className="text-err">{rangeError}</span> : `e.g. 1-5, 8, 11 → ${selected.length} page${selected.length === 1 ? "" : "s"}`}>
                    <Input id="ex-range" value={cfg.customRange} onChange={(e) => set({ customRange: e.target.value })} />
                  </Field>
                )}
                <Field label="Image quality" hint={isRaster ? `≈ ${ppiFor(cfg.quality)} ppi raster` : "Not applicable to data packages"}>
                  <Segmented
                    value={cfg.quality}
                    onChange={(v) => set({ quality: v })}
                    options={[
                      { value: "draft", label: "Draft" },
                      { value: "standard", label: "Standard" },
                      { value: "high", label: "High" },
                    ]}
                  />
                </Field>
              </div>
              <div className="space-y-3">
                <Toggle label="Include 5 mm bleed" hint="Renders full-bleed elements past the trim." checked={cfg.bleed} disabled={!["pdf-proof", "png-pages", "indesign-handoff"].includes(cfg.format)} onChange={(v) => set({ bleed: v })} />
                <Toggle label="Crop marks & slug" hint="Trim marks and a proof label in the slug area." checked={cfg.cropMarks} disabled={cfg.format !== "pdf-proof"} onChange={(v) => set({ cropMarks: v })} />
                <Toggle label="Embed fonts" hint={isRaster ? "Browser PDFs are raster — text is rendered as pixels, so fonts are not embedded." : "Font names are referenced; licensed font files are never packaged."} checked={false} disabled onChange={() => undefined} />
                <Toggle label="Include QA report" hint="Adds open findings to JSON / handoff packages." checked={cfg.includeQaReport} disabled={isRaster} onChange={(v) => set({ includeQaReport: v })} />
                <Toggle label="Allow export with QA errors" hint="Otherwise exports are blocked while QA errors remain on the selected pages." checked={cfg.allowWithErrors} onChange={(v) => set({ allowWithErrors: v })} />
              </div>
            </div>
          </Card>

          {indesignJobs.map((j) => (
            <InDesignJobCard key={j.id} job={j} />
          ))}

          <Card>
            <CardHeader title="Export history" description={serverMode ? "Shared with the team" : "Recorded in this browser"} />
            {jobs.length === 0 ? (
              <EmptyState title="No exports yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-[12.5px]">
                  <thead className="border-b border-line text-[12px] text-muted">
                    <tr>
                      <th className="px-5 py-2 font-medium">File</th>
                      <th className="px-3 py-2 font-medium">Format</th>
                      <th className="px-3 py-2 font-medium">Pages</th>
                      <th className="px-3 py-2 font-medium">Size</th>
                      <th className="px-3 py-2 font-medium">QA at export</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {jobs.map((j) => (
                      <tr key={j.id}>
                        <td className="max-w-[280px] truncate px-5 py-2.5 font-medium text-ink" title={j.message ?? j.fileName}>
                          {j.fileName}
                        </td>
                        <td className="px-3 py-2.5 text-ink-2">{formats.find((f) => f.id === j.format)?.label}</td>
                        <td className="px-3 py-2.5 tabular-nums text-ink-2">{j.pages.length === 1 ? j.pages[0] : `${j.pages[0]}–${j.pages[j.pages.length - 1]} (${j.pages.length})`}</td>
                        <td className="px-3 py-2.5 tabular-nums text-ink-2">{fmtBytes(j.sizeBytes)}</td>
                        <td className="px-3 py-2.5 text-ink-2">
                          {j.qa.errors} E · {j.qa.warnings} W
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge tone={j.status === "completed" ? "ok" : j.status === "running" ? "brand" : j.status === "blocked" ? "warn" : "err"}>{j.status}</Badge>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted">{fmtDateTime(j.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="sticky top-5">
            <CardHeader title="Validation" description={`${selected.length} page${selected.length === 1 ? "" : "s"} selected`} />
            <div className="space-y-2.5 p-5">
              <Row ok={!errs.length} icon={errs.length ? <XCircle className="size-4 text-err" /> : <CheckCircle2 className="size-4 text-ok" />} label={errs.length ? `${errs.length} QA error${errs.length > 1 ? "s" : ""}` : "No QA errors"} detail={errs.slice(0, 2).map((e) => e.title).join(" · ")} />
              <Row ok={!warns.length} icon={warns.length ? <AlertTriangle className="size-4 text-warn" /> : <CheckCircle2 className="size-4 text-ok" />} label={warns.length ? `${warns.length} warning${warns.length > 1 ? "s" : ""}` : "No warnings"} />
              <Row ok={!unapproved} icon={unapproved ? <AlertTriangle className="size-4 text-warn" /> : <CheckCircle2 className="size-4 text-ok" />} label={unapproved ? `${unapproved} page${unapproved > 1 ? "s" : ""} not yet approved` : "All pages approved"} />
              <Row
                ok
                icon={<ShieldAlert className="size-4 text-info" />}
                label={isInDesign ? "Adobe InDesign output" : "Browser output"}
                detail={isInDesign ? `Built in InDesign · ${settings.integration.pdfPreset ?? "[PDF/X-4:2008]"} with bleed and crop marks · Adobe preflight` : isRaster ? `RGB raster at ≈${ppiFor(cfg.quality)} ppi — for review, not press.` : "Data package — not an InDesign document."}
              />
            </div>
            <div className="border-t border-line p-5">
              {progress ? (
                <div aria-live="polite">
                  <p className="mb-2 text-[12.5px] text-ink-2">{progress.label}</p>
                  <Progress value={progress.value} />
                </div>
              ) : (
                <>
                  {error && <p className="mb-3 rounded-md bg-err-50 px-3 py-2 text-[12.5px] text-err">{error}</p>}
                  {last && (
                    <div className="mb-3 flex items-center gap-2 rounded-md bg-ok-50 px-3 py-2 text-[12.5px] text-ok">
                      <CheckCircle2 className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{last.name}</span>
                      <button className="font-semibold hover:underline" onClick={() => download(last.blob, last.name)}>
                        Download again
                      </button>
                    </div>
                  )}
                  {serverMode && isInDesign && gates && (
                    <div className="mb-3">
                      <GatesSummary gates={gates} />
                    </div>
                  )}
                  {serverMode && isInDesign && fmt.available && (
                    <Button variant="secondary" className="mb-2 w-full" loading={checking} disabled={!!rangeError} onClick={() => void checkGates()}>
                      <ShieldAlert /> Check print readiness
                    </Button>
                  )}
                  <Button variant="primary" size="lg" className="w-full" disabled={!!rangeError || !fmt.available} onClick={run}>
                    {cfg.format === "indesign-handoff" || cfg.format === "png-pages" ? <FileArchive /> : <Download />} Export {fmt.label.toLowerCase()}
                  </Button>
                  {blocked && <p className="mt-2 text-center text-[12px] text-warn">Export is blocked until QA errors are resolved.</p>}
                </>
              )}
            </div>
          </Card>
        </div>
      </div>

      {renderPages.length > 0 &&
        createPortal(
          <div ref={hostRef} aria-hidden style={{ position: "fixed", left: -20000, top: 0, pointerEvents: "none" }}>
            {renderPages.map((n) => {
              const page = pages.find((p) => p.number === n)!;
              return (
                <div key={page.id} data-export-page={n} style={{ width: "fit-content" }}>
                  <PageRenderer r={resolvePage(ctx, page)} ctx={ctx} uploads={uploads} mode="export" bleed={cfg.bleed ? pub.bleed : 0} />
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

function Toggle({ label, hint, checked, disabled, onChange }: { label: string; hint: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={cn("flex items-start gap-3", disabled && "opacity-55")}>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} label={label} />
      <div>
        <p className="text-[13px] font-medium text-ink">{label}</p>
        <p className="text-[12px] text-muted">{hint}</p>
      </div>
    </div>
  );
}

function Row({ icon, label, detail }: { ok: boolean; icon: React.ReactNode; label: string; detail?: string }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink">{label}</p>
        {detail && <p className="truncate text-[12px] text-muted">{detail}</p>}
      </div>
    </div>
  );
}
