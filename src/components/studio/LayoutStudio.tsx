"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Grid3x3,
  Maximize,
  Pencil,
  Redo2,
  Save,
  ShieldCheck,
  Sparkles,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, PageStatusBadge, SEVERITY } from "@/components/common";
import { PageRenderer, PageThumb, type Geometry } from "@/components/page/PageRenderer";
import { TemplateWireframe } from "@/components/page/TemplateWireframe";
import { FIX_LABELS, useRunFix } from "@/components/qa/FixHost";
import { toast } from "@/components/shell/toast";
import { Badge, Button, cn, Segmented, Tip } from "@/components/ui";
import { CONTENT_TYPE_LABELS } from "@/lib/ai";
import { PX_PER_MM } from "@/lib/design-tokens";
import { useLayoutContext, useQa } from "@/lib/hooks";
import { resolvePage } from "@/lib/layout-engine";
import { routes } from "@/lib/nav";
import { checkPage, summarize } from "@/lib/qa-engine";
import { redoPage, undoPage, useHistory, useStore } from "@/lib/store";
import { compatibleTemplates, fitsTrim } from "@/lib/templates";
import { GenerateDialog } from "./GenerateDialog";
import { ElementProperties, PageProperties } from "./PropertiesPanel";

type RightTab = "properties" | "checks";

export function LayoutStudio() {
  const count = useLayoutContext().pages.length;
  if (!count) {
    return (
      <div className="p-8">
        <EmptyState title="This publication has no pages yet" description="Add pages in Publications, or switch to another publication." />
      </div>
    );
  }
  return <StudioWorkspace />;
}

