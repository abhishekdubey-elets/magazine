"use client";

import { AlignCenter, AlignJustify, AlignLeft, AlignRight, CheckCircle2, ImageIcon, Link2, RotateCcw, Sparkles, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ImagePicker, PageStatusBadge } from "@/components/common";
import { Badge, Button, Field, Select, SimLabel, Textarea, cn, Segmented } from "@/components/ui";
import { CONTENT_TYPE_LABELS, recommendTemplates } from "@/lib/ai";
import { paragraphStyles } from "@/lib/design-tokens";
import { fontDisplayNames } from "@/lib/fonts";
import { effectivePpi, findImage, imageSrc } from "@/lib/images";
import { overrideKey, storyPages, type ResolvedPage } from "@/lib/layout-engine";
import { routes } from "@/lib/nav";
import { useCan } from "@/lib/sync/engine";
import { useStore } from "@/lib/store";
import { countWords } from "@/lib/text-engine";
import type { FontRole, PageStatus, PageType, ResolvedElement, TextStyle } from "@/lib/types";

const PAGE_TYPES: { value: PageType; label: string }[] = [
  { value: "cover", label: "Cover" },
  { value: "contents", label: "Contents" },
  { value: "editors-note", label: "Editor's note" },
  { value: "leadership-message", label: "Leadership message" },
  { value: "interview", label: "Interview" },
  { value: "article", label: "Standard article" },
  { value: "feature", label: "Full-page feature" },
  { value: "infographic", label: "Infographic / data" },
  { value: "advertisement", label: "Advertisement" },
  { value: "closing", label: "Closing page" },
];
export { PAGE_TYPES };

