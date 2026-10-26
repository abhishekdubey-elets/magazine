"use client";

import { usePublication } from "@/lib/hooks";
import { FileSearch, ImageOff, Pencil, Plus, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ApprovalBadge, EmptyState, fmtDate, PageHeader } from "@/components/common";
import { ContentEditor } from "@/components/content/ContentEditor";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { CONTENT_TYPE_LABELS } from "@/lib/ai";
import { imageSrc, findImage } from "@/lib/images";
import { routes } from "@/lib/nav";
import { useStore } from "@/lib/store";
import { countWords } from "@/lib/text-engine";
import type { Article, ContentType } from "@/lib/types";

export default function ContentPage() {
  return (
    <Suspense fallback={null}>
      <ContentLibrary />
    </Suspense>
  );
}

function ContentLibrary() {
  const params = useSearchParams();
  const articles = useStore((s) => s.articles);
  const pages = useStore((s) => s.pages);
  const uploads = useStore((s) => s.uploads);
  const sections = usePublication().sections;
  const [q, setQ] = useState(params.get("q") ?? "");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [section, setSection] = useState("");
  const [assets, setAssets] = useState("");
  const [placement, setPlacement] = useState("");
  const [editing, setEditing] = useState<Article | "new" | null>(null);

  useEffect(() => setQ(params.get("q") ?? ""), [params]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return articles.filter((a) => {
      const placed = pages.some((p) => p.articleId === a.id);
      if (needle && ![a.title, a.subtitle, a.author.name, a.author.organisation, a.tags.join(" "), a.body.slice(0, 400)].join(" ").toLowerCase().includes(needle)) return false;
      if (type && a.contentType !== type) return false;
      if (status && a.status !== status) return false;
      if (section && a.sectionId !== section) return false;
      if (assets === "missing-image" && a.imageIds.length > 0) return false;
      if (assets === "missing-caption" && !(a.imageIds.length && a.captions.some((c) => !c?.trim()))) return false;
      if (assets === "missing-designation" && a.author.designation?.trim()) return false;
      if (placement === "placed" && !placed) return false;
      if (placement === "unplaced" && placed) return false;
      return true;
    });
  }, [articles, pages, q, type, status, section, assets, placement]);

  const filtersActive = q || type || status || section || assets || placement;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-6 lg:p-8">
      <PageHeader
        title="Content Library"
        description="Approved copy, interviews and messages for every issue. Content stays separate from layout — pages reference it."
        actions={
          <Button variant="primary" onClick={() => setEditing("new")}>
            <Plus /> Add content
          </Button>
        }
      />
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
            <Input aria-label="Search content" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, author, organisation, tags…" className="pl-8" />
          </div>
          <Select aria-label="Content type" value={type} onChange={(e) => setType(e.target.value)} className="w-[160px]">
            <option value="">All types</option>
            {(Object.keys(CONTENT_TYPE_LABELS) as ContentType[]).map((t) => (
              <option key={t} value={t}>
                {CONTENT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
          <Select aria-label="Approval state" value={status} onChange={(e) => setStatus(e.target.value)} className="w-[150px]">
            <option value="">Any approval</option>
            <option value="draft">Draft</option>
            <option value="in-review">In review</option>
            <option value="needs-changes">Needs changes</option>
            <option value="approved">Approved</option>
          </Select>
          <Select aria-label="Section" value={section} onChange={(e) => setSection(e.target.value)} className="w-[190px]">
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Missing assets" value={assets} onChange={(e) => setAssets(e.target.value)} className="w-[170px]">
            <option value="">Any assets</option>
            <option value="missing-image">Missing image</option>
            <option value="missing-caption">Missing caption</option>
            <option value="missing-designation">Missing designation</option>
          </Select>
          <Select aria-label="Placement status" value={placement} onChange={(e) => setPlacement(e.target.value)} className="w-[140px]">
            <option value="">Placed or not</option>
            <option value="placed">On a page</option>
            <option value="unplaced">Backlog</option>
          </Select>
          {filtersActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQ("");
                setType("");
                setStatus("");
                setSection("");
                setAssets("");
                setPlacement("");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={<FileSearch />} title="No content matches these filters" description="Try a different search or clear the filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-[13px]">
              <thead className="border-b border-line bg-[#fafbfc] text-[12px] text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Title</th>
                  <th className="px-3 py-2.5 font-medium">Author / interviewee</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Section</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 text-right font-medium">Words</th>
                  <th className="px-3 py-2.5 font-medium">Images</th>
                  <th className="px-3 py-2.5 font-medium">Pages</th>
                  <th className="px-3 py-2.5 font-medium">Modified</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((a) => {
                  const on = pages.filter((p) => p.articleId === a.id).map((p) => p.number);
                  const sec = sections.find((s) => s.id === a.sectionId);
                  const thumb = imageSrc(findImage(a.imageIds[0], uploads));
                  return (
                    <tr key={a.id} className="group hover:bg-canvas">
                      <td className="max-w-[340px] px-5 py-2.5">
                        <div className="flex items-center gap-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded bg-[#eef0f4]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {thumb ? <img src={thumb} alt="" className="size-full object-cover" /> : <ImageOff className="size-4 text-faint" />}
                          </span>
                          <span className="min-w-0">
                            <button onClick={() => setEditing(a)} className="block max-w-full truncate text-left font-medium text-ink hover:text-brand">
                              {a.title === "Message" ? `Message — ${a.author.name}` : a.title}
                            </button>
                            <span className="block truncate text-[12px] text-muted">{a.subtitle ?? a.tags.join(" · ")}</span>
                          </span>
                        </div>
                      </td>
                      <td className="max-w-[220px] px-3 py-2.5">
                        <span className="block truncate text-ink-2">{a.author.name}</span>
                        <span className="block truncate text-[12px] text-muted">{a.author.designation || <span className="text-warn">No designation</span>}</span>
                      </td>
                      <td className="px-3 py-2.5 text-ink-2">{CONTENT_TYPE_LABELS[a.contentType]}</td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">
                          <span className="size-2 rounded-full" style={{ background: sec?.color }} />
                          {sec?.name}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <ApprovalBadge status={a.status} />
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{countWords(a.body)}</td>
                      <td className="px-3 py-2.5">
                        {a.imageIds.length ? (
                          <span className="text-[12.5px] text-ink-2">
                            {a.imageIds.length}
                            {a.captions.some((c) => !c?.trim()) && <Badge tone="warn" className="ml-1.5">caption</Badge>}
                          </span>
                        ) : (
                          <Badge tone="err">Missing</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[12.5px] text-ink-2 tabular-nums">{on.length ? on.join(", ") : <span className="text-faint">Backlog</span>}</td>
                      <td className="px-3 py-2.5 text-[12.5px] whitespace-nowrap text-muted">{fmtDate(a.updatedAt)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Button size="icon-sm" variant="ghost" aria-label={`Edit ${a.title}`} onClick={() => setEditing(a)}>
                            <Pencil />
                          </Button>
                          <Link href={routes.prepare(a.id)} aria-label={`Prepare ${a.title} with AI`} className="grid size-8 place-items-center rounded-md text-ai hover:bg-ai-50">
                            <Sparkles className="size-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-line px-5 py-2.5 text-[12px] text-muted">
          Showing {rows.length} of {articles.length} items · sample content — people and organisations are fictional
        </div>
      </Card>
      {editing && <ContentEditor key={editing === "new" ? "new" : editing.id} open onOpenChange={(o) => !o && setEditing(null)} article={editing === "new" ? undefined : editing} />}
    </div>
  );
}
