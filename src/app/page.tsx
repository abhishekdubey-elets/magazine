"use client";

import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Download,
  FileText,
  ImageOff,
  LayoutGrid,
  PenTool,
  Plus,
  ShieldCheck,
  Sparkles,
  Type,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { fmtDate, fmtDateTime, PageHeader } from "@/components/common";
import { PageThumb } from "@/components/page/PageRenderer";
import { NewPublicationDialog } from "@/components/publication/NewPublicationDialog";
import { Badge, Button, Card, CardHeader, cn, Progress } from "@/components/ui";
import { usePublication, useQa } from "@/lib/hooks";
import { routes } from "@/lib/nav";
import { FORMAT_LABEL, FORMATS } from "@/lib/reference/spec";
import { useStore } from "@/lib/store";
import type { ActivityKind, QACheckId } from "@/lib/types";

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
  "indesign-handoff": "InDesign build package",
  "pdf-print": "Print-ready PDF (InDesign)",
  "indd-native": "InDesign documents",
};

/** Preflight checks that count as "formatting inconsistencies" (goal 3). */
const FORMATTING_CHECKS: QACheckId[] = ["font-consistency", "margin-alignment", "image-fill", "image-resolution", "empty-caption"];

type Tone = "ok" | "warn" | "err" | "brand";

