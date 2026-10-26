"use client";

import { ArrowRight, BookOpen, Clock, FileText, LayoutGrid, List, PenTool, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApprovalBadge, EmptyState, fmtDateTime, PageHeader, PageStatusBadge } from "@/components/common";
import { PageThumb } from "@/components/page/PageRenderer";
import { Badge, Button, Card, CardHeader, cn, Progress, Segmented } from "@/components/ui";
import { CONTENT_TYPE_LABELS } from "@/lib/ai";
import { useLayoutContext, useQa } from "@/lib/hooks";
import { routes } from "@/lib/nav";
import { useStore } from "@/lib/store";
import { countWords } from "@/lib/text-engine";

const TYPE_LABEL: Record<string, string> = {
  cover: "Cover",
  contents: "Contents",
  "editors-note": "Editor's note",
  "leadership-message": "Leadership message",
  interview: "Interview",
  article: "Article",
  feature: "Feature",
  infographic: "Infographic",
  advertisement: "Advertisement",
  closing: "Closing",
};

export default function PublicationWorkspace() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pub = useStore((s) => s.publications.find((p) => p.id === id));
  const activeId = useStore((s) => s.activePublicationId);
  const articles = useStore((s) => s.articles);
  const uploads = useStore((s) => s.uploads);
  const [view, setView] = useState<"grid" | "list">("grid");

  // Opening a publication makes it the active issue for Studio, QA and Export.
  useEffect(() => {
    if (pub && activeId !== pub.id) useStore.setState({ activePublicationId: pub.id });
  }, [pub, activeId]);

  const ctx = useLayoutContext();
  const { issues } = useQa();
  const pages = useMemo(() => [...ctx.pages].sort((a, b) => a.number - b.number), [ctx.pages]);

  if (!pub) {
    return <EmptyState icon={<BookOpen />} title="Publication not found" description="It may have been removed when demo data was reset." action={<Button href="/publications">All publications</Button>} />;
  }
  if (activeId !== pub.id) return null;

  const pubArticles = articles.filter((a) => pages.some((p) => p.articleId === a.id));
  const approved = pages.filter((p) => p.status === "approved").length;
  const generated = pages.filter((p) => p.status !== "planned").length;
  const sectionRanges = pub.sections
    .map((s) => {
      const nums = pages.filter((p) => (p.sectionId ?? articles.find((a) => a.id === p.articleId)?.sectionId) === s.id).map((p) => p.number);
      return { s, nums };
    })
    .filter((x) => x.nums.length);
  const completeness = pubArticles.length
    ? Math.round(
        (pubArticles.reduce((n, a) => n + [a.title, a.subtitle, a.author.name, a.author.designation, a.summary, a.imageIds.length, a.pullQuotes.length].filter(Boolean).length, 0) / (pubArticles.length * 7)) * 100,
      )
    : 0;
  const issueCount = (pid: string, sev: string) => issues.filter((i) => i.pageId === pid && i.severity === sev).length;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6 lg:p-8">
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2 text-[12.5px] text-muted">
            <Link href="/publications" className="hover:text-brand">
              Publications
            </Link>{" "}
            / <span className="text-ink-2">{pub.issueLabel}</span>
          </span>
        }
        title={`${pub.title} — ${pub.issueLabel}`}
        description={pub.description}
        actions={
          <>
            <Button href={routes.qa()}>
              <ShieldCheck /> Run QA
            </Button>
            <Button variant="primary" href={routes.studio(pages.find((p) => p.status === "planned")?.id ?? pages[0]?.id)}>
              <PenTool /> Open Layout Studio
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <Card className="overflow-hidden">
          {pages[0] && (
            <Link href={routes.studio(pages[0].id)} className="block border-b border-line bg-[#e6e8ec] p-5" aria-label="Open cover in Layout Studio">
              <div className="mx-auto w-fit shadow-page">
                <PageThumb ctx={ctx} pageId={pages[0].id} uploads={uploads} width={190} mode="preview" />
              </div>
            </Link>
          )}
          <dl className="space-y-2.5 p-4 text-[12.5px]">
            {[
              ["Issue date", new Date(pub.issueDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })],
              ["Status", <Badge key="s" tone="brand">{pub.stage.replace("-", " ")}</Badge>],
              ["Pages", `${pages.length} · ${pub.trim.width}×${pub.trim.height} mm`],
              ["Bleed", `${pub.bleed} mm`],
              ["Last updated", `${fmtDateTime(pub.updatedAt)}`],
              ["Updated by", pub.updatedBy],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex items-center justify-between gap-2">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right font-medium text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <div className="min-w-0 space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-4">
              <p className="text-[12.5px] text-muted">Publication progress</p>
              <p className="mt-1 text-[22px] font-semibold text-ink">{Math.round((approved / Math.max(pages.length, 1)) * 100)}%</p>
              <Progress className="mt-2" value={(approved / Math.max(pages.length, 1)) * 100} tone="ok" />
              <p className="mt-2 text-[12px] text-muted">
                {approved} approved · {generated - approved} in progress · {pages.length - generated} planned
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[12.5px] text-muted">Content completeness</p>
              <p className="mt-1 text-[22px] font-semibold text-ink">{completeness}%</p>
              <Progress className="mt-2" value={completeness} />
              <p className="mt-2 text-[12px] text-muted">Headline, deck, author, designation, summary, image, pull quote</p>
            </Card>
            <Card className="p-4">
              <p className="text-[12.5px] text-muted">Sections</p>
              <ul className="mt-2 space-y-1">
                {sectionRanges.slice(0, 5).map(({ s, nums }) => (
                  <li key={s.id} className="flex items-center gap-2 text-[12.5px]">
                    <span className="size-2 rounded-full" style={{ background: s.color }} />
                    <span className="truncate text-ink-2">{s.name}</span>
                    <span className="ml-auto text-muted tabular-nums">
                      pp. {Math.min(...nums)}
                      {nums.length > 1 ? `–${Math.max(...nums)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Page overview"
              description="Click any page to open it in Layout Studio."
              actions={
                <Segmented
                  size="sm"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: "grid", label: <LayoutGrid />, title: "Grid" },
                    { value: "list", label: <List />, title: "List" },
                  ]}
                />
              }
            />
            {pages.length === 0 ? (
              <EmptyState title="No pages yet" />
            ) : view === "grid" ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-x-4 gap-y-5 p-5">
                {pages.map((p) => {
                  const errs = issueCount(p.id, "error");
                  const warns = issueCount(p.id, "warning");
                  return (
                    <button key={p.id} onClick={() => router.push(routes.studio(p.id))} className="group text-left" aria-label={`Open page ${p.number}: ${p.title}`}>
                      <div className="relative rounded-sm border border-line shadow-card transition group-hover:-translate-y-0.5 group-hover:shadow-pop">
                        <PageThumb ctx={ctx} pageId={p.id} uploads={uploads} width={130} />
                        {(errs > 0 || warns > 0) && (
                          <span className={cn("absolute top-1.5 right-1.5 rounded-full px-1.5 text-[10.5px] font-semibold", errs ? "bg-err text-white" : "bg-warn text-white")}>{errs || warns}</span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="text-[12px] font-semibold text-ink">{p.number}</span>
                        <span className="truncate text-[11.5px] text-muted">{TYPE_LABEL[p.pageType]}</span>
                      </div>
                      <p className="truncate text-[11.5px] text-ink-2">{p.title}</p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-line text-[12px] text-muted">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Page</th>
                    <th className="px-3 py-2.5 font-medium">Type</th>
                    <th className="px-3 py-2.5 font-medium">Content</th>
                    <th className="px-3 py-2.5 font-medium">Template</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">QA</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pages.map((p) => (
                    <tr key={p.id} className="hover:bg-canvas">
                      <td className="px-5 py-2.5 font-semibold tabular-nums">{p.number}</td>
                      <td className="px-3 py-2.5 text-ink-2">{TYPE_LABEL[p.pageType]}</td>
                      <td className="max-w-[260px] truncate px-3 py-2.5">{p.title}</td>
                      <td className="px-3 py-2.5 text-muted">{ctx.templates[p.templateId ?? ""]?.name ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <PageStatusBadge status={p.status} />
                      </td>
                      <td className="px-3 py-2.5 text-[12px]">
                        {issueCount(p.id, "error") ? <span className="text-err">{issueCount(p.id, "error")} errors</span> : issueCount(p.id, "warning") ? <span className="text-warn">{issueCount(p.id, "warning")} warnings</span> : <span className="text-ok">Clear</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Link href={routes.studio(p.id)} className="text-brand hover:underline">
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card>
            <CardHeader title="Articles in this issue" description={`${pubArticles.length} content items placed on pages`} actions={<Button size="sm" variant="ghost" href={routes.content()}>Content Library <ArrowRight /></Button>} />
            <ul className="divide-y divide-line">
              {pubArticles.map((a) => {
                const on = pages.filter((p) => p.articleId === a.id).map((p) => p.number);
                return (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-2.5">
                    <FileText className="size-4 shrink-0 text-muted" />
                    <div className="min-w-0 flex-1">
                      <Link href={routes.prepare(a.id)} className="block truncate text-[13px] font-medium text-ink hover:text-brand">
                        {a.title === "Message" ? `Message — ${a.author.name}` : a.title}
                      </Link>
                      <p className="truncate text-[12px] text-muted">
                        {CONTENT_TYPE_LABELS[a.contentType]} · {a.author.name} · {countWords(a.body)} words
                      </p>
                    </div>
                    <span className="text-[12px] text-muted tabular-nums">p. {on.join(", ")}</span>
                    <ApprovalBadge status={a.status} />
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center gap-1.5 border-t border-line px-5 py-2.5 text-[12px] text-muted">
              <Clock className="size-3.5" /> Last updated {fmtDateTime(pub.updatedAt)} by {pub.updatedBy}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
