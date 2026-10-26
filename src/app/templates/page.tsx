"use client";

import { Copy, Eye, LayoutGrid, Pencil, Search, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { fmtDate, PageHeader } from "@/components/common";
import { PageRenderer } from "@/components/page/PageRenderer";
import { TemplateWireframe } from "@/components/page/TemplateWireframe";
import { PAGE_TYPES } from "@/components/studio/PropertiesPanel";
import { toast } from "@/components/shell/toast";
import { Badge, Button, Card, Field, Input, Modal, Select, Textarea, cn } from "@/components/ui";
import { CONTENT_TYPE_LABELS } from "@/lib/ai";
import { PX_PER_MM } from "@/lib/design-tokens";
import { useLayoutContext } from "@/lib/hooks";
import { resolvePage, templateCapacity, type LayoutContext } from "@/lib/layout-engine";
import { routes } from "@/lib/nav";
import { useStore } from "@/lib/store";
import { HOUSE_TRIM } from "@/lib/templates";
import type { Article, ContentType, Page, Template } from "@/lib/types";

function sampleArticle(t: Template, articles: Article[]) {
  return articles.filter((a) => t.contentTypes.includes(a.contentType)).sort((a, b) => b.imageIds.length - a.imageIds.length || b.body.length - a.body.length)[0];
}

function previewPage(t: Template, articles: Article[]): Page {
  const a = sampleArticle(t, articles);
  return {
    id: `preview-${t.id}`,
    publicationId: "preview",
    number: 7,
    pageType: t.pageType,
    title: t.name,
    sectionId: a?.sectionId ?? "sec-front",
    templateId: t.id,
    articleId: t.pageType === "advertisement" || t.pageType === "cover" || t.pageType === "contents" ? undefined : a?.id,
    status: "draft",
    contentOverrides: {},
    imageOverrides: t.pageType === "advertisement" ? { "image.0": "img-ad-cloud" } : {},
    frameOverrides: {},
    updatedAt: t.updatedAt,
  };
}

export default function TemplatesPage() {
  const router = useRouter();
  const templates = useStore((s) => s.templates);
  const articles = useStore((s) => s.articles);
  const settings = useStore((s) => s.settings);
  const ctx = useLayoutContext();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState<Template | null>(null);
  const [editing, setEditing] = useState<Template | null>(null);
  const [selectFor, setSelectFor] = useState<Template | null>(null);

  const usage = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const p of ctx.pages) if (p.templateId) m.set(p.templateId, [...(m.get(p.templateId) ?? []), p.number]);
    return m;
  }, [ctx.pages]);

  const shown = templates.filter(
    (t) => (!q || `${t.name} ${t.description}`.toLowerCase().includes(q.toLowerCase())) && (!type || t.pageType === type) && (!status || t.status === status),
  );

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-6 lg:p-8">
      <PageHeader
        title="Templates"
        description="Structured page templates: frame geometry in mm, paragraph-style references and content bindings — stored separately from article content."
      />
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
          <Input aria-label="Search templates" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates…" className="pl-8" />
        </div>
        <Select aria-label="Page type" value={type} onChange={(e) => setType(e.target.value)} className="w-[200px]">
          <option value="">All page types</option>
          {PAGE_TYPES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-[150px]">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </Select>
        <span className="ml-auto text-[12px] text-muted">{shown.length} templates</span>
      </Card>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        {shown.map((t) => {
          const sample = sampleArticle(t, articles);
          const cap = sample && t.frames.some((f) => f.bind === "body") ? templateCapacity(t, sample, settings) : null;
          const used = usage.get(t.id) ?? [];
          return (
            <Card key={t.id} className="flex flex-col overflow-hidden">
              <button onClick={() => setPreview(t)} className="group flex gap-4 border-b border-line bg-[#f2f3f6] p-4 text-left" aria-label={`Preview ${t.name}`}>
                <TemplateWireframe template={t} className="w-[92px] shrink-0 rounded-sm shadow-card" />
                <div className="w-[92px] shrink-0 overflow-hidden rounded-sm shadow-card">
                  <MiniPreview t={t} ctx={ctx} articles={articles} />
                </div>
                <span className="ml-auto self-start rounded-md bg-white/80 p-1.5 text-muted opacity-0 transition group-hover:opacity-100">
                  <Eye className="size-4" />
                </span>
              </button>
              <div className="flex-1 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[14px] font-semibold text-ink">{t.name}</h3>
                  <Badge tone={t.status === "active" ? "ok" : t.status === "draft" ? "warn" : "neutral"}>{t.status}</Badge>
                </div>
                {t.referenceId && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge tone="ai">Create Like This · {t.derivation === "geometry" ? `measured from p.${t.sourcePage}` : "adapted"}</Badge>
                    <Badge>{t.trim?.width} × {t.trim?.height} mm</Badge>
                  </div>
                )}
                <p className="mt-1 line-clamp-2 text-[12.5px] text-muted">{t.description}</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
                  <Meta k="Page type" v={PAGE_TYPES.find((p) => p.value === t.pageType)?.label ?? t.pageType} />
                  <Meta k="Columns" v={String(t.columns)} />
                  <Meta k="Intended for" v={t.contentTypes.length ? t.contentTypes.map((c) => CONTENT_TYPE_LABELS[c]).join(", ") : "Fixed page"} />
                  <Meta k="Body capacity" v={cap !== null ? `≈ ${cap} words` : "—"} />
                  <Meta k="Images" v={t.imagePattern} wide />
                  <Meta k="Hierarchy" v={t.hierarchy} wide />
                  <Meta k="Modified" v={fmtDate(t.updatedAt)} />
                  <Meta k="In use" v={used.length ? `p. ${used.join(", ")}` : "Not used"} />
                </dl>
              </div>
              <div className="flex items-center gap-1 border-t border-line px-3 py-2">
                <Button size="sm" variant="ghost" onClick={() => setPreview(t)}>
                  <Eye /> Preview
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const id = useStore.getState().duplicateTemplate(t.id);
                    toast("success", "Template duplicated", "The copy is in draft status — edit it, then set it to active.");
                    const copy = useStore.getState().templates.find((x) => x.id === id);
                    if (copy) setEditing(copy);
                  }}
                >
                  <Copy /> Duplicate
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                  <Pencil /> Edit
                </Button>
                {t.contentTypes.length > 0 && (
                  <Button size="sm" variant="ghost" className="ml-auto text-brand" onClick={() => setSelectFor(t)} disabled={t.status !== "active"}>
                    <Send /> Use
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      {shown.length === 0 && (
        <Card className="p-10 text-center text-[13px] text-muted">
          <LayoutGrid className="mx-auto mb-2 size-5" /> No templates match.
        </Card>
      )}

      {preview && <PreviewModal t={preview} ctx={ctx} articles={articles} onClose={() => setPreview(null)} />}
      {editing && <EditTemplate key={editing.id} t={editing} onClose={() => setEditing(null)} />}
      {selectFor && (
        <SelectForArticle
          t={selectFor}
          onClose={() => setSelectFor(null)}
          onDone={(pageId, generate) => router.push(`${routes.studio(pageId)}${generate ? `&generate=1&template=${selectFor.id}` : ""}`)}
        />
      )}
    </div>
  );
}

function Meta({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return (
    <div className={cn(wide && "col-span-2")}>
      <dt className="text-faint">{k}</dt>
      <dd className="truncate text-ink-2" title={v}>
        {v}
      </dd>
    </div>
  );
}

function renderCtx(ctx: LayoutContext, page: Page): LayoutContext {
  return { ...ctx, pages: [page] };
}

/** Render a template at the page size it was designed for. */
function withTrim(ctx: LayoutContext, t: Template): LayoutContext {
  return { ...ctx, publication: { ...ctx.publication, trim: t.trim ?? HOUSE_TRIM } };
}

function MiniPreview({ t, ctx, articles }: { t: Template; ctx: LayoutContext; articles: Article[] }) {
  const uploads = useStore((s) => s.uploads);
  const page = previewPage(t, articles);
  const base = withTrim(ctx, t);
  const c = renderCtx(base, page);
  const W = base.publication.trim.width * PX_PER_MM;
  const s = 92 / W;
  return (
    <div style={{ width: 92, height: base.publication.trim.height * PX_PER_MM * s, overflow: "hidden" }}>
      <div style={{ transform: `scale(${s})`, transformOrigin: "0 0", pointerEvents: "none" }}>
        <PageRenderer r={resolvePage(c, page)} ctx={t.pageType === "contents" ? base : c} uploads={uploads} mode="thumb" />
      </div>
    </div>
  );
}

function PreviewModal({ t, ctx, articles, onClose }: { t: Template; ctx: LayoutContext; articles: Article[]; onClose: () => void }) {
  const uploads = useStore((s) => s.uploads);
  const page = previewPage(t, articles);
  const base = withTrim(ctx, t);
  const c = renderCtx(base, page);
  const sample = page.articleId ? articles.find((a) => a.id === page.articleId) : undefined;
  const s = 0.62;
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} width="max-w-4xl" title={t.name} description={sample ? `Rendered with sample content: “${sample.title}”` : "Rendered with template defaults"}>
      <div className="flex gap-6 max-md:flex-col">
        <div className="shrink-0 bg-[#e6e8ec] p-4">
          <div style={{ width: base.publication.trim.width * PX_PER_MM * s, height: base.publication.trim.height * PX_PER_MM * s, boxShadow: "var(--shadow-page)" }}>
            <div style={{ transform: `scale(${s})`, transformOrigin: "0 0" }}>
              <PageRenderer r={resolvePage(c, page)} ctx={t.pageType === "contents" ? base : c} uploads={uploads} mode="preview" />
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-ink-2">{t.description}</p>
          <p className="mt-4 mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase">Frames ({t.frames.length})</p>
          <ul className="thin-scroll max-h-[420px] space-y-1 overflow-y-auto text-[12px]">
            {t.frames.map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded-md border border-line px-2 py-1.5">
                <Badge tone={f.kind === "image" ? "brand" : f.kind === "text" ? "neutral" : "info"}>{f.kind}</Badge>
                <span className="min-w-0 flex-1 truncate text-ink">{f.label}</span>
                <span className="text-muted tabular-nums">
                  {f.w}×{f.h} mm
                </span>
                {f.bind && f.bind !== "static" && <code className="rounded bg-canvas px-1 text-[11px] text-muted">{f.bind}</code>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}

function EditTemplate({ t, onClose }: { t: Template; onClose: () => void }) {
  const [draft, setDraft] = useState<Template>(() => structuredClone(t));
  const set = (p: Partial<Template>) => setDraft((d) => ({ ...d, ...p }));
  const setFrame = (id: string, p: Partial<Template["frames"][number]>) => setDraft((d) => ({ ...d, frames: d.frames.map((f) => (f.id === id ? { ...f, ...p } : f)) }));
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      width="max-w-4xl"
      title={`Edit template — ${t.name}`}
      description={t.builtIn ? "Built-in template. Changes apply to every page that uses it; duplicate first to experiment safely." : "Custom template."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              useStore.getState().updateTemplate(t.id, draft);
              useStore.getState().log({ kind: "layout", message: `Template updated: ${draft.name}` });
              toast("success", "Template saved", "Pages using it re-flow immediately.");
              onClose();
            }}
          >
            Save template
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[1fr_180px]">
        <div className="space-y-3">
          <Field label="Name" htmlFor="te-name">
            <Input id="te-name" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Description" htmlFor="te-desc">
            <Textarea id="te-desc" rows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status" htmlFor="te-status">
              <Select id="te-status" value={draft.status} onChange={(e) => set({ status: e.target.value as Template["status"] })}>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>
            <Field label="Image pattern" htmlFor="te-img">
              <Input id="te-img" value={draft.imagePattern} onChange={(e) => set({ imagePattern: e.target.value })} />
            </Field>
          </div>
          <Field label="Intended content types">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(CONTENT_TYPE_LABELS) as ContentType[]).map((c) => {
                const on = draft.contentTypes.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set({ contentTypes: on ? draft.contentTypes.filter((x) => x !== c) : [...draft.contentTypes, c] })}
                    className={cn("rounded-full border px-2.5 py-1 text-[12px]", on ? "border-brand bg-brand-50 text-brand" : "border-line text-muted hover:border-line-strong")}
                  >
                    {CONTENT_TYPE_LABELS[c]}
                  </button>
                );
              })}
            </div>
          </Field>
          <div>
            <p className="mb-1.5 text-[12.5px] font-medium text-ink-2">Frame geometry (mm)</p>
            <div className="thin-scroll max-h-[300px] overflow-y-auto rounded-md border border-line">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-[#fafbfc] text-muted">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">Frame</th>
                    {["x", "y", "w", "h"].map((k) => (
                      <th key={k} className="w-16 px-1 py-1.5 text-left font-medium uppercase">
                        {k}
                      </th>
                    ))}
                    <th className="w-14 px-1 py-1.5 text-left font-medium">Cols</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {draft.frames.map((f) => (
                    <tr key={f.id}>
                      <td className="max-w-[180px] truncate px-2 py-1 text-ink-2">{f.label}</td>
                      {(["x", "y", "w", "h"] as const).map((k) => (
                        <td key={k} className="px-1 py-1">
                          <input
                            type="number"
                            step={0.5}
                            aria-label={`${f.label} ${k}`}
                            value={f[k]}
                            onChange={(e) => setFrame(f.id, { [k]: Number(e.target.value) })}
                            className="h-7 w-full rounded border border-line px-1.5 tabular-nums focus:border-brand focus:outline-none"
                          />
                        </td>
                      ))}
                      <td className="px-1 py-1">
                        {f.bind === "body" ? (
                          <input type="number" min={1} max={4} aria-label={`${f.label} columns`} value={f.columns ?? 1} onChange={(e) => setFrame(f.id, { columns: Math.max(1, Math.min(4, Number(e.target.value))) })} className="h-7 w-full rounded border border-line px-1.5 focus:border-brand focus:outline-none" />
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[12.5px] font-medium text-ink-2">Live wireframe</p>
          <TemplateWireframe template={draft} className="w-full rounded-sm border border-line shadow-card" />
        </div>
      </div>
    </Modal>
  );
}

function SelectForArticle({ t, onClose, onDone }: { t: Template; onClose: () => void; onDone: (pageId: string, generate: boolean) => void }) {
  const articles = useStore((s) => s.articles);
  const pages = useStore((s) => s.pages);
  const options = articles.filter((a) => t.contentTypes.includes(a.contentType));
  const [articleId, setArticleId] = useState(options[0]?.id ?? "");
  const page = pages.filter((p) => p.articleId === articleId).sort((a, b) => a.number - b.number)[0];
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Use “${t.name}”`}
      description="Apply this template to an article's page in Layout Studio."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!page}
            onClick={() => {
              if (!page) return;
              if (page.status === "planned") {
                onDone(page.id, true);
              } else {
                useStore.getState().applyTemplate(page.id, t.id);
                toast("success", `Template applied to page ${page.number}`, t.name);
                onDone(page.id, false);
              }
            }}
          >
            {page?.status === "planned" ? "Generate with template" : "Apply & open"}
          </Button>
        </>
      }
    >
      <Field label="Article" htmlFor="sfa">
        <Select id="sfa" value={articleId} onChange={(e) => setArticleId(e.target.value)}>
          {options.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title} — {CONTENT_TYPE_LABELS[a.contentType]}
            </option>
          ))}
        </Select>
      </Field>
      <p className="mt-3 text-[12.5px] text-muted">
        {page ? `Placed on page ${page.number} (${page.status.replace("-", " ")}).` : "This article is not on a page yet — send it to Layout Studio from AI Content Preparation first."}
      </p>
    </Modal>
  );
}