export default function OverviewPage() {
  const pub = usePublication();
  const publications = useStore((s) => s.publications);
  const articles = useStore((s) => s.articles);
  const templates = useStore((s) => s.templates);
  const activity = useStore((s) => s.activity);
  const exportJobs = useStore((s) => s.exportJobs);
  const uploads = useStore((s) => s.uploads);
  const { issues, ctx } = useQa();
  const [newOpen, setNewOpen] = useState(false);

  const pages = [...ctx.pages].sort((a, b) => a.number - b.number);
  const pubArticles = articles.filter((a) => a.publicationId === pub.id);
  const open = issues.filter((i) => i.severity === "error" || i.severity === "warning");

  // Goal 1 — reusable templates per editorial format.
  const active = templates.filter((t) => t.status === "active");
  const perFormat = FORMATS.map((f) => ({ format: f, label: FORMAT_LABEL[f], count: active.filter((t) => t.format === f).length }));
  const formatsCovered = perFormat.filter((f) => f.count > 0).length;
  const fromReference = active.filter((t) => t.referenceId).length;

  // Goal 2 — automated placement.
  const laidOut = pages.filter((p) => p.status !== "planned" && p.templateId);
  const withText = laidOut.filter((p) => p.articleId || (p.storyIds?.length ?? 0) > 0).length;
  const awaitingLayout = pages.filter((p) => p.status === "planned").length;
  const placedArticleIds = new Set(pages.flatMap((p) => [p.articleId, ...(p.storyIds ?? [])]).filter(Boolean));
  const placedArticles = pubArticles.filter((a) => placedArticleIds.has(a.id)).length;

  // Goal 3 — content fitting and checks.
  const overflow = open.filter((i) => i.check === "overflow");
  const missingImages = open.filter((i) => i.check === "missing-image");
  const formatting = open.filter((i) => FORMATTING_CHECKS.includes(i.check));
  const pagesClear = pages.filter((p) => !open.some((i) => i.pageId === p.id)).length;

  // Goal 4 — bulk corrections and exports.
  const bulkRuns = activity.filter((a) => a.message.startsWith("Bulk correction")).length;
  const pubExports = exportJobs.filter((j) => j.publicationId === pub.id);
  const completed = pubExports.filter((j) => j.status === "completed");
  const lastExport = completed[0];
  const printReady = completed.some((j) => j.format === "pdf-print" || j.format === "indd-native");

  const attention = open.slice(0, 6);

  return (
    <div className="mx-auto max-w-[1360px] space-y-6 p-6 lg:p-8">
      <PageHeader
        eyebrow={<Badge tone="brand">Active issue · {pub.stage.replace("-", " ")} stage · print date {fmtDate(pub.issueDate)}</Badge>}
        title={`${pub.title} — ${pub.issueLabel}`}
        description="Where this issue stands against the four production goals. Every number is computed live from the templates, content, pages and checks."
        actions={
          <>
            <Button onClick={() => setNewOpen(true)}>
              <Plus /> New issue
            </Button>
            <Button variant="primary" href={routes.publication(pub.id)}>
              <BookOpen /> Open issue
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Goal
          n={1}
          icon={<LayoutGrid />}
          title="Reusable templates"
          status={formatsCovered === FORMATS.length ? "All six formats have templates" : `${FORMATS.length - formatsCovered} format${FORMATS.length - formatsCovered === 1 ? "" : "s"} without a template`}
          tone={formatsCovered === FORMATS.length ? "ok" : "warn"}
          value={formatsCovered}
          total={FORMATS.length}
          body={
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
              {perFormat.map((f) => (
                <li key={f.format} className="flex items-center gap-1.5 text-[12px]">
                  {f.count ? <CheckCircle2 className="size-3.5 shrink-0 text-ok" /> : <XCircle className="size-3.5 shrink-0 text-err" />}
                  <span className="truncate text-ink-2">{f.label}</span>
                  <span className="ml-auto text-muted tabular-nums">{f.count}</span>
                </li>
              ))}
            </ul>
          }
          foot={`${active.length} active templates · ${fromReference} learned from a reference magazine`}
          links={[
            { label: "Templates", href: routes.templates() },
            { label: "Design Studio", href: routes.referenceStudio() },
          ]}
        />
        <Goal
          n={2}
          icon={<Type />}
          title="Automated placement"
          status={awaitingLayout ? `${awaitingLayout} page${awaitingLayout === 1 ? "" : "s"} awaiting layout` : pages.length ? "Every page is laid out" : "No pages yet"}
          tone={awaitingLayout ? "warn" : pages.length ? "ok" : "brand"}
          value={laidOut.length}
          total={pages.length}
          body={
            <ul className="space-y-1 text-[12px] text-ink-2">
              <Row label="Pages with text and images placed" value={`${withText}/${pages.length}`} />
              <Row label="Content items placed" value={`${placedArticles}/${pubArticles.length}`} />
              <Row label="Styles applied" value="Headline · body · caption · quote" />
            </ul>
          }
          foot="Text and images are placed from the template frames; InDesign builds use the same named paragraph styles."
          links={[
            { label: "Layout Studio", href: routes.studio() },
            { label: "Content Library", href: routes.content() },
          ]}
        />
        <Goal
          n={3}
          icon={<ShieldCheck />}
          title="Fitting & checks"
          status={open.length ? `${open.length} open finding${open.length === 1 ? "" : "s"}` : pages.length ? "All checks pass" : "No pages to check"}
          tone={issues.some((i) => i.severity === "error") ? "err" : open.length ? "warn" : "ok"}
          value={pagesClear}
          total={pages.length}
          body={
            <ul className="space-y-1 text-[12px] text-ink-2">
              <Row label="Overflowing text" value={overflow.length} bad={overflow.length > 0} />
              <Row label="Missing images" value={missingImages.length} bad={missingImages.length > 0} />
              <Row label="Formatting inconsistencies" value={formatting.length} bad={formatting.length > 0} />
            </ul>
          }
          foot={`${pagesClear} of ${pages.length} pages clear. Text is never cut or shrunk to fit; overset copy flows to continuation pages.`}
          links={[{ label: "Quality Assurance", href: routes.qa() }]}
        />
        <Goal
          n={4}
          icon={<Download />}
          title="Corrections & export"
          status={lastExport ? `Last export ${fmtDateTime(lastExport.createdAt)}` : "No exports yet"}
          tone={printReady ? "ok" : completed.length ? "brand" : "warn"}
          value={completed.length}
          total={Math.max(completed.length, 1)}
          hideProgress
          body={
            <ul className="space-y-1 text-[12px] text-ink-2">
              <Row label="Bulk corrections applied" value={bulkRuns} />
              <Row label="Exports completed" value={completed.length} />
              <Row label="Print-ready via InDesign" value={printReady ? "Yes" : "Not yet"} bad={!printReady} />
            </ul>
          }
          foot={lastExport ? `${FORMAT_SHORT[lastExport.format] ?? lastExport.format} · ${lastExport.pages.length} pages` : "Print files come only from InDesign (server mode); PDF proofs run in the browser."}
          links={[
            { label: "Export Center", href: routes.export() },
            { label: "Bulk corrections", href: `${routes.qa()}#bulk` },
          ]}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title="Pages"
              description={pages.length ? `${pages.length} pages · click a page to open it in Layout Studio` : "No pages yet — plan the issue in the Design Studio or open the issue to add pages"}
              actions={
                <Button size="sm" variant="ghost" href={routes.publication(pub.id)}>
                  Page plan <ArrowRight />
                </Button>
              }
            />
            {pages.length > 0 && (
              <div className="thin-scroll flex gap-3 overflow-x-auto p-5">
                {pages.map((p) => {
                  const bad = open.filter((i) => i.pageId === p.id);
                  const err = bad.some((i) => i.severity === "error");
                  return (
                    <Link key={p.id} href={routes.studio(p.id)} className="group shrink-0" aria-label={`Open page ${p.number}`}>
                      <div className={cn("rounded-sm border shadow-card transition group-hover:-translate-y-0.5 group-hover:shadow-pop", err ? "border-[#f0a9ad]" : bad.length ? "border-[#f2cf9c]" : "border-line")}>
                        <PageThumb ctx={ctx} pageId={p.id} uploads={uploads} width={96} />
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-1 text-[11.5px]">
                        <span className="font-semibold text-ink-2">{p.number}</span>
                        {p.status === "planned" ? <span className="text-muted">plan</span> : err ? <span className="text-err">{bad.length}</span> : bad.length ? <span className="text-warn">{bad.length}</span> : <CheckCircle2 className="size-3 text-ok" />}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Needs attention"
              description="Open errors and warnings from the fitting and formatting checks"
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
                      <span className="block truncate text-[13px] font-medium text-ink">
                        p. {i.pageNumber} · {i.title}
                      </span>
                      <span className="block truncate text-[12px] text-muted">{i.description}</span>
                    </span>
                    <ArrowRight className="size-4 text-faint" />
                  </Link>
                </li>
              ))}
              {attention.length === 0 && <li className="px-5 py-6 text-center text-[13px] text-ok">No open errors or warnings.</li>}
              {open.length > attention.length && (
                <li className="px-5 py-2.5 text-[12px] text-muted">
                  {open.length - attention.length} more in{" "}
                  <Link href={routes.qa()} className="text-brand hover:underline">
                    Quality Assurance
                  </Link>
                  .
                </li>
              )}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Issues" actions={<Button size="sm" variant="ghost" href="/publications">All <ArrowRight /></Button>} />
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
                    <Badge tone={p.id === pub.id ? "brand" : "neutral"}>{p.id === pub.id ? "active" : p.stage.replace("-", " ")}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Recent activity" />
            <ol className="thin-scroll max-h-[420px] overflow-y-auto px-5 py-3">
              {activity.slice(0, 12).map((a) => (
                <li key={a.id} className="flex gap-3 pb-4 last:pb-1">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line bg-white">{ACTIVITY_ICON[a.kind]}</span>
                  <div className="min-w-0 pt-0.5">
                    {a.pageId || a.articleId ? (
                      <Link href={a.pageId ? routes.studio(a.pageId) : routes.content()} className="text-[13px] leading-snug text-ink hover:text-brand">
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
              {activity.length === 0 && <li className="py-4 text-center text-[12.5px] text-muted">Nothing yet.</li>}
            </ol>
          </Card>
        </div>
      </div>
      <NewPublicationDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}

function Goal({
  n,
  icon,
  title,
  status,
  tone,
  value,
  total,
  hideProgress,
  body,
  foot,
  links,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  status: string;
  tone: Tone;
  value: number;
  total: number;
  hideProgress?: boolean;
  body: React.ReactNode;
  foot: string;
  links: { label: string; href: string }[];
}) {
  const color = { ok: "text-ok", warn: "text-warn", err: "text-err", brand: "text-brand" }[tone];
  const pct = total ? (value / total) * 100 : 0;
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-canvas text-[12.5px] font-bold text-ink-2">{n}</span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink">
            <span className={cn("[&_svg]:size-4", color)}>{icon}</span>
            {title}
          </p>
          <p className={cn("mt-0.5 text-[12px] font-medium", color)}>{status}</p>
        </div>
      </div>
      {!hideProgress && (
        <div className="mt-3 flex items-center gap-2">
          <Progress value={pct} tone={tone === "brand" ? "brand" : tone} className="flex-1" />
          <span className="text-[11.5px] text-muted tabular-nums">
            {value}/{total}
          </span>
        </div>
      )}
      <div className="mt-3">{body}</div>
      <p className="mt-3 text-[11.5px] leading-snug text-muted">{foot}</p>
      <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
        {links.map((l, i) => (
          <Button key={l.href} size="sm" variant={i === 0 ? "secondary" : "ghost"} href={l.href}>
            {l.label} <ArrowRight />
          </Button>
        ))}
      </div>
    </Card>
  );
}

function Row({ label, value, bad }: { label: string; value: React.ReactNode; bad?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="truncate">{label}</span>
      <span className={cn("shrink-0 font-medium tabular-nums", bad ? "text-warn" : "text-ink")}>{value}</span>
    </li>
  );
}