function StudioWorkspace() {
  const params = useSearchParams();
  const router = useRouter();
  const ctx = useLayoutContext();
  const uploads = useStore((s) => s.uploads);
  const templates = useStore((s) => s.templates);
  const pages = useMemo(() => [...ctx.pages].sort((a, b) => a.number - b.number), [ctx.pages]);
  const pageId = params.get("page") ?? "page-06";
  const page = pages.find((p) => p.id === pageId) ?? pages[0];
  const r = useMemo(() => resolvePage(ctx, page), [ctx, page]);

  const [selectedId, setSelectedId] = useState<string | null>(params.get("frame"));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [guides, setGuides] = useState(true);
  const [preview, setPreview] = useState(false);
  const [leftTab, setLeftTab] = useState<"pages" | "templates">("pages");
  const [rightTab, setRightTab] = useState<RightTab>("properties");
  const [genOpen, setGenOpen] = useState(params.get("generate") === "1");
  const [generating, setGenerating] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 900, h: 800 });
  const past = useHistory((h) => h.past[page.id]?.length ?? 0);
  const future = useHistory((h) => h.future[page.id]?.length ?? 0);
  const runFix = useRunFix();

  // Follow ?page= and ?frame= changes (e.g. from QA links).
  useEffect(() => {
    setSelectedId(params.get("frame"));
    setEditingId(null);
    if (params.get("frame")) setRightTab("properties");
    if (params.get("generate") === "1") setGenOpen(true);
  }, [params]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = ctx.publication.trim.width * PX_PER_MM;
  const H = ctx.publication.trim.height * PX_PER_MM;
  const fit = Math.max(0.2, Math.min((box.w - 96) / W, (box.h - 72) / H));
  const scale = zoom === "fit" ? fit : zoom;

  const goTo = useCallback(
    (id: string, frame?: string) => {
      router.replace(routes.studio(id, frame), { scroll: false });
    },
    [router],
  );
  const idx = pages.findIndex((p) => p.id === page.id);

  const pageIssues = useMemo(() => checkPage(ctx, r, uploads).filter((i) => i.severity !== "passed"), [ctx, r, uploads]);
  const { summary: pubSummary, issues: allIssues } = useQa();
  const selected = r.elements.find((e) => e.id === selectedId);

  const onGeometry = useCallback((id: string, g: Geometry) => useStore.getState().setFrameOverride(page.id, id, g), [page.id]);
  const onCommitText = useCallback(
    (id: string, text: string) => {
      setEditingId(null);
      const el = r.elements.find((e) => e.id === id);
      if (!el || text === el.text) return;
      const key = el.frame.bind && el.frame.bind !== "static" ? el.frame.bind : `frame:${el.frame.id}`;
      useStore.getState().setContentOverride(page.id, key, text);
      if (el.frame.role === "headline") useStore.getState().log({ kind: "layout", message: `Headline edited on page ${page.number}: “${text.slice(0, 60)}”`, pageId: page.id });
    },
    [r.elements, page.id, page.number],
  );

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]") || document.querySelector("[role=dialog]")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redoPage(page.id);
        else undoPage(page.id);
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redoPage(page.id);
      } else if (e.key === "Escape") setSelectedId(null);
      else if (e.key === "PageDown" && pages[idx + 1]) goTo(pages[idx + 1].id);
      else if (e.key === "PageUp" && pages[idx - 1]) goTo(pages[idx - 1].id);
      else if (selected && e.key.startsWith("Arrow") && !preview) {
        e.preventDefault();
        const d = e.shiftKey ? 5 : 0.5;
        const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0;
        const dy = e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0;
        useStore.getState().setFrameOverride(page.id, selected.id, { x: selected.x + dx, y: selected.y + dy });
      } else if (e.key === "Enter" && selected?.kind === "text" && selected.frame.bind !== "body") {
        e.preventDefault();
        setEditingId(selected.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page.id, pages, idx, goTo, selected, preview]);

  const runCheck = () => {
    const sum = summarize(checkPage(ctx, r, uploads));
    useStore.getState().recordQaRun({ id: `qa-${Date.now()}`, at: new Date().toISOString(), errors: pubSummary.errors, warnings: pubSummary.warnings, infos: pubSummary.infos, passed: pubSummary.passed, pagesChecked: pages.length });
    useStore.getState().log({ kind: "qa", message: `Quality check on page ${page.number}: ${sum.errors} errors, ${sum.warnings} warnings`, pageId: page.id, tone: sum.errors ? "error" : sum.warnings ? "warning" : "success" });
    setRightTab("checks");
    toast(sum.errors ? "error" : sum.warnings ? "warning" : "success", `Page ${page.number} checked`, `${sum.errors} errors · ${sum.warnings} warnings · ${sum.passed} passed`);
  };

  const compat = r.article ? compatibleTemplates(templates, r.article.contentType, ctx.publication.trim) : templates.filter((t) => t.pageType === page.pageType && fitsTrim(t, ctx.publication.trim));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line bg-white px-3">
        <div className="flex min-w-0 items-center gap-2 pr-2">
          <Button size="icon-sm" variant="ghost" aria-label="Previous page" disabled={idx <= 0} onClick={() => goTo(pages[idx - 1].id)}>
            <ChevronLeft />
          </Button>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink">
              Page {page.number} · {page.title}
            </p>
            <p className="truncate text-[11px] text-muted">{r.template?.name ?? "No template"}{r.article ? ` · ${CONTENT_TYPE_LABELS[r.article.contentType]}` : ""}</p>
          </div>
          <Button size="icon-sm" variant="ghost" aria-label="Next page" disabled={idx >= pages.length - 1} onClick={() => goTo(pages[idx + 1].id)}>
            <ChevronRight />
          </Button>
          <PageStatusBadge status={page.status} />
        </div>
        <Sep />
        <Tip label="Undo (Ctrl+Z)">
          <Button size="icon-sm" variant="ghost" aria-label="Undo" disabled={!past} onClick={() => undoPage(page.id)}>
            <Undo2 />
          </Button>
        </Tip>
        <Tip label="Redo (Ctrl+Shift+Z)">
          <Button size="icon-sm" variant="ghost" aria-label="Redo" disabled={!future} onClick={() => redoPage(page.id)}>
            <Redo2 />
          </Button>
        </Tip>
        <Sep />
        <Tip label="Zoom out">
          <Button size="icon-sm" variant="ghost" aria-label="Zoom out" onClick={() => setZoom(Math.max(0.25, Math.round((scale - 0.1) * 10) / 10))}>
            <ZoomOut />
          </Button>
        </Tip>
        <button className="w-12 rounded py-1 text-center text-[12px] font-medium tabular-nums text-ink-2 hover:bg-canvas" onClick={() => setZoom(1)} title="Actual size (100%)">
          {Math.round(scale * 100)}%
        </button>
        <Tip label="Zoom in">
          <Button size="icon-sm" variant="ghost" aria-label="Zoom in" onClick={() => setZoom(Math.min(3, Math.round((scale + 0.1) * 10) / 10))}>
            <ZoomIn />
          </Button>
        </Tip>
        <Tip label="Fit page">
          <Button size="icon-sm" variant={zoom === "fit" ? "subtle" : "ghost"} aria-label="Fit to page" onClick={() => setZoom("fit")}>
            <Maximize />
          </Button>
        </Tip>
        <Sep />
        <Tip label="Guides & frame edges">
          <Button size="icon-sm" variant={guides ? "subtle" : "ghost"} aria-pressed={guides} aria-label="Toggle guides" onClick={() => setGuides(!guides)}>
            <Grid3x3 />
          </Button>
        </Tip>
        <Segmented
          size="sm"
          value={preview ? "preview" : "edit"}
          onChange={(v) => {
            setPreview(v === "preview");
            setSelectedId(null);
          }}
          options={[
            { value: "edit", label: <><Pencil /> Edit</> },
            { value: "preview", label: <><Eye /> Preview</> },
          ]}
        />
        <div className="ml-auto flex items-center gap-1.5">
          {savedAt && <span className="mr-1 text-[11.5px] text-muted max-xl:hidden">Saved {savedAt}</span>}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const t = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
              setSavedAt(t);
              useStore.getState().updatePage(page.id, {}, { history: false });
              useStore.getState().log({ kind: "layout", message: `Draft saved — page ${page.number}`, pageId: page.id });
              toast("success", "Draft saved", "Stored locally in this browser. Changes also autosave.");
            }}
          >
            <Save /> Save draft
          </Button>
          <Button size="sm" variant="ghost" onClick={runCheck} disabled={!r.template}>
            <ShieldCheck /> Run check
          </Button>
          <Button size="sm" variant="ghost" onClick={() => router.push(`${routes.export()}?pages=${page.number}`)}>
            <Download /> Export
          </Button>
          <Button size="sm" variant="primary" onClick={() => setGenOpen(true)} disabled={generating}>
            <Sparkles /> {page.status === "planned" ? "Generate layout" : "Regenerate"}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left panel */}
        {!preview && (
          <aside className="flex w-[232px] shrink-0 flex-col border-r border-line bg-white max-xl:w-[196px]">
            <div className="border-b border-line p-2">
              <Segmented
                size="sm"
                className="w-full [&>button]:flex-1"
                value={leftTab}
                onChange={setLeftTab}
                options={[
                  { value: "pages", label: `Pages (${pages.length})` },
                  { value: "templates", label: "Templates" },
                ]}
              />
            </div>
            <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-2.5">
              {leftTab === "pages" ? (
                <ul className="grid grid-cols-2 gap-x-2.5 gap-y-3">
                  {pages.map((p) => {
                    const errs = allIssues.filter((i) => i.pageId === p.id && i.severity === "error").length;
                    const warns = allIssues.filter((i) => i.pageId === p.id && i.severity === "warning").length;
                    return (
                      <li key={p.id}>
                        <button
                          onClick={() => goTo(p.id)}
                          className={cn("block w-full rounded border-2 transition", p.id === page.id ? "border-brand" : "border-transparent hover:border-line-strong")}
                          aria-label={`Open page ${p.number}`}
                          aria-current={p.id === page.id ? "page" : undefined}
                        >
                          <div className="shadow-card">
                            <PageThumb ctx={ctx} pageId={p.id} uploads={uploads} width={92} />
                          </div>
                        </button>
                        <div className="mt-1 flex items-center gap-1 px-0.5 text-[11px]">
                          <span className="font-semibold text-ink-2">{p.number}</span>
                          {errs > 0 && <span className="size-1.5 rounded-full bg-err" title={`${errs} errors`} />}
                          {!errs && warns > 0 && <span className="size-1.5 rounded-full bg-warn" title={`${warns} warnings`} />}
                          <span className="ml-auto truncate text-muted">{p.status === "planned" ? "planned" : p.pageType.replace("-", " ")}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="space-y-2">
                  <p className="px-0.5 text-[11.5px] text-muted">{r.article ? `Compatible with ${CONTENT_TYPE_LABELS[r.article.contentType].toLowerCase()} content` : `Templates for ${page.pageType.replace("-", " ")} pages`}</p>
                  {compat.map((t) => (
                    <button
                      key={t.id}
                      disabled={page.status === "planned" && !!r.article}
                      onClick={() => {
                        useStore.getState().applyTemplate(page.id, t.id);
                        toast("success", `Template applied to page ${page.number}`, t.name);
                      }}
                      className={cn("flex w-full gap-2.5 rounded-lg border p-2 text-left transition disabled:opacity-60", t.id === page.templateId ? "border-brand bg-brand-50/60" : "border-line hover:border-line-strong")}
                    >
                      <TemplateWireframe template={t} className="w-12 shrink-0 rounded-sm border border-line" />
                      <span className="min-w-0">
                        <span className="block text-[12px] leading-tight font-semibold text-ink">{t.name}</span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-muted">{t.imagePattern}</span>
                        {t.id === page.templateId && <Badge tone="brand" className="mt-1">Current</Badge>}
                      </span>
                    </button>
                  ))}
                  {page.status === "planned" && r.article && <p className="text-[11.5px] text-muted">Generate the layout first, then switch templates freely.</p>}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Canvas */}
        <div ref={canvasRef} className="thin-scroll relative min-w-0 flex-1 overflow-auto bg-[#e6e8ec]" onPointerDown={() => setSelectedId(null)}>
          <div className="flex min-h-full min-w-full items-center justify-center p-9" style={{ width: W * scale + 96 > box.w ? W * scale + 96 : undefined }}>
            <div style={{ width: W * scale, height: H * scale, boxShadow: "var(--shadow-page)" }} className="relative shrink-0">
              <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0", width: W, height: H }}>
                <PageRenderer
                  r={r}
                  ctx={ctx}
                  uploads={uploads}
                  mode={preview ? "preview" : "edit"}
                  scale={scale}
                  guides={guides}
                  selectedId={selectedId}
                  editingId={editingId}
                  generating={generating}
                  onSelect={setSelectedId}
                  onStartEdit={setEditingId}
                  onCommitText={onCommitText}
                  onGeometry={onGeometry}
                />
              </div>
              {(r.continuesFrom || r.continuesTo) && !preview && (
                <div className="absolute -bottom-7 left-0 flex w-full justify-between text-[11.5px] text-muted">
                  <span>{r.continuesFrom ? <button className="hover:text-brand" onClick={() => goTo(pages.find((p) => p.number === r.continuesFrom)!.id)}>← Story continues from page {r.continuesFrom}</button> : null}</span>
                  <span>{r.continuesTo ? <button className="hover:text-brand" onClick={() => goTo(pages.find((p) => p.number === r.continuesTo)!.id)}>Continues on page {r.continuesTo} →</button> : null}</span>
                </div>
              )}
            </div>
          </div>
          {page.status === "planned" && !generating && (
            <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
              <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 shadow-pop">
                <Sparkles className="size-4 text-ai" />
                <p className="text-[13px] text-ink-2">{r.article ? <>“{r.article.title}” is ready for layout.</> : "Assign content in the Properties panel to generate this page."}</p>
                {r.article && (
                  <Button size="sm" variant="primary" onClick={() => setGenOpen(true)}>
                    Generate layout
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right panel */}
        {!preview && (
          <aside className="flex w-[300px] shrink-0 flex-col border-l border-line bg-white max-xl:w-[272px]">
            <div className="border-b border-line p-2">
              <Segmented
                size="sm"
                className="w-full [&>button]:flex-1"
                value={rightTab}
                onChange={setRightTab}
                options={[
                  { value: "properties", label: "Properties" },
                  {
                    value: "checks",
                    label: (
                      <>
                        Checks
                        {pageIssues.filter((i) => i.severity === "error" || i.severity === "warning").length > 0 && (
                          <span className="ml-0.5 rounded-full bg-err-50 px-1.5 text-[10.5px] text-err">{pageIssues.filter((i) => i.severity === "error" || i.severity === "warning").length}</span>
                        )}
                      </>
                    ),
                  },
                ]}
              />
            </div>
            <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
              {rightTab === "properties" ? (
                selected ? (
                  <ElementProperties r={r} el={selected} onDeselect={() => setSelectedId(null)} />
                ) : (
                  <PageProperties r={r} onGenerate={() => setGenOpen(true)} />
                )
              ) : (
                <div className="p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[12px] text-muted">Browser preflight for page {page.number}</p>
                    <Button size="sm" variant="ghost" onClick={runCheck}>
                      Re-run
                    </Button>
                  </div>
                  {pageIssues.length === 0 ? (
                    <div className="rounded-lg border border-[#cbe9d8] bg-ok-50 p-3 text-[12.5px] text-ok">
                      <CheckCircle2 className="mb-1 size-4" /> No issues on this page.
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {pageIssues.map((i) => (
                        <li key={i.id} className="rounded-lg border border-line p-2.5">
                          <div className="flex items-start gap-2">
                            <Badge tone={SEVERITY[i.severity].tone}>{SEVERITY[i.severity].label}</Badge>
                            {i.frameId && (
                              <button className="ml-auto text-[11.5px] font-medium text-brand hover:underline" onClick={() => { setSelectedId(i.frameId!); setRightTab("properties"); }}>
                                Select frame
                              </button>
                            )}
                          </div>
                          <p className="mt-1.5 text-[12.5px] font-medium text-ink">{i.title.replace(/^Page \d+: /, "")}</p>
                          <p className="mt-0.5 text-[12px] text-muted">{i.description}</p>
                          {i.fixes.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {i.fixes.map((f) => (
                                <Button key={f.type} size="sm" variant="subtle" className="h-7" onClick={() => runFix(i, f)}>
                                  {FIX_LABELS[f.type]}
                                </Button>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-3 flex gap-1.5 text-[11.5px] text-muted">
                    <AlertTriangle className="size-3.5 shrink-0" /> Simulated browser preflight — not a substitute for InDesign preflight or PDF/X validation.
                  </p>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
      {genOpen && <GenerateDialog pageId={page.id} open={genOpen} onOpenChange={(o) => { setGenOpen(o); if (!o && params.get("generate")) goTo(page.id); }} onRunning={setGenerating} preferredTemplate={params.get("template")} />}
    </div>
  );
}

function Sep() {
  return <span className="mx-1 h-5 w-px bg-line" />;
}
