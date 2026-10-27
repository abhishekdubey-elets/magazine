"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, Info, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { fmtDateTime, PageHeader, SEVERITY } from "@/components/common";
import { PageThumb } from "@/components/page/PageRenderer";
import { BULK_FOR_CHECK, BulkCorrections, useBulkRequest } from "@/components/qa/BulkCorrections";
import { FIX_LABELS, useRunFix } from "@/components/qa/FixHost";
import { BULK_LABEL } from "@/lib/bulk-fixes";
import { toast } from "@/components/shell/toast";
import { Badge, Button, Card, CardHeader, cn, Segmented, Select } from "@/components/ui";
import { useQa } from "@/lib/hooks";
import { routes } from "@/lib/nav";
import { CHECK_LABELS } from "@/lib/qa-engine";
import { useStore } from "@/lib/store";
import type { QAIssue, Severity } from "@/lib/types";

const ICON: Record<Severity, React.ReactNode> = {
  error: <XCircle className="size-4 text-err" />,
  warning: <AlertTriangle className="size-4 text-warn" />,
  info: <Info className="size-4 text-info" />,
  passed: <CheckCircle2 className="size-4 text-ok" />,
};

export default function QaPage() {
  const router = useRouter();
  const { issues, summary, ctx } = useQa();
  const uploads = useStore((s) => s.uploads);
  const runs = useStore((s) => s.qaRuns);
  const record = useStore((s) => s.recordQaRun);
  const log = useStore((s) => s.log);
  const runFix = useRunFix();
  const requestBulk = useBulkRequest((s) => s.request);
  const [sev, setSev] = useState<"open" | Severity | "all">("open");
  const [check, setCheck] = useState("");
  const [page, setPage] = useState("");
  const [running, setRunning] = useState(false);

  const shown = useMemo(
    () =>
      issues.filter(
        (i) =>
          (sev === "all" || (sev === "open" ? i.severity === "error" || i.severity === "warning" : i.severity === sev)) &&
          (!check || i.check === check) &&
          (!page || String(i.pageNumber) === page),
      ),
    [issues, sev, check, page],
  );
  const pages = [...ctx.pages].sort((a, b) => a.number - b.number);
  const last = runs[0];
  const prev = runs[1];
  const status = summary.errors ? "Blocked" : summary.warnings ? "Needs review" : "Ready for sign-off";

  const rerun = () => {
    setRunning(true);
    setTimeout(() => {
      record({ id: `qa-${Date.now()}`, at: new Date().toISOString(), errors: summary.errors, warnings: summary.warnings, infos: summary.infos, passed: summary.passed, pagesChecked: pages.length });
      log({ kind: "qa", message: `Preflight run: ${summary.errors} errors, ${summary.warnings} warnings across ${pages.length} pages`, actor: "QA engine", tone: summary.errors ? "error" : summary.warnings ? "warning" : "success" });
      setRunning(false);
      toast(summary.errors ? "warning" : "success", "Preflight complete", `${summary.errors} errors · ${summary.warnings} warnings · ${summary.passed} passed checks`);
    }, 900);
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-6 lg:p-8">
      <PageHeader
        title="Quality Assurance"
        description="Content fitting, overflowing text, missing images and formatting consistency, computed live from the templates, content and text-fit measurement of every page. Fix findings one by one or in bulk. Colour, fonts and PDF/X conformance are checked by InDesign at build time."
        actions={
          <Button variant="primary" onClick={rerun} loading={running}>
            {!running && <RefreshCw />} Re-run QA
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-[1.3fr_1fr_1fr_1fr_1fr]">
        <Card className={cn("p-4", summary.errors ? "border-[#f5cdcf]" : summary.warnings ? "border-[#f4dcb9]" : "border-[#cbe9d8]")}>
          <div className="flex items-center gap-2">
            <ShieldCheck className={cn("size-5", summary.errors ? "text-err" : summary.warnings ? "text-warn" : "text-ok")} />
            <p className="text-[13px] font-medium text-muted">Overall QA status</p>
          </div>
          <p className="mt-2 text-[20px] font-semibold text-ink">{status}</p>
          <p className="mt-1 text-[12px] text-muted">
            {last ? (
              <>
                Last run {fmtDateTime(last.at)}
                {prev && ` · errors ${prev.errors} → ${last.errors}`}
              </>
            ) : (
              "Live results — re-run to record a checkpoint"
            )}
          </p>
        </Card>
        {(["error", "warning", "info", "passed"] as Severity[]).map((s) => (
          <button key={s} onClick={() => setSev(s)} className={cn("rounded-xl border bg-white p-4 text-left shadow-card transition hover:border-line-strong", sev === s ? "border-brand ring-2 ring-brand-100" : "border-line")}>
            <div className="flex items-center gap-2">
              {ICON[s]}
              <span className="text-[13px] font-medium text-muted">{s === "passed" ? "Passed checks" : `${SEVERITY[s].label}s`}</span>
            </div>
            <p className="mt-2 text-[26px] leading-none font-semibold text-ink tabular-nums">{{ error: summary.errors, warning: summary.warnings, info: summary.infos, passed: summary.passed }[s]}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <Card className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <Segmented
              size="sm"
              value={sev}
              onChange={setSev}
              options={[
                { value: "open", label: "Errors & warnings" },
                { value: "error", label: "Errors" },
                { value: "warning", label: "Warnings" },
                { value: "info", label: "Info" },
                { value: "passed", label: "Passed" },
                { value: "all", label: "All" },
              ]}
            />
            <Select aria-label="Filter by check" value={check} onChange={(e) => setCheck(e.target.value)} className="h-8 w-[190px] text-[12.5px]">
              <option value="">All checks</option>
              {Object.entries(CHECK_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Select aria-label="Filter by page" value={page} onChange={(e) => setPage(e.target.value)} className="h-8 w-[120px] text-[12.5px]">
              <option value="">All pages</option>
              {pages.map((p) => (
                <option key={p.id} value={p.number}>
                  Page {p.number}
                </option>
              ))}
            </Select>
            <span className="ml-auto text-[12px] text-muted">{shown.length} results</span>
          </div>
          {shown.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <CheckCircle2 className="mx-auto size-6 text-ok" />
              <p className="mt-2 text-[14px] font-semibold text-ink">Nothing to show</p>
              <p className="text-[12.5px] text-muted">No results match the current filters.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {shown.map((i) => (
                <IssueRow
                  key={i.id}
                  i={i}
                  onOpen={() => router.push(routes.studio(i.pageId, i.frameId))}
                  onFix={(f) => runFix(i, f)}
                  onBulk={
                    BULK_FOR_CHECK[i.check]
                      ? () => {
                          const op = BULK_FOR_CHECK[i.check]!;
                          requestBulk(op, [...new Set(issues.filter((x) => x.check === i.check && x.severity !== "passed").map((x) => x.pageId))]);
                          document.getElementById("bulk")?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }
                      : undefined
                  }
                />
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <div id="bulk" className="scroll-mt-4">
            <BulkCorrections ctx={ctx} />
          </div>
          <Card>
            <CardHeader title="Pages" description="Open errors and warnings per page" />
            <ul className="thin-scroll grid max-h-[560px] grid-cols-3 gap-3 overflow-y-auto p-4">
              {pages.map((p) => {
                const e = issues.filter((i) => i.pageId === p.id && i.severity === "error").length;
                const w = issues.filter((i) => i.pageId === p.id && i.severity === "warning").length;
                return (
                  <li key={p.id}>
                    <button onClick={() => setPage(page === String(p.number) ? "" : String(p.number))} className={cn("block w-full rounded-sm border-2", page === String(p.number) ? "border-brand" : e ? "border-[#f0a9ad]" : w ? "border-[#f2cf9c]" : "border-transparent")} aria-label={`Filter to page ${p.number}`}>
                      <PageThumb ctx={ctx} pageId={p.id} uploads={uploads} width={74} />
                    </button>
                    <div className="mt-1 flex items-center justify-between text-[11px]">
                      <span className="font-semibold">{p.number}</span>
                      {e ? <span className="text-err">{e}E</span> : w ? <span className="text-warn">{w}W</span> : <CheckCircle2 className="size-3 text-ok" />}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card className="p-4 text-[12.5px] text-ink-2">
            <p className="font-semibold text-ink">About this preflight</p>
            <ul className="mt-2 space-y-1.5 text-muted">
              <li>• Text fit uses canvas measurement of the actual page fonts and the same line-breaking as the renderer.</li>
              <li>• Image resolution uses each upload&apos;s pixel size and its placed size in mm.</li>
              <li>• Colour space, font licensing, transparency flattening and PDF/X conformance require the connected InDesign service.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function IssueRow({ i, onOpen, onFix, onBulk }: { i: QAIssue; onOpen: () => void; onFix: (f: QAIssue["fixes"][number]) => void; onBulk?: () => void }) {
  return (
    <li className="group flex items-start gap-3 px-4 py-3 hover:bg-canvas/70">
      <span className="mt-0.5">{ICON[i.severity]}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onOpen} className="text-left text-[13.5px] font-medium text-ink hover:text-brand">
            {i.title}
          </button>
          <Badge tone={SEVERITY[i.severity].tone}>{SEVERITY[i.severity].label}</Badge>
          <Badge>{CHECK_LABELS[i.check]}</Badge>
        </div>
        <p className="mt-0.5 text-[12.5px] text-muted">{i.description}</p>
        {i.suggestion && i.severity !== "passed" && <p className="mt-1 text-[12.5px] text-ink-2">Suggested fix: {i.suggestion}</p>}
        {(i.fixes.length > 0 || (onBulk && i.severity !== "passed")) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {i.fixes.map((f) => (
              <Button key={f.type} size="sm" variant="subtle" className="h-7" onClick={() => onFix(f)}>
                {FIX_LABELS[f.type]}
              </Button>
            ))}
            {onBulk && i.severity !== "passed" && (
              <Button size="sm" variant="ghost" className="h-7" onClick={onBulk}>
                Fix in bulk: {BULK_LABEL[BULK_FOR_CHECK[i.check]!]}
              </Button>
            )}
          </div>
        )}
      </div>
      {i.severity !== "passed" && (
        <Button size="sm" variant="ghost" onClick={onOpen} className="shrink-0">
          Page {i.pageNumber} <ArrowRight />
        </Button>
      )}
      {i.severity === "passed" && <span className="text-[12px] text-muted">p. {i.pageNumber}</span>}
    </li>
  );
}
