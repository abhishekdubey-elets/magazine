"use client";

import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Download,
  FilePlus2,
  FileText,
  ImageOff,
  LayoutTemplate,
  PenTool,
  Plus,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { fmtDate, fmtDateTime, PageHeader, PageStatusBadge, Stat } from "@/components/common";
import { PageThumb } from "@/components/page/PageRenderer";
import { NewPublicationDialog } from "@/components/publication/NewPublicationDialog";
import { Badge, Button, Card, CardHeader, cn, Progress } from "@/components/ui";
import { usePublication, useQa } from "@/lib/hooks";
import { routes } from "@/lib/nav";
import { greeting, STAGES } from "@/lib/stages";
import { useStore } from "@/lib/store";
import type { ActivityKind } from "@/lib/types";

const ACTIVITY_ICON: Record<ActivityKind, React.ReactNode> = {
  ai: <Sparkles className="size-3.5 text-ai" />,
  content: <FileText className="size-3.5 text-brand" />,
  layout: <PenTool className="size-3.5 text-ink-2" />,
  qa: <ShieldCheck className="size-3.5 text-warn" />,
  export: <Download className="size-3.5 text-ok" />,
  system: <CheckCircle2 className="size-3.5 text-muted" />,
};

const FORMAT_SHORT: Record<string, string> = {
  "pdf-proof": "PDF proof",
  "pdf-web": "Web PDF",
  "png-pages": "Page images",
  "json-package": "JSON package",
  "indesign-handoff": "Handoff package",
};

