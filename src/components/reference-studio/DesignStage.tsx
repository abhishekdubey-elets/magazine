"use client";

import { ArrowRight, CheckCircle2, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { PageRenderer } from "@/components/page/PageRenderer";
import { PageDetail } from "@/components/create/ReferenceReport";
import { TemplateWireframe } from "@/components/page/TemplateWireframe";
import { toast } from "@/components/shell/toast";
import { Badge, Button, Card, CardHeader, cn, Field, Input, Select } from "@/components/ui";
import { sections as houseSections } from "@/data/seed";
import { PX_PER_MM } from "@/lib/design-tokens";
import { useFonts, usePublication } from "@/lib/hooks";
import { makeContext, resolvePage } from "@/lib/layout-engine";
import { buildFormatTemplates, FORMAT_CONTENT } from "@/lib/reference/formats";
import { applySpec, confirmFinding, confirmSpec, deriveDesignSpec, FORMAT_LABEL, FORMATS, getFinding, lowConfidenceFindings } from "@/lib/reference/spec";
import { useStore } from "@/lib/store";
import { useCan, useWorkspace } from "@/lib/sync/engine";
import type { DesignSpec, EditorialFormat, Finding, FontRole, FurnitureSpec, Page, ReferenceProfile, RefPage, Template, TypeSpec } from "@/lib/types";
import { PDF_PRESETS } from "@/services/indesign";
import { FindingCard } from "./findings";
import { useStudio } from "./studio-state";

const ROLES: FontRole[] = ["body", "headline", "display", "serif", "sans"];

/** Stage C — review, correct and confirm the design system; see the six format templates it produces. */
export function DesignStage({ profile }: { profile: ReferenceProfile }) {
  const spec = profile.spec ?? deriveDesignSpec(profile);
  const canEdit = useCan("edit-templates");
  const user = useWorkspace((s) => s.user);
  const setStage = useStudio((s) => s.setStage);
  const startTimer = useStudio((s) => s.startTimer);
  const [detail, setDetail] = useState<RefPage | null>(null);
  const low = lowConfidenceFindings(spec);
  const actor = user?.name ?? "Editor";

  const save = (next: DesignSpec) => useStore.getState().updateReference(profile.id, { ...applySpec(profile, next), spec: next });
  const set = (path: string, value: unknown) => save(confirmFinding(spec, path, value, actor));
  const confirm = (path: string) => save(confirmFinding(spec, path, undefined, actor));
  const fmts = useMemo(() => buildFormatTemplates(applySpec(profile, spec), spec), [profile, spec]);

  const saveTemplates = () => {
    useStore.getState().addTemplates(fmts.templates);
    toast("success", `${fmts.templates.length} templates saved`, "Find them in Templates; they are rebuilt automatically when the spec changes.");
  };
  const confirmAll = () => {
    const next = confirmSpec(spec, actor);
    save(next);
    useStore.getState().addTemplates(buildFormatTemplates(applySpec(profile, next), next).templates);
    useStore.getState().log({ kind: "layout", message: `Design system confirmed for “${profile.name}” (v${next.version}) — ${next.review.edited.length} values corrected by hand`, tone: "success" });
    toast("success", "Design system confirmed", `Version ${next.version} is ready to plan issues.`);
    startTimer("planningMs");
  };

  const editorFor = (path: string, f: Finding<unknown>) => {
    const dis = !canEdit;
    switch (path) {
      case "page.trim": {
        const v = f.value as { width: number; height: number };
        return <Nums dis={dis} fields={[["Width", v.width], ["Height", v.height]]} onChange={([width, height]) => set(path, { width, height })} unit="mm" />;
      }
      case "page.bleed":
      case "page.gutter":
        return <Nums dis={dis} fields={[["mm", f.value as number]]} onChange={([v]) => set(path, v)} step={0.5} />;
      case "page.columns":
        return <Nums dis={dis} fields={[["Columns", f.value as number]]} onChange={([v]) => set(path, Math.max(1, Math.round(v)))} step={1} />;
      case "page.margins": {
        const m = f.value as { top: number; bottom: number; inside: number; outside: number };
        return <Nums dis={dis} fields={[["Top", m.top], ["Bottom", m.bottom], ["Inside", m.inside], ["Outside", m.outside]]} onChange={([top, bottom, inside, outside]) => set(path, { top, bottom, inside, outside })} unit="mm" step={0.5} />;
      }
      case "page.furniture": {
        const v = f.value as FurnitureSpec;
        return (
          <div className="grid grid-cols-2 gap-2">
            <Select aria-label="Running head position" disabled={dis} value={v.runningHead} onChange={(e) => set(path, { ...v, runningHead: e.target.value })} className="h-8 text-[12px]">
              {["top-outside", "top-inside", "top-center", "none"].map((o) => <option key={o} value={o}>Running head: {o}</option>)}
            </Select>
            <Select aria-label="Folio position" disabled={dis} value={v.folio} onChange={(e) => set(path, { ...v, folio: e.target.value })} className="h-8 text-[12px]">
              {["bottom-outside", "bottom-center", "bottom-inside", "none"].map((o) => <option key={o} value={o}>Folio: {o}</option>)}
            </Select>
          </div>
        );
      }
      case "typography.body":
      case "typography.headline":
      case "typography.deck":
      case "typography.caption":
      case "typography.quote":
      case "typography.subheading": {
        const t = f.value as TypeSpec | null;
        const optional = path !== "typography.body" && path !== "typography.headline";
        if (!t) {
          return (
            <Button size="sm" variant="secondary" disabled={dis} onClick={() => set(path, { font: spec.typography.body.value.font, role: spec.typography.body.value.role, size: 12, leading: 15, weight: 700, align: "left" })}>
              Define this style
            </Button>
          );
        }
        return (
          <div className="grid grid-cols-[1fr_96px] gap-2">
            <Input aria-label="Font name" disabled={dis} defaultValue={t.font} onBlur={(e) => e.target.value !== t.font && set(path, { ...t, font: e.target.value })} className="h-8 text-[12px]" />
            <Select aria-label="Role" disabled={dis} value={t.role} onChange={(e) => set(path, { ...t, role: e.target.value as FontRole })} className="h-8 text-[12px]">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
            <Nums dis={dis} fields={[["Size", t.size], ["Leading", t.leading], ["Weight", t.weight]]} onChange={([size, leading, weight]) => set(path, { ...t, size, leading, weight: Math.round(weight) })} unit="pt" step={0.5} />
            <Select aria-label="Alignment" disabled={dis} value={t.align ?? "left"} onChange={(e) => set(path, { ...t, align: e.target.value })} className="h-8 text-[12px]">
              {["left", "justify", "center", "right"].map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
            {optional && (
              <Button size="sm" variant="ghost" disabled={dis} className="col-span-2 justify-self-start" onClick={() => set(path, null)}>
                Use house style instead
              </Button>
            )}
          </div>
        );
      }
      case "identity.palette": {
        const colors = f.value as string[];
        return (
          <div className="flex flex-wrap items-center gap-2">
            {colors.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                <input type="color" aria-label={`Colour ${i + 1}`} disabled={dis} value={c} onChange={(e) => set(path, colors.map((x, k) => (k === i ? e.target.value : x)))} className="size-7 cursor-pointer rounded border border-line" />
                <button className="text-[11px] text-muted hover:text-err" disabled={dis || colors.length <= 1} onClick={() => set(path, colors.filter((_, k) => k !== i))} aria-label="Remove colour">×</button>
              </span>
            ))}
            <Button size="sm" variant="ghost" disabled={dis || colors.length >= 8} onClick={() => set(path, [...colors, "#1f4ea1"])}>+ Add</Button>
          </div>
        );
      }
      case "identity.accent":
        return <input type="color" aria-label="Accent colour" disabled={dis} value={f.value as string} onChange={(e) => set(path, e.target.value)} className="size-8 cursor-pointer rounded border border-line" />;
      case "identity.logoPlacement":
        return (
          <Select aria-label="Logo placement" disabled={dis} value={f.value as string} onChange={(e) => set(path, e.target.value)} className="h-8 w-40 text-[12px]">
            {["top-left", "top-center", "top-right", "none"].map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
        );
      case "images.density":
        return (
          <Select aria-label="Image density" disabled={dis} value={f.value as string} onChange={(e) => set(path, e.target.value)} className="h-8 w-40 text-[12px]">
            {["sparse", "balanced", "dense"].map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
        );
      case "structure.sections": {
        const secs = f.value as { name: string; pages: number[] }[];
        return (
          <div className="space-y-1">
            {secs.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input aria-label={`Section ${i + 1}`} disabled={dis} defaultValue={s.name} onBlur={(e) => e.target.value !== s.name && set(path, secs.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} className="h-8 text-[12px]" />
                <button className="text-[11px] text-muted hover:text-err" disabled={dis} onClick={() => set(path, secs.filter((_, k) => k !== i))} aria-label="Remove section">×</button>
              </div>
            ))}
            <Button size="sm" variant="ghost" disabled={dis} onClick={() => set(path, [...secs, { name: "New section", pages: [] }])}>+ Add section</Button>
          </div>
        );
      }
      default:
        return undefined;
    }
  };

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center gap-3 px-5 py-4">
        <div className="min-w-[260px] flex-1">
          <p className="text-[15px] font-semibold text-ink">Design system — {profile.name}</p>
          <p className="text-[12.5px] text-muted">
            Version {spec.version} · {spec.review.status === "confirmed" ? `confirmed by ${spec.review.confirmedBy ?? "an editor"}` : "draft"} · {spec.review.edited.length} value{spec.review.edited.length === 1 ? "" : "s"} corrected by hand · saved {spec.review.status === "confirmed" ? "and reusable for every issue" : "with the reference"}
          </p>
        </div>
        <Button variant="secondary" onClick={saveTemplates}>
          <Save /> Save templates to library
        </Button>
        <Button variant={spec.review.status === "confirmed" ? "secondary" : "primary"} disabled={!canEdit} onClick={confirmAll}>
          <ShieldCheck /> {spec.review.status === "confirmed" ? "Re-confirm design system" : "Confirm design system"}
        </Button>
        <Button variant={spec.review.status === "confirmed" ? "primary" : "secondary"} onClick={() => { startTimer("planningMs"); setStage("plan"); }}>
          Plan a new issue <ArrowRight />
        </Button>
      </Card>

      {low.length > 0 && (
        <div className="rounded-lg border border-[#f4dcb9] bg-warn-50 px-4 py-3 text-[12.5px] text-warn">
          <p className="font-semibold">{low.length} estimate{low.length > 1 ? "s" : ""} to confirm</p>
          <p className="mt-0.5">{low.map((l) => l.label).join(", ")} could not be measured reliably. Check the values below and confirm or correct them before generating an issue.</p>
        </div>
      )}
      {!canEdit && <p className="rounded-lg border border-line bg-white px-4 py-3 text-[12.5px] text-ink-2">Designers and admins edit and confirm design systems; you can review the values.</p>}

      {[
        ["Document geometry", ["page.trim", "page.bleed", "page.margins", "page.columns", "page.gutter", "page.furniture"]],
        ["Typography", ["typography.headline", "typography.deck", "typography.body", "typography.subheading", "typography.caption", "typography.quote"]],
        ["Visual identity & images", ["identity.palette", "identity.accent", "identity.logoPlacement", "images.aspectRatios", "images.fullBleedShare", "images.density"]],
        ["Editorial structure", ["structure.sections"]],
      ].map(([title, paths]) => (
        <Card key={title as string}>
          <CardHeader title={title as string} />
          <div className="grid gap-3 p-5 md:grid-cols-2 2xl:grid-cols-3">
            {(paths as string[]).map((path) => {
              const f = getFinding(spec, path);
              return f ? <FindingCard key={path} path={path} finding={f} canEdit={canEdit} editor={editorFor(path, f)} onConfirm={() => confirm(path)} onEvidence={(n) => setDetail(profile.pages.find((p) => p.number === n) ?? null)} /> : null;
            })}
          </div>
        </Card>
      ))}

      <Card>
        <CardHeader title="Print production settings" description="Used by the InDesign build and the print gates for issues made from this design system." />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <Field label="PDF export preset" htmlFor="ds-preset">
            <Select id="ds-preset" disabled={!canEdit} value={spec.print.pdfPreset} onChange={(e) => save({ ...spec, print: { ...spec.print, pdfPreset: e.target.value }, version: spec.version + 1, updatedAt: new Date().toISOString() })}>
              {PDF_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="Minimum image resolution (ppi)" htmlFor="ds-min" hint="Below this a print build is blocked.">
            <Input id="ds-min" type="number" disabled={!canEdit} defaultValue={spec.print.minPpi} onBlur={(e) => save({ ...spec, print: { ...spec.print, minPpi: Number(e.target.value) || 200 }, version: spec.version + 1, updatedAt: new Date().toISOString() })} />
          </Field>
          <Field label="Target image resolution (ppi)" htmlFor="ds-target" hint="Below this images are flagged for review.">
            <Input id="ds-target" type="number" disabled={!canEdit} defaultValue={spec.print.targetPpi} onBlur={(e) => save({ ...spec, print: { ...spec.print, targetPpi: Number(e.target.value) || 300 }, version: spec.version + 1, updatedAt: new Date().toISOString() })} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Reusable templates for the six editorial formats"
          description="Styled from this design system and sized to the reference trim. Previews use sample content from the Content Library; measured layouts reproduce the reference page, adapted and inferred ones use the house template."
          actions={<Button size="sm" variant="ghost" onClick={() => toast("info", "Templates rebuild automatically", "They follow the design spec; save them to the library to edit them in Templates.")}><RefreshCw /> Rebuilt from v{spec.version}</Button>}
        />
        <div className="grid gap-4 p-5 md:grid-cols-2 2xl:grid-cols-3">
          {FORMATS.map((format) => (
            <FormatPreview key={format} format={format} template={fmts.byFormat[format]} profile={profile} />
          ))}
        </div>
      </Card>

      {detail && <PageDetail profile={profile} page={detail} onClose={() => setDetail(null)} onType={() => undefined} />}
    </div>
  );
}

function Nums({ fields, onChange, unit, step = 0.5, dis }: { fields: [string, number][]; onChange: (values: number[]) => void; unit?: string; step?: number; dis?: boolean }) {
  const [draft, setDraft] = useState<Record<number, string>>({});
  return (
    <div className="flex flex-wrap gap-2">
      {fields.map(([label, value], i) => (
        <label key={label} className="flex items-center gap-1 text-[11.5px] text-muted">
          {label}
          <input
            type="number"
            step={step}
            disabled={dis}
            aria-label={`${label}${unit ? ` (${unit})` : ""}`}
            value={draft[i] ?? String(value)}
            onChange={(e) => setDraft((d) => ({ ...d, [i]: e.target.value }))}
            onBlur={() => {
              const next = fields.map(([, v], k) => (draft[k] !== undefined ? Number(draft[k]) : v));
              setDraft({});
              if (next.some((v, k) => v !== fields[k][1] && !Number.isNaN(v))) onChange(next.map((v, k) => (Number.isNaN(v) ? fields[k][1] : v)));
            }}
            className="h-8 w-[68px] rounded-md border border-line px-2 text-[12px] text-ink tabular-nums focus:border-brand focus:outline-none disabled:opacity-60"
          />
        </label>
      ))}
    </div>
  );
}

/** One format template rendered with a sample article in the reference style. */
function FormatPreview({ format, template, profile }: { format: EditorialFormat; template: Template; profile: ReferenceProfile }) {
  const articles = useStore((s) => s.articles);
  const settings = useStore((s) => s.settings);
  const uploads = useStore((s) => s.uploads);
  const pub = usePublication();
  const fontsVersion = useFonts((f) => f.version);
  const sample = useMemo(() => {
    const types = FORMAT_CONTENT[format];
    return [...articles].filter((a) => types.includes(a.contentType)).sort((a, b) => b.imageIds.length - a.imageIds.length || b.body.length - a.body.length)[0];
  }, [articles, format]);
  const briefs = useMemo(() => (format === "news-page" ? articles.filter((a) => a.contentType === "news-report" && a.id !== sample?.id).slice(0, 4).map((a) => a.id) : undefined), [articles, format, sample]);
  const W = profile.trim.width * PX_PER_MM;
  const H = profile.trim.height * PX_PER_MM;
  const width = 190;
  const s = width / W;
  const rendered = useMemo(() => {
    if (!pub) return null;
    const page: Page = { id: `preview-${format}`, publicationId: pub.id, number: 7, pageType: template.pageType, title: "Preview", sectionId: houseSections[1].id, templateId: template.id, articleId: sample?.id, storyIds: briefs, status: "draft", contentOverrides: {}, imageOverrides: {}, frameOverrides: {}, updatedAt: "" };
    const previewPub = { ...pub, trim: profile.trim, sections: houseSections.map((x) => ({ ...x, color: profile.spec?.identity.accent.value ?? x.color })) };
    const ctx = makeContext(previewPub, [page], articles, [template], settings, fontsVersion);
    return { ctx, r: resolvePage(ctx, page) };
  }, [pub, format, template, sample, briefs, articles, settings, fontsVersion, profile]);
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-[13px] font-semibold text-ink">{FORMAT_LABEL[format]}</p>
        <Badge tone={template.derivation === "geometry" ? "ok" : /inferred/.test(template.name) ? "warn" : "brand"}>{template.derivation === "geometry" ? `Measured from p.${template.sourcePage}` : /inferred/.test(template.name) ? "Inferred layout" : "Adapted house template"}</Badge>
        <span className="ml-auto text-[11px] text-muted">fidelity {Math.round((template.fidelity ?? 0) * 100)}%</span>
      </div>
      <div className="flex items-start justify-center gap-3 bg-[#eef0f3] p-3">
        <TemplateWireframe template={template} className="w-12 shrink-0 rounded-sm border border-line bg-white" />
        <div className={cn("overflow-hidden bg-white shadow-card")} style={{ width, height: H * s }}>
          {rendered ? (
            <div style={{ transform: `scale(${s})`, transformOrigin: "0 0", width: W, height: H, pointerEvents: "none" }}>
              <PageRenderer r={rendered.r} ctx={rendered.ctx} uploads={uploads} mode="preview" />
            </div>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-[11.5px] text-ink-2">{template.description}</p>
      {!sample && <p className="mt-2 text-[11.5px] text-muted">No sample article of this type in the Content Library — the preview is empty.</p>}
      <p className="mt-2 flex items-center gap-1 text-[11px] text-muted">
        <CheckCircle2 className="size-3 text-ok" /> {template.frames.filter((f) => f.kind === "text").length} text frames · {template.frames.filter((f) => f.kind === "image").length} image frames · {template.columns} columns
      </p>
    </div>
  );
}