function Num({ label, value, onChange, step = 0.5, min, suffix }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; suffix?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted">{label}</span>
      <span className="relative block">
        <input
          type="number"
          step={step}
          min={min}
          value={draft ?? String(Math.round(value * 100) / 100)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== null && draft !== "" && !Number.isNaN(Number(draft))) onChange(Number(draft));
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="h-8 w-full rounded-md border border-line bg-white pr-7 pl-2 text-[12.5px] tabular-nums focus:border-brand focus:ring-2 focus:ring-brand-100 focus:outline-none"
        />
        {suffix && <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] text-faint">{suffix}</span>}
      </span>
    </label>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <h4 className="text-[11.5px] font-semibold tracking-wide text-muted uppercase">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ElementProperties({ r, el, onDeselect }: { r: ResolvedPage; el: ResolvedElement; onDeselect: () => void }) {
  const page = r.page;
  const s = useStore();
  const [picker, setPicker] = useState(false);
  const f = el.frame;
  const key = overrideKey(f);
  const setStyle = (patch: Partial<TextStyle>) => s.setFrameOverride(page.id, f.id, { style: patch });
  const isBody = f.bind === "body";
  const story = r.article ? storyPages(s.pages, r.article.id) : [];
  const storyFirst = story[0];
  const asset = el.kind === "image" ? findImage(el.imageId, s.uploads) : undefined;
  const ppi = asset ? effectivePpi(asset, el.w, el.h, el.imageFit) : 0;
  const editableText = el.kind === "text" && f.bind !== "facts";

  return (
    <div>
      <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold text-ink">{f.label}</p>
          <p className="mt-0.5 text-[11.5px] text-muted">
            {f.kind} frame{f.bind && f.bind !== "static" ? <> · bound to <code className="rounded bg-canvas px-1">{f.bind}</code></> : f.kind === "text" ? " · static text" : ""}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onDeselect}>
          Done
        </Button>
      </div>

      {editableText && !isBody && (
        <Section
          title="Content"
          action={
            el.textOverridden && (
              <button className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand hover:underline" onClick={() => s.setContentOverride(page.id, key, undefined)}>
                <Undo2 className="size-3" /> Revert to source
              </button>
            )
          }
        >
          <Textarea
            aria-label={`${f.label} text`}
            rows={f.role === "headline" || f.role === "kicker" ? 2 : 4}
            value={el.text}
            onChange={(e) => s.setContentOverride(page.id, key, e.target.value)}
            className="text-[13px]"
          />
          <p className="mt-1.5 text-[11.5px] text-muted">
            {el.textOverridden ? <Badge tone="warn">Page override</Badge> : "From source content"} · {countWords(el.text)} words · double-click the frame to edit in place
          </p>
        </Section>
      )}

      {isBody && r.article && (
        <Section title="Story">
          <p className="text-[12.5px] text-ink-2">
            Threaded across page{story.length > 1 ? "s" : ""} {story.map((p) => p.number).join(", ")} · {countWords(storyFirst?.contentOverrides.body ?? r.article.body)} words
          </p>
          {el.oversetWords ? (
            <p className="mt-1.5 rounded-md bg-err-50 px-2 py-1.5 text-[12px] text-err">{el.oversetWords} words overset — text is kept, not cut. Resolve in Checks.</p>
          ) : null}
          <Textarea
            aria-label="Story text"
            rows={9}
            className="mt-2 font-mono text-[11.5px] leading-relaxed"
            value={storyFirst?.contentOverrides.body ?? r.article.body}
            onChange={(e) => storyFirst && s.setContentOverride(storyFirst.id, "body", e.target.value)}
          />
          <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-muted">
            <span>Paragraphs: blank line · “Q:”/“A:” for interviews · “## ” sub-heads</span>
            {storyFirst?.contentOverrides.body !== undefined && (
              <button className="font-medium text-brand hover:underline" onClick={() => s.setContentOverride(storyFirst.id, "body", undefined)}>
                Revert
              </button>
            )}
          </div>
        </Section>
      )}

      {el.kind === "text" && (
        <Section title="Typography" action={f.styleId && <span className="text-[11px] text-faint">{paragraphStyles[f.styleId]?.indesignName}</span>}>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2 block">
              <span className="mb-1 block text-[11px] font-medium text-muted">Typeface</span>
              <Select value={el.style.font} onChange={(e) => setStyle({ font: e.target.value as FontRole })} className="h-8 text-[12.5px]" aria-label="Typeface">
                {(Object.keys(fontDisplayNames) as FontRole[]).map((r) => (
                  <option key={r} value={r}>
                    {fontDisplayNames[r]}
                  </option>
                ))}
              </Select>
            </label>
            <Num label="Size" value={el.style.size} suffix="pt" onChange={(v) => setStyle({ size: Math.max(4, v) })} />
            <Num label="Leading" value={el.style.leading} suffix="pt" onChange={(v) => setStyle({ leading: Math.max(4, v) })} />
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted">Weight</span>
              <Select value={el.style.weight} onChange={(e) => setStyle({ weight: Number(e.target.value) })} className="h-8 text-[12.5px]" aria-label="Weight">
                {[300, 400, 500, 700, 800, 900].map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </Select>
            </label>
            <Num label="Tracking" value={el.style.tracking ?? 0} step={10} suffix="‰" onChange={(v) => setStyle({ tracking: v })} />
            <div className="col-span-2">
              <span className="mb-1 block text-[11px] font-medium text-muted">Alignment</span>
              <Segmented
                size="sm"
                value={el.style.align}
                onChange={(v) => setStyle({ align: v })}
                options={[
                  { value: "left", label: <AlignLeft />, title: "Align left" },
                  { value: "center", label: <AlignCenter />, title: "Center" },
                  { value: "right", label: <AlignRight />, title: "Align right" },
                  { value: "justify", label: <AlignJustify />, title: "Justify" },
                ]}
              />
            </div>
            <label className="col-span-2 flex items-center gap-2">
              <input type="color" aria-label="Text colour" value={el.style.color.startsWith("#") ? el.style.color.slice(0, 7) : "#1f2633"} onChange={(e) => setStyle({ color: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-line" />
              <span className="text-[12px] text-muted">{el.style.color}</span>
              <label className="ml-auto flex items-center gap-1.5 text-[12px] text-ink-2">
                <input type="checkbox" checked={!!el.style.uppercase} onChange={(e) => setStyle({ uppercase: e.target.checked })} /> Caps
              </label>
            </label>
            {isBody && <Num label="Columns" value={el.columns} step={1} min={1} onChange={(v) => s.setFrameOverride(page.id, f.id, { columns: Math.max(1, Math.min(4, Math.round(v))) })} />}
          </div>
          {page.frameOverrides[f.id]?.style && (
            <p className="mt-2 text-[11.5px] text-warn">Local formatting differs from the paragraph style — QA will flag body text overrides.</p>
          )}
        </Section>
      )}

      {el.kind === "image" && (
        <Section title="Image">
          <div className="flex gap-3">
            <div className="grid h-20 w-16 shrink-0 place-items-center overflow-hidden rounded border border-line bg-canvas">
              {asset ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageSrc(asset)} alt="" className="size-full object-cover" />
              ) : (
                <ImageIcon className="size-5 text-faint" />
              )}
            </div>
            <div className="min-w-0 text-[12px]">
              <p className="truncate font-medium text-ink">{asset?.name ?? "No image placed"}</p>
              {asset && <p className="text-muted">{asset.vector ? "Vector artwork" : `${asset.width}×${asset.height}px · ${Math.round(ppi)} ppi effective`}</p>}
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => setPicker(true)}>
                {asset ? "Replace image" : "Place image"}
              </Button>
              {page.imageOverrides[f.bind ?? "image.0"] !== undefined && (
                <button className="mt-1 block text-[11.5px] font-medium text-brand hover:underline" onClick={() => s.setImageOverride(page.id, f.bind ?? "image.0", undefined)}>
                  Use article image
                </button>
              )}
            </div>
          </div>
          <div className="mt-3 space-y-2.5">
            <div>
              <span className="mb-1 block text-[11px] font-medium text-muted">Fitting</span>
              <Segmented
                size="sm"
                value={el.imageFit}
                onChange={(v) => s.setFrameOverride(page.id, f.id, { imageFit: v })}
                options={[
                  { value: "cover", label: "Fill frame" },
                  { value: "contain", label: "Fit proportionally" },
                ]}
              />
            </div>
            <label className="block">
              <span className="mb-1 flex justify-between text-[11px] font-medium text-muted">
                Crop focus (vertical) <span className="tabular-nums">{el.focusY}%</span>
              </span>
              <input type="range" min={0} max={100} value={el.focusY} onChange={(e) => s.setFrameOverride(page.id, f.id, { focusY: Number(e.target.value) })} className="w-full accent-[#2453c4]" aria-label="Vertical crop focus" />
            </label>
            <label className="block">
              <span className="mb-1 flex justify-between text-[11px] font-medium text-muted">
                Crop focus (horizontal) <span className="tabular-nums">{el.focusX}%</span>
              </span>
              <input type="range" min={0} max={100} value={el.focusX} onChange={(e) => s.setFrameOverride(page.id, f.id, { focusX: Number(e.target.value) })} className="w-full accent-[#2453c4]" aria-label="Horizontal crop focus" />
            </label>
          </div>
          <ImagePicker
            open={picker}
            onOpenChange={setPicker}
            current={el.imageId}
            preferred={f.label.toLowerCase().includes("portrait") ? "portrait" : undefined}
            onPick={(id) => {
              s.setImageOverride(page.id, f.bind ?? "image.0", id);
              s.log({ kind: "layout", message: `Image replaced in “${f.label}” on page ${page.number}`, pageId: page.id });
            }}
          />
        </Section>
      )}

      <Section
        title="Frame"
        action={
          el.overridden && (
            <button className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand hover:underline" onClick={() => s.resetFrame(page.id, f.id)}>
              <RotateCcw className="size-3" /> Reset frame
            </button>
          )
        }
      >
        <div className="grid grid-cols-4 gap-2">
          <Num label="X" value={el.x} suffix="mm" onChange={(v) => s.setFrameOverride(page.id, f.id, { x: v })} />
          <Num label="Y" value={el.y} suffix="mm" onChange={(v) => s.setFrameOverride(page.id, f.id, { y: v })} />
          <Num label="W" value={el.w} suffix="mm" min={1} onChange={(v) => s.setFrameOverride(page.id, f.id, { w: Math.max(1, v) })} />
          <Num label="H" value={el.h} suffix="mm" min={1} onChange={(v) => s.setFrameOverride(page.id, f.id, { h: Math.max(1, v) })} />
        </div>
        <p className="mt-2 text-[11.5px] text-muted">Drag to move · drag the corner handle to resize · arrow keys nudge 0.5 mm (Shift: 5 mm)</p>
      </Section>
    </div>
  );
}

export function PageProperties({ r, onGenerate }: { r: ResolvedPage; onGenerate: () => void }) {
  const s = useStore();
  const canApprove = useCan("approve-pages");
  const { page, article, template } = r;
  const recs = article ? recommendTemplates(article, s.templates, s.settings, s.publications.find((p) => p.id === page.publicationId)?.trim).slice(0, 3) : [];
  return (
    <div>
      <Section title={`Page ${page.number}`} action={<PageStatusBadge status={page.status} />}>
        <div className="space-y-2.5">
          <Field label="Page type" htmlFor="pp-type">
            <Select id="pp-type" value={page.pageType} onChange={(e) => s.updatePage(page.id, { pageType: e.target.value as PageType })} className="h-8 text-[12.5px]">
              {PAGE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Content" htmlFor="pp-article">
            <Select
              id="pp-article"
              value={page.articleId ?? ""}
              onChange={(e) => s.updatePage(page.id, { articleId: e.target.value || undefined, status: e.target.value && page.status !== "planned" ? page.status : "planned" })}
              className="h-8 text-[12.5px]"
            >
              <option value="">— No article —</option>
              {s.articles.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} ({CONTENT_TYPE_LABELS[a.contentType]})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Section" htmlFor="pp-sec">
            <Select id="pp-sec" value={page.sectionId ?? ""} onChange={(e) => s.updatePage(page.id, { sectionId: e.target.value || undefined })} className="h-8 text-[12.5px]">
              {s.publications[0].sections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Workflow status" htmlFor="pp-status">
            <Select id="pp-status" value={page.status} onChange={(e) => s.setPageStatus(page.id, e.target.value as PageStatus)} className="h-8 text-[12.5px]">
              <option value="planned" disabled={!!template}>
                Planned
              </option>
              <option value="draft">Draft</option>
              <option value="in-review">In review</option>
              <option value="approved" disabled={!canApprove && page.status !== "approved"}>
                Approved{canApprove ? "" : " (editors only)"}
              </option>
            </Select>
          </Field>
          {page.status === "approved" && page.approvedBy && (
            <p className="text-[11.5px] text-muted">
              Approved by {page.approvedBy}
              {page.approvedAt ? ` · ${new Date(page.approvedAt).toLocaleString()}` : ""}. Any change sends it back to review.
            </p>
          )}
          {page.status !== "approved" && page.reviewNote && <p className="rounded bg-warn-50 px-2 py-1.5 text-[11.5px] text-warn">{page.reviewNote}</p>}
          {article && (
            <Link href={routes.prepare(article.id)} className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline">
              <Link2 className="size-3" /> Open “{article.title}” in AI Preparation
            </Link>
          )}
        </div>
      </Section>
      {article && (
        <Section title="Layout suggestions" action={<SimLabel>Local heuristic</SimLabel>}>
          <ul className="space-y-2">
            {recs.map((rec, i) => (
              <li key={rec.template.id} className={cn("rounded-lg border p-2.5", rec.template.id === template?.id ? "border-brand bg-brand-50/50" : "border-line")}>
                <div className="flex items-center gap-2">
                  {i === 0 && <Sparkles className="size-3.5 text-ai" />}
                  <p className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink">{rec.template.name}</p>
                  <Badge tone={rec.fits ? "ok" : "warn"}>{rec.score}</Badge>
                </div>
                <ul className="mt-1 space-y-0.5 text-[11.5px] text-muted">
                  {rec.reasons.slice(1, 3).map((x) => (
                    <li key={x}>• {x}</li>
                  ))}
                </ul>
                {rec.template.id === template?.id ? (
                  <p className="mt-1.5 flex items-center gap-1 text-[11.5px] font-medium text-brand">
                    <CheckCircle2 className="size-3" /> Current template
                  </p>
                ) : (
                  <Button size="sm" variant="ghost" className="mt-1 -ml-2 h-7 text-brand" onClick={() => (page.status === "planned" ? onGenerate() : s.applyTemplate(page.id, rec.template.id))}>
                    {page.status === "planned" ? "Generate with this" : "Apply template"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Tips">
        <ul className="space-y-1 text-[12px] text-muted">
          <li>Click a frame to inspect it; double-click text to edit in place.</li>
          <li>
            <kbd className="rounded border border-line px-1">Ctrl</kbd>+<kbd className="rounded border border-line px-1">Z</kbd> undo · <kbd className="rounded border border-line px-1">PgUp</kbd>/<kbd className="rounded border border-line px-1">PgDn</kbd> change page
          </li>
          <li>Red “+” marks overset text — nothing is ever cut automatically.</li>
        </ul>
      </Section>
    </div>
  );
}