export default function OverviewPage() {
  const pub = usePublication();
  const publications = useStore((s) => s.publications);
  const articles = useStore((s) => s.articles);
  const activity = useStore((s) => s.activity);
  const exportJobs = useStore((s) => s.exportJobs);
  const { issues, summary, ctx } = useQa();
  const uploads = useStore((s) => s.uploads);
  const [newOpen, setNewOpen] = useState(false);
  const pages = [...ctx.pages].sort((a, b) => a.number - b.number);
  const pubArticles = articles.filter((a) => a.publicationId === pub.id);
  const placed = new Set(pages.map((p) => p.articleId).filter(Boolean));
  const drafted = pages.filter((p) => p.status !== "planned").length;
  const awaiting = pages.filter((p) => p.status === "in-review" || p.status === "draft").length;
  const approved = pages.filter((p) => p.status === "approved").length;
  const lastExport = exportJobs.find((j) => j.publicationId === pub.id && j.status === "completed");
  const stageIdx = STAGES.findIndex((s) => s.id === pub.stage);
  const pipeline = [
    { label: "Content collected", value: pubArticles.length, total: pubArticles.length, href: routes.content() },
    { label: "Copy approved", value: pubArticles.filter((a) => a.status === "approved").length, total: pubArticles.length, href: routes.content() },
    { label: "Layouts drafted", value: drafted, total: pages.length, href: routes.publication(pub.id) },
    { label: "Pages approved", value: approved, total: pages.length, href: routes.publication(pub.id) },
    {
      label: "QA clear (no errors or warnings)",
      value: pages.filter((p) => !issues.some((i) => i.pageId === p.id && (i.severity === "error" || i.severity === "warning"))).length,
      total: pages.length,
      href: routes.qa(),
    },
  ];
  const attention = issues.filter((i) => i.severity === "error" || i.severity === "warning").slice(0, 5);
  const pGuide = pages.find((p) => p.id === "page-17");

  return (
    <div className="mx-auto max-w-[1360px] space-y-6 p-6 lg:p-8">
      <PageHeader
        eyebrow={<Badge tone="brand">Active issue · {pub.stage.replace("-", " ")} stage</Badge>}
        title={`${greeting()} — ${pub.title}, ${pub.issueLabel}`}
        description="From editorial content to publication-ready pages. Here is where the issue stands."
        actions={
          <>
            <Button onClick={() => setNewOpen(true)}>
              <Plus /> Start new publication
            </Button>
            <Button variant="primary" href={routes.publication(pub.id)}>
              <BookOpen /> Open publication
            </Button>
          </>
        }
      />

      <Card className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-[200px]">
            <p className="text-[12px] text-muted">Production stage</p>
            <p className="text-[15px] font-semibold text-ink">Print date {fmtDate(pub.issueDate)}</p>
          </div>
          <ol className="flex flex-1 items-center gap-1.5" aria-label="Production stages">
            {STAGES.map((s, i) => (
              <li key={s.id} className="flex flex-1 items-center gap-1.5" aria-current={i === stageIdx ? "step" : undefined}>
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold", i < stageIdx ? "bg-ok text-white" : i === stageIdx ? "bg-brand text-white ring-4 ring-brand-100" : "bg-[#eceff3] text-faint")}>
                  {i < stageIdx ? "✓" : i + 1}
                </span>
                <span className={cn("text-[12.5px] whitespace-nowrap", i === stageIdx ? "font-semibold text-ink" : "text-muted")}>{s.label}</span>
                {i < STAGES.length - 1 && <span className={cn("h-px min-w-3 flex-1", i < stageIdx ? "bg-ok" : "bg-line")} />}
              </li>
            ))}
          </ol>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Content items" value={pubArticles.length} sub={`${placed.size} placed · ${pubArticles.filter((a) => a.status === "approved").length} approved`} icon={<FileText />} />
        <Stat label="Pages drafted" value={`${drafted}/${pages.length}`} sub={`${pages.length - drafted} awaiting layout`} icon={<LayoutTemplate />} />
        <Stat label="Awaiting review" value={awaiting} sub={`${approved} pages approved`} icon={<PenTool />} tone="warn" />
        <Stat label="QA errors" value={summary.errors} sub="Blocking print sign-off" icon={<XCircle />} tone="err" />
        <Stat label="Layout warnings" value={summary.warnings} sub="Should be reviewed" icon={<AlertTriangle />} tone="warn" />
        <Stat label="Export status" value={lastExport ? `${lastExport.pages.length} pp` : "—"} sub={lastExport ? `${FORMAT_SHORT[lastExport.format] ?? lastExport.format} · ${fmtDateTime(lastExport.createdAt)}` : "No exports yet"} icon={<Download />} tone="ok" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Production pipeline" description="Computed from live content, page and QA state." />
            <div className="grid gap-x-8 gap-y-4 p-5 md:grid-cols-2">
              {pipeline.map((p) => (
                <Link key={p.label} href={p.href} className="group block">
                  <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                    <span className="font-medium text-ink-2 group-hover:text-brand">{p.label}</span>
                    <span className="text-muted tabular-nums">
                      {p.value}/{p.total}
                    </span>
                  </div>
                  <Progress value={(p.value / Math.max(p.total, 1)) * 100} tone={p.value === p.total ? "ok" : "brand"} />
                </Link>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Page plan"
              description={`${pages.length} pages · click a page to open it in Layout Studio`}
              actions={
                <Button size="sm" variant="ghost" href={routes.publication(pub.id)}>
                  Workspace <ArrowRight />
                </Button>
              }
            />
            <div className="thin-scroll flex gap-3 overflow-x-auto p-5">
              {pages.map((p) => (
                <Link key={p.id} href={routes.studio(p.id)} className="group shrink-0" aria-label={`Open page ${p.number}`}>
                  <div className="rounded-sm border border-line shadow-card transition group-hover:-translate-y-0.5 group-hover:shadow-pop">
                    <PageThumb ctx={ctx} pageId={p.id} uploads={uploads} width={104} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-1">
                    <span className="text-[11.5px] font-semibold text-ink-2">{p.number}</span>
                    <span className={cn("size-1.5 rounded-full", { planned: "bg-faint", draft: "bg-warn", "in-review": "bg-brand", approved: "bg-ok" }[p.status])} title={p.status} />
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Needs attention"
              description="Highest-severity findings from the browser preflight"
              actions={
                <Button size="sm" variant="ghost" href={routes.qa()}>
                  All checks <ArrowRight />
                </Button>
              }
            />
            <ul className="divide-y divide-line">
              {attention.map((i) => (
                <li key={i.id}>
                  <Link href={routes.studio(i.pageId, i.frameId)} className="flex items-center gap-3 px-5 py-3 hover:bg-canvas">
                    {i.severity === "error" ? (
                      i.check === "missing-image" ? <ImageOff className="size-4 shrink-0 text-err" /> : <XCircle className="size-4 shrink-0 text-err" />
                    ) : (
                      <AlertTriangle className="size-4 shrink-0 text-warn" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{i.title}</span>
                      <span className="block truncate text-[12px] text-muted">{i.description}</span>
                    </span>
                    <ArrowRight className="size-4 text-faint" />
                  </Link>
                </li>
              ))}
              {attention.length === 0 && <li className="px-5 py-6 text-center text-[13px] text-ok">No errors or warnings — ready for sign-off.</li>}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Recent activity" />
            <ol className="thin-scroll max-h-[440px] overflow-y-auto px-5 py-3">
              {activity.slice(0, 14).map((a) => (
                <li key={a.id} className="flex gap-3 pb-4 last:pb-1">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line bg-white">{ACTIVITY_ICON[a.kind]}</span>
                  <div className="min-w-0 pt-0.5">
                    {a.pageId || a.articleId ? (
                      <Link href={a.pageId ? routes.studio(a.pageId) : routes.prepare(a.articleId)} className="text-[13px] leading-snug text-ink hover:text-brand">
                        {a.message}
                      </Link>
                    ) : (
                      <p className="text-[13px] leading-snug text-ink">{a.message}</p>
                    )}
                    <p className="mt-0.5 text-[11.5px] text-muted">
                      {a.actor} · {fmtDateTime(a.at)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <CardHeader title="Publications" actions={<Button size="sm" variant="ghost" href="/publications">All <ArrowRight /></Button>} />
            <ul className="divide-y divide-line">
              {publications.map((p) => (
                <li key={p.id}>
                  <Link href={routes.publication(p.id)} className="flex items-center gap-3 px-5 py-3 hover:bg-canvas">
                    <span className="grid h-11 w-8 shrink-0 place-items-center rounded-sm text-[10px] font-bold text-white" style={{ background: p.coverColor }}>
                      {p.masthead.slice(0, 2)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">
                        {p.title} — {p.issueLabel}
                      </span>
                      <span className="block text-[12px] text-muted">
                        {p.pageIds.length || "No"} pages · updated {fmtDate(p.updatedAt)}
                      </span>
                    </span>
                    <Badge tone={p.stage === "published" ? "ok" : p.stage === "planning" ? "neutral" : "brand"}>{p.stage.replace("-", " ")}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          {pGuide && (
            <Card className="p-5">
              <div className="flex items-start gap-3">
                <FilePlus2 className="mt-0.5 size-5 shrink-0 text-brand" />
                <div>
                  <p className="text-[13.5px] font-semibold text-ink">Next best action</p>
                  <p className="mt-1 text-[12.5px] text-muted">
                    {pGuide.status === "planned"
                      ? "Page 17 has an interview waiting for layout. Generate it, then clear the image error on page 10 before the proof run."
                      : "Clear remaining QA errors, approve pages in review and prepare the next proof."}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Button size="sm" variant="primary" href={pGuide.status === "planned" ? routes.studio("page-17") : routes.qa()}>
                      {pGuide.status === "planned" ? "Open page 17" : "Open QA"}
                    </Button>
                    <PageStatusBadge status={pGuide.status} />
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
      <NewPublicationDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}
