"use client";

import { ArrowRight, CheckCircle2, Info, LayoutTemplate, Palette, Ruler, Save, Trash2, Type, WandSparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { fmtBytes, fmtDateTime } from "@/components/common";
import { PageRenderer } from "@/components/page/PageRenderer";
import { TemplateWireframe } from "@/components/page/TemplateWireframe";
import { toast } from "@/components/shell/toast";
import { Badge, Button, Card, CardHeader, cn, Field, Input, Modal, Select, SimLabel, Switch } from "@/components/ui";
import { sections as houseSections } from "@/data/seed";
import { PX_PER_MM } from "@/lib/design-tokens";
import { useFonts, usePublication } from "@/lib/hooks";
import { makeContext, resolvePage } from "@/lib/layout-engine";
import { routes } from "@/lib/nav";
import { isFurniture } from "@/lib/reference/analyze";
import { bestModels, buildFromReference, DERIVABLE, modelTemplate, REF_TYPE_LABELS } from "@/lib/reference/derive";
import { useStore } from "@/lib/store";
import type { Article, Page, ReferenceProfile, RefPage, RefPageType } from "@/lib/types";

const TYPE_TONE: Record<RefPageType, string> = {
  cover: "#1d2b4f",
  contents: "#475569",
  message: "#c2410c",
  interview: "#2453c4",
  "feature-opener": "#6b3fa0",
  article: "#127a45",
  infographic: "#0f766e",
  advertisement: "#b45309",
  other: "#98a0ae",
};

export function ReferenceReport({ profile }: { profile: ReferenceProfile }) {
  const router = useRouter();
  const [detail, setDetail] = useState<RefPage | null>(null);
  const reps = useMemo(() => bestModels(profile), [profile]);
  const [models, setModels] = useState<Partial<Record<RefPageType, number>>>(reps);
  const mix = Object.entries(
    profile.pages.reduce<Record<string, number>>((m, p) => ((m[p.type] = (m[p.type] ?? 0) + 1), m), {}),
  ).sort((a, b) => b[1] - a[1]) as [RefPageType, number][];
  const kinds = DERIVABLE.filter((k) => profile.pages.some((p) => p.type === k));

  const setType = (n: number, type: RefPageType) => {
    useStore.getState().updateReference(profile.id, { pages: profile.pages.map((p) => (p.number === n ? { ...p, type } : p)) });
    setDetail((d) => (d && d.number === n ? { ...d, type } : d));
    if (DERIVABLE.includes(type) && !models[type]) setModels((m) => ({ ...m, [type]: n }));
  };

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {profile.pages[0]?.thumb && <img src={profile.pages[0].thumb} alt="Reference cover" className="h-20 rounded-sm border border-line shadow-card" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold text-ink">{profile.name}</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {profile.fileName} · {fmtBytes(profile.fileSize)} · analysed {fmtDateTime(profile.createdAt)} in {(profile.durationMs / 1000).toFixed(1)} s
          </p>
        </div>
        {[
          ["Pages", `${profile.pageCount}`, `${profile.pages.length} measured`],
          ["Trim", `${profile.trim.width} × ${profile.trim.height} mm`, profile.trimSource === "trimbox" ? "from TrimBox" : "page box (no TrimBox)"],
          ["Bleed", profile.bleed ? `${profile.bleed} mm` : "—", profile.bleedSource === "bleedbox" ? "from BleedBox" : profile.bleedSource === "default" ? "estimated" : "not specified"],
          ["Body type", `${profile.body.size}/${profile.body.leading} pt`, profile.body.font],
        ].map(([k, v, sub]) => (
          <div key={k} className="min-w-[120px]">
            <p className="text-[11.5px] text-muted">{k}</p>
            <p className="text-[14px] font-semibold text-ink tabular-nums">{v}</p>
            <p className="max-w-[160px] truncate text-[11.5px] text-muted" title={sub}>{sub}</p>
          </div>
        ))}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Delete this analysis"
          onClick={() => {
            useStore.getState().deleteReference(profile.id);
            router.replace("/create", { scroll: false });
          }}
        >
          <Trash2 />
        </Button>
      </Card>

      {profile.notes.length > 0 && (
        <div className="flex gap-2.5 rounded-lg border border-[#e1e6ee] bg-info-50 px-4 py-3 text-[12.5px] text-info">
          <Info className="mt-0.5 size-4 shrink-0" />
          <ul className="space-y-0.5">
            {profile.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Style DNA */}
      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-4">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Ruler className="size-4 text-muted" /> Page & grid</span>} />
          <div className="flex gap-4 p-5">
            <GridDiagram profile={profile} />
            <dl className="min-w-0 flex-1 space-y-1.5 text-[12.5px]">
              {[
                ["Margins", `T ${profile.margins.top} · B ${profile.margins.bottom}`],
                ["", `In ${profile.margins.inside} · Out ${profile.margins.outside} mm`],
                ["Columns", `${profile.columns}`],
                ["Gutter", `${profile.gutter} mm`],
                ["Alignment", profile.body.align === "justify" ? "Justified" : "Ragged right"],
              ].map(([k, v], i) => (
                <div key={i} className="flex justify-between gap-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-medium text-ink tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Card>

        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Type className="size-4 text-muted" /> Typography</span>} />
          <div className="space-y-3 p-5">
            {[
              ["Headline", profile.headline],
              ["Deck", profile.deck],
              ["Body", profile.body],
              ["Caption", profile.caption],
            ].map(([k, v]) =>
              v && typeof v === "object" ? (
                <div key={k as string} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                  <span className="w-16 shrink-0 text-muted">{k as string}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-ink" title={v.font}>{v.font}</span>
                  <span className="text-ink-2 tabular-nums">{v.size}pt</span>
                </div>
              ) : null,
            )}
            <div className="border-t border-line pt-3">
              <p className="mb-1.5 text-[11.5px] font-medium text-muted">Type scale (share of characters)</p>
              {profile.typeScale.slice(0, 7).map((t) => (
                <div key={t.size} className="flex items-center gap-2 text-[11.5px]" title={t.sample}>
                  <span className="w-11 text-right text-muted tabular-nums">{t.size}pt</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#eceff3]">
                    <span className="block h-full rounded-full bg-brand/70" style={{ width: `${Math.min(100, t.share)}%` }} />
                  </span>
                  <span className="w-10 text-ink-2 tabular-nums">{t.share}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Palette className="size-4 text-muted" /> Colour & fonts</span>} />
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap gap-2">
              {profile.palette.length ? (
                profile.palette.map((c) => (
                  <div key={c} className="text-center">
                    <span className="block size-10 rounded-md border border-black/5 shadow-sm" style={{ background: c }} />
                    <span className="mt-1 block font-mono text-[10.5px] text-muted">{c}</span>
                  </div>
                ))
              ) : (
                <p className="text-[12.5px] text-muted">No distinct accent colours found.</p>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-[11.5px] font-medium text-muted">Fonts in use → closest available</p>
              <ul className="space-y-1 text-[12px]">
                {profile.fonts.slice(0, 6).map((f) => (
                  <li key={f.name} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-ink" title={f.name}>{f.name}</span>
                    <span className="text-muted tabular-nums">{f.share}%</span>
                    <ArrowRight className="size-3 text-faint" />
                    <span className="w-[108px] truncate text-ink-2">{f.substitute}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><LayoutTemplate className="size-4 text-muted" /> Structure</span>} />
          <div className="space-y-4 p-5">
            <div>
              <p className="mb-1.5 text-[11.5px] font-medium text-muted">Page mix (measured pages)</p>
              <div className="flex h-3 overflow-hidden rounded-full">
                {mix.map(([t, n]) => (
                  <span key={t} title={`${REF_TYPE_LABELS[t]}: ${n}`} style={{ width: `${(n / profile.pages.length) * 100}%`, background: TYPE_TONE[t] }} />
                ))}
              </div>
              <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[12px]">
                {mix.map(([t, n]) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: TYPE_TONE[t] }} />
                    <span className="text-ink-2">{REF_TYPE_LABELS[t]}</span>
                    <span className="ml-auto text-muted tabular-nums">{n}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1.5 text-[11.5px] font-medium text-muted">Sections (from running heads)</p>
              {profile.sections.length ? (
                <ul className="space-y-0.5 text-[12px]">
                  {profile.sections.slice(0, 7).map((s, i) => (
                    <li key={s.name} className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: profile.palette[i % Math.max(1, profile.palette.length)] ?? "#2453c4" }} />
                      <span className="min-w-0 flex-1 truncate text-ink-2">{s.name}</span>
                      <span className="text-muted tabular-nums">p. {s.pages.slice(0, 4).join(", ")}{s.pages.length > 4 ? "…" : ""}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12px] text-muted">No repeating running heads found.</p>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Page map */}
      <Card>
        <CardHeader
          title="Page map"
          description="Every measured page with its detected type. Click a page to see what was found and correct the type if needed."
          actions={<SimLabel>Heuristic classification</SimLabel>}
        />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-x-3 gap-y-4 p-5">
          {profile.pages.map((p) => (
            <button key={p.number} onClick={() => setDetail(p)} className="group text-left" aria-label={`Reference page ${p.number}: ${REF_TYPE_LABELS[p.type]}`}>
              <div className="relative overflow-hidden rounded-sm border border-line shadow-card transition group-hover:-translate-y-0.5 group-hover:shadow-pop" style={{ aspectRatio: `${profile.trim.width} / ${profile.trim.height}` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.thumb && <img src={p.thumb} alt="" className="size-full object-cover" />}
                {p.type !== p.detectedType && <span className="absolute top-1 right-1 rounded bg-white/90 px-1 text-[9.5px] font-semibold text-brand">edited</span>}
              </div>
              <div className="mt-1.5 flex items-center gap-1 text-[11px]">
                <span className="font-semibold text-ink-2">{p.number}</span>
                <span className="ml-auto truncate rounded px-1 py-px font-medium text-white" style={{ background: TYPE_TONE[p.type] }}>
                  {REF_TYPE_LABELS[p.type]}
                </span>
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* Layout models */}
      <Card>
        <CardHeader
          title="Layouts to recreate"
          description="For each page type, a model page from the reference is measured and turned into an editable template. Previews are set with sample content from the Content Library."
        />
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          {kinds.length === 0 && <p className="text-[13px] text-muted">No article, interview, message or opener pages were detected. Correct page types in the page map to add models.</p>}
          {kinds.map((k) => (
            <ModelCard key={k} profile={profile} kind={k} model={models[k]} onModel={(n) => setModels((m) => ({ ...m, [k]: n }))} />
          ))}
        </div>
      </Card>

      <CreatePanel profile={profile} models={models} />

      {detail && <PageDetail profile={profile} page={detail} onClose={() => setDetail(null)} onType={(t) => setType(detail.number, t)} />}
    </div>
  );
}

/* --------------------------------------------------------------- parts */

function GridDiagram({ profile }: { profile: ReferenceProfile }) {
  const { width: W, height: H } = profile.trim;
  const m = profile.margins;
  const live = W - m.inside - m.outside;
  const cols = Math.max(1, profile.columns);
  const cw = (live - profile.gutter * (cols - 1)) / cols;
  return (
    <svg viewBox={`${-6} ${-6} ${W + 12} ${H + 12}`} className="w-[92px] shrink-0" role="img" aria-label="Page grid diagram (right-hand page)">
      <rect x={-4} y={-4} width={W + 8} height={H + 8} fill="none" stroke="#e57373" strokeDasharray="3 2" strokeWidth={0.8} />
      <rect x={0} y={0} width={W} height={H} fill="#fff" stroke="#cfd4dc" strokeWidth={1} />
      {Array.from({ length: cols }).map((_, i) => (
        <rect key={i} x={m.inside + i * (cw + profile.gutter)} y={m.top} width={cw} height={H - m.top - m.bottom} fill="rgba(36,83,196,.12)" stroke="rgba(36,83,196,.5)" strokeWidth={0.6} />
      ))}
    </svg>
  );
}

function sampleFor(kind: RefPageType, articles: Article[]) {
  const pref: Record<string, string> = { interview: "art-int-mahadigital", message: "art-msg-secretary", "feature-opener": "art-cover-ai-state", article: "art-agri-ai" };
  return articles.find((a) => a.id === pref[kind]) ?? articles.find((a) => (kind === "interview" ? a.contentType === "interview" : kind === "message" ? a.contentType === "leadership-message" : a.contentType === "feature") && a.imageIds.length);
}

function ModelCard({ profile, kind, model, onModel }: { profile: ReferenceProfile; kind: RefPageType; model?: number; onModel: (n: number) => void }) {
  const articles = useStore((s) => s.articles);
  const settings = useStore((s) => s.settings);
  const uploads = useStore((s) => s.uploads);
  const pub = usePublication();
  const fontsVersion = useFonts((f) => f.version);
  const candidates = profile.pages.filter((p) => p.type === kind);
  const m = useMemo(() => modelTemplate(profile, kind, model, `preview-${profile.id}-${kind}`), [profile, kind, model]);
  const sample = sampleFor(kind, articles);
  const W = profile.trim.width * PX_PER_MM;
  const H = profile.trim.height * PX_PER_MM;
  const width = 200;
  const s = width / W;
  const rendered = useMemo(() => {
    const page: Page = {
      id: "preview-page",
      publicationId: pub.id,
      number: model ?? 7,
      pageType: m.template.pageType,
      title: "Preview",
      sectionId: houseSections[1].id,
      templateId: m.template.id,
      articleId: sample?.id,
      status: "draft",
      contentOverrides: {},
      imageOverrides: {},
      frameOverrides: {},
      updatedAt: "",
    };
    const previewPub = { ...pub, trim: profile.trim, sections: houseSections.map((x) => ({ ...x, color: profile.palette[0] ?? x.color })) };
    const ctx = makeContext(previewPub, [page], articles, [m.template], settings, fontsVersion);
    return { ctx, r: resolvePage(ctx, page) };
  }, [m.template, sample, articles, settings, fontsVersion, pub, profile, model]);
  const ref = model ? profile.previews[model] ?? profile.pages.find((p) => p.number === model)?.thumb : undefined;

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-[14px] font-semibold text-ink">{REF_TYPE_LABELS[kind]}</p>
        <Badge tone={m.derived ? "ok" : "warn"}>{m.derived ? "Geometry measured" : "Adapted house template"}</Badge>
        <label className="ml-auto flex items-center gap-1.5 text-[12px] text-muted">
          Model page
          <Select aria-label={`Model page for ${REF_TYPE_LABELS[kind]}`} value={model ?? ""} onChange={(e) => onModel(Number(e.target.value))} className="h-7 w-[86px] text-[12px]">
            {candidates.map((p) => (
              <option key={p.number} value={p.number}>
                p. {p.number}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <div className="flex items-start justify-center gap-4 bg-[#eef0f3] p-3">
        <figure className="text-center">
          <div className="overflow-hidden bg-white shadow-card" style={{ width, height: H * s }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {ref ? <img src={ref} alt={`Reference page ${model}`} className="size-full object-cover" /> : null}
          </div>
          <figcaption className="mt-1.5 text-[11.5px] text-muted">Reference p. {model}</figcaption>
        </figure>
        <ArrowRight className="mt-[120px] size-4 shrink-0 text-faint" />
        <figure className="text-center">
          <div className="overflow-hidden bg-white shadow-card" style={{ width, height: H * s }}>
            <div style={{ transform: `scale(${s})`, transformOrigin: "0 0", width: W, height: H, pointerEvents: "none" }}>
              <PageRenderer r={rendered.r} ctx={rendered.ctx} uploads={uploads} mode="preview" />
            </div>
          </div>
          <figcaption className="mt-1.5 text-[11.5px] text-muted">Generated template · sample content</figcaption>
        </figure>
      </div>
      <div className="mt-3 flex items-start gap-3">
        <TemplateWireframe template={m.template} className="w-10 shrink-0 rounded-sm border border-line" />
        <p className="text-[12px] text-ink-2">{m.derived ? m.notes.join(" · ") : `${m.notes[0]} — the house ${REF_TYPE_LABELS[kind].toLowerCase()} template is rescaled to ${profile.trim.width} × ${profile.trim.height} mm and set in the reference body style. Try another model page.`}</p>
      </div>
    </div>
  );
}

function PageDetail({ profile, page, onClose, onType }: { profile: ReferenceProfile; page: RefPage; onClose: () => void; onType: (t: RefPageType) => void }) {
  const img = profile.previews[page.number] ?? page.thumb;
  const { width: W, height: H } = profile.trim;
  const body = profile.body.size;
  const box = (r: { x: number; y: number; w: number; h: number }) => ({ left: `${(r.x / W) * 100}%`, top: `${(r.y / H) * 100}%`, width: `${(r.w / W) * 100}%`, height: `${(r.h / H) * 100}%` });
  const kind = (b: RefPage["blocks"][number]) => (isFurniture(b, body, H) ? "furniture" : b.size >= body * 1.6 ? "display" : Math.abs(b.size - body) <= body * 0.13 ? "body" : b.size < body ? "small" : "mid");
  const colors = { furniture: "#98a0ae", display: "#6b3fa0", body: "#2453c4", small: "#0f766e", mid: "#c2410c" };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} width="max-w-4xl" title={`Reference page ${page.number}`} description="Boxes show what was measured: text blocks by size class and image placements.">
      <div className="flex gap-6 max-md:flex-col">
        <div className="relative w-[340px] shrink-0 overflow-hidden border border-line bg-white" style={{ aspectRatio: `${W} / ${H}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {img && <img src={img} alt="" className="absolute inset-0 size-full object-cover opacity-70" />}
          {page.images.map((r, i) => (
            <div key={`i${i}`} className="absolute" style={{ ...box(r), outline: "1.5px solid #e07b24", background: "rgba(224,123,36,.08)" }} />
          ))}
          {page.blocks.map((b, i) => (
            <div key={i} title={`${b.size}pt ${b.font} — ${b.text}`} className="absolute" style={{ ...box(b), outline: `1px solid ${colors[kind(b)]}`, background: `${colors[kind(b)]}14` }} />
          ))}
        </div>
        <div className="min-w-0 flex-1 space-y-4 text-[13px]">
          <Field label="Page type" htmlFor="ref-type" hint={`Detected: ${REF_TYPE_LABELS[page.detectedType]} (${Math.round(page.confidence * 100)}% confidence)`}>
            <Select id="ref-type" value={page.type} onChange={(e) => onType(e.target.value as RefPageType)}>
              {(Object.keys(REF_TYPE_LABELS) as RefPageType[]).map((t) => (
                <option key={t} value={t}>
                  {REF_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <p className="mb-1 text-[12px] font-medium text-muted">Why</p>
            <ul className="space-y-0.5 text-ink-2">
              {page.reasons.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
            {[
              ["Running head", page.runningHead ?? "—"],
              ["Columns", String(page.columns)],
              ["Text blocks", String(page.blocks.length)],
              ["Images", String(page.images.length)],
              ["Body characters", page.bodyChars.toLocaleString()],
              ["Image coverage", `${Math.round(page.imageCoverage * 100)}%`],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted">{k}</dt>
                <dd className="font-medium text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-muted">
            {Object.entries({ Display: colors.display, Body: colors.body, Mid: colors.mid, Small: colors.small, Furniture: colors.furniture, Image: "#e07b24" }).map(([k, c]) => (
              <span key={k} className="flex items-center gap-1">
                <span className="size-2.5 rounded-sm border" style={{ borderColor: c, background: `${c}22` }} /> {k}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function CreatePanel({ profile, models }: { profile: ReferenceProfile; models: Partial<Record<RefPageType, number>> }) {
  const router = useRouter();
  const articles = useStore((s) => s.articles);
  const settings = useStore((s) => s.settings);
  const [title, setTitle] = useState("TechMahaImpact");
  const [issue, setIssue] = useState("June 2026");
  const [pages, setPages] = useState(16);
  const [fill, setFill] = useState(true);
  const [ads, setAds] = useState(true);
  const valid = pages >= 4 && pages <= 64 && pages % 4 === 0;
  const opts = { title, issueLabel: issue, pageCount: pages, fill, includeAds: ads, models };
  const plan = useMemo(() => (valid ? buildFromReference(profile, articles, settings, opts) : null), [profile, articles, settings, valid, title, issue, pages, fill, ads, models]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = () => {
    const res = buildFromReference(profile, articles, settings, opts);
    useStore.getState().importBuild(res);
    useStore.getState().log({ kind: "layout", message: `Publication created like “${profile.name}”: ${res.publication.title} — ${res.publication.issueLabel} (${res.pages.length} pages, ${res.templates.length} templates)`, actor: "PressFlow (Create Like This)", tone: "success" });
    toast("success", "Publication created", `${res.pages.length} pages in the reference style. Review them in the workspace.`);
    router.push(routes.publication(res.publication.id));
  };
  const saveTemplates = () => {
    const res = buildFromReference(profile, articles, settings, opts);
    useStore.setState((s) => ({ templates: [...s.templates.filter((t) => !res.templates.some((n) => n.id === t.id)), ...res.templates] }));
    toast("success", `${res.templates.length} templates saved`, `Sized ${profile.trim.width} × ${profile.trim.height} mm — find them in Templates.`);
  };

  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><WandSparkles className="size-4 text-brand" /> Create a similar publication</span>} description="Builds templates in the reference style and a page plan that follows the reference's running order." />
      <div className="grid gap-6 p-5 lg:grid-cols-[340px_1fr]">
        <div className="space-y-3">
          <Field label="Publication title" htmlFor="cl-title">
            <Input id="cl-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Issue" htmlFor="cl-issue">
              <Input id="cl-issue" value={issue} onChange={(e) => setIssue(e.target.value)} />
            </Field>
            <Field label="Pages" htmlFor="cl-pages" hint={valid ? undefined : <span className="text-err">Multiple of 4, 4–64</span>}>
              <Input id="cl-pages" type="number" min={4} max={64} step={4} value={pages} onChange={(e) => setPages(Number(e.target.value))} />
            </Field>
          </div>
          <label className="flex items-start gap-3 text-[13px]">
            <Switch checked={fill} onCheckedChange={setFill} label="Fill with library content" />
            <span>
              <span className="block font-medium text-ink">Fill with Content Library articles</span>
              <span className="text-[12px] text-muted">Best-fitting unused article per page type. Off = empty planned pages.</span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-[13px]">
            <Switch checked={ads} onCheckedChange={setAds} label="Keep advertisement slots" />
            <span>
              <span className="block font-medium text-ink">Keep advertisement slots</span>
              <span className="text-[12px] text-muted">Where the reference has ads, place sample ads.</span>
            </span>
          </label>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="primary" disabled={!valid} onClick={create}>
              <WandSparkles /> Create publication
            </Button>
            <Button disabled={!valid} onClick={saveTemplates}>
              <Save /> Save templates only
            </Button>
          </div>
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-[12.5px] font-medium text-ink-2">Page plan preview</p>
          {plan ? (
            <>
              <ol className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-2">
                {plan.pages.map((p) => {
                  const t = plan.templates.find((x) => x.id === p.templateId);
                  return (
                    <li key={p.id} className={cn("rounded-lg border px-2.5 py-2", p.status === "planned" ? "border-dashed border-line-strong bg-canvas" : "border-line")}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-semibold text-ink tabular-nums">{p.number}</span>
                        <span className="truncate text-[11px] text-muted">{t?.name.replace(/ — (adapted|from p\.\d+)$/, "")}</span>
                        {t?.derivation === "geometry" && <CheckCircle2 className="ml-auto size-3 shrink-0 text-ok" aria-label="Measured geometry" />}
                      </div>
                      <p className="mt-0.5 truncate text-[12px] text-ink-2" title={p.title}>{p.articleId ? articles.find((a) => a.id === p.articleId)?.title : p.title}</p>
                    </li>
                  );
                })}
              </ol>
              <ul className="mt-3 space-y-0.5 text-[12px] text-muted">
                {plan.report.map((r) => (
                  <li key={r}>• {r}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-[12.5px] text-muted">Choose a page count that is a multiple of 4.</p>
          )}
        </div>
      </div>
    </Card>
  );
}
