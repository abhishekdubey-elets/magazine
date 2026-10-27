"use client";

import { AlertTriangle, ArrowRight, Info, LayoutTemplate, Palette, Ruler, Sparkles, Type } from "lucide-react";
import { useMemo, useState } from "react";
import { fmtBytes, fmtDateTime } from "@/components/common";
import { GridDiagram, PageDetail, TYPE_TONE } from "@/components/create/ReferenceReport";
import { toast } from "@/components/shell/toast";
import { Badge, Button, Card, CardHeader, cn, Select, SimLabel } from "@/components/ui";
import { REF_TYPE_LABELS } from "@/lib/reference/derive";
import { recognizeProfile, storedImages } from "@/lib/reference/recognize-client";
import { chooseLayoutModel, deriveDesignSpec, FORMAT_LABEL, FORMATS, getFinding, rederiveSpec } from "@/lib/reference/spec";
import { useStore } from "@/lib/store";
import { useCan, useWorkspace } from "@/lib/sync/engine";
import type { ReferenceProfile, RefPage, RefPageType } from "@/lib/types";
import { FindingCard } from "./findings";
import { useStudio } from "./studio-state";

const GROUPS: { title: string; icon: React.ReactNode; paths: string[] }[] = [
  { title: "Document geometry", icon: <Ruler className="size-4 text-muted" />, paths: ["page.trim", "page.bleed", "page.margins", "page.columns", "page.gutter", "page.furniture"] },
  { title: "Typography", icon: <Type className="size-4 text-muted" />, paths: ["typography.headline", "typography.deck", "typography.body", "typography.subheading", "typography.caption", "typography.quote"] },
  { title: "Visual identity & images", icon: <Palette className="size-4 text-muted" />, paths: ["identity.palette", "identity.accent", "identity.logoPlacement", "images.aspectRatios", "images.fullBleedShare", "images.density"] },
  { title: "Editorial structure", icon: <LayoutTemplate className="size-4 text-muted" />, paths: ["structure.sections"] },
];

/** Stage B — what was found in the reference, with evidence and confidence. */
export function AnalyseStage({ profile }: { profile: ReferenceProfile }) {
  const spec = profile.spec ?? deriveDesignSpec(profile);
  const canEdit = useCan("edit-references");
  const setStage = useStudio((s) => s.setStage);
  const aiProvider = useWorkspace((s) => s.setup?.ai.provider ?? null);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [detail, setDetail] = useState<RefPage | null>(null);
  const disagreements = profile.pages.filter((p) => p.ai?.disagrees);

  const rerunAi = async () => {
    setAiBusy("Starting");
    try {
      const next = await recognizeProfile(profile, storedImages(profile), { onProgress: (p) => setAiBusy(p.stage) });
      useStore.getState().updateReference(profile.id, { pages: next.pages, sections: next.sections, ai: next.ai, spec: rederiveSpec(next) });
      toast("success", "AI recognition complete", `${next.ai?.pages ?? 0} pages · ${next.ai?.disagreements.length ?? 0} differ from the rules`);
    } catch (e) {
      toast("error", "AI recognition failed", e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(null);
    }
  };
  const mix = useMemo(() => Object.entries(profile.pages.reduce<Record<string, number>>((m, p) => ((m[p.type] = (m[p.type] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]) as [RefPageType, number][], [profile.pages]);
  const open = (n: number) => {
    const p = profile.pages.find((x) => x.number === n);
    if (p) setDetail(p);
  };

  const setType = (n: number, type: RefPageType) => {
    const pages = profile.pages.map((p) => (p.number === n ? { ...p, type } : p));
    const next = { ...profile, pages };
    useStore.getState().updateReference(profile.id, { pages, spec: rederiveSpec(next) });
    setDetail((d) => (d && d.number === n ? { ...d, type } : d));
  };

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {profile.pages[0]?.thumb && <img src={profile.pages[0].thumb} alt="Reference cover" className="h-20 rounded-sm border border-line shadow-card" />}
        <div className="min-w-[240px] flex-1">
          <p className="truncate text-[16px] font-semibold text-ink">{profile.name}</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {profile.fileName} · {fmtBytes(profile.fileSize)} · {profile.pageCount} pages ({profile.pages.length} measured) · analysed {fmtDateTime(profile.createdAt)} in {(profile.durationMs / 1000).toFixed(1)} s
          </p>
        </div>
        <GridDiagram profile={profile} />
        <Badge tone={spec.review.status === "confirmed" ? "ok" : "neutral"}>Design spec v{spec.version} · {spec.review.status}</Badge>
        <Button variant="primary" onClick={() => setStage("design")}>
          Review design system <ArrowRight />
        </Button>
      </Card>

      <Card className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3">
        <Sparkles className="size-4 text-ai" />
        <div className="min-w-[260px] flex-1 text-[12.5px]">
          {profile.ai ? (
            <>
              <p className="font-semibold text-ink">
                Page types, sections and text roles recognised by {profile.ai.provider === "openai" ? "OpenAI" : "Claude"} <span className="font-normal text-muted">· {profile.ai.model} · {profile.ai.pages} pages · {fmtDateTime(profile.ai.at)}</span>
              </p>
              <p className="text-muted">
                Measurements (trim, margins, columns, type sizes, fonts, image placements) are read from the PDF and never AI-derived.{" "}
                {disagreements.length ? (
                  <span className="text-warn">
                    {disagreements.length} page{disagreements.length === 1 ? "" : "s"} where the AI and the rules disagree: {disagreements.map((p) => p.number).join(", ")} — open them in the page map to confirm.
                  </span>
                ) : (
                  "The AI and the rules agree on every page."
                )}
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-ink">Page types classified by rules</p>
              <p className="text-muted">{aiProvider ? "Run the AI recognition pass to read page types, section names and text roles from the page images (confidence shown, correctable)." : "No AI provider key is set on the server; recognition uses size and position rules."}</p>
            </>
          )}
        </div>
        {aiProvider && canEdit && (
          <Button variant="ai" size="sm" loading={!!aiBusy} onClick={() => void rerunAi()} title={profile.ai ? "Run again on the stored page previews" : "Recognise pages with the AI"}>
            {!aiBusy && <Sparkles />} {aiBusy ?? (profile.ai ? "Run AI recognition again" : "Recognise with AI")}
          </Button>
        )}
      </Card>

      {(profile.notes.length > 0 || spec.review.warnings.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
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
          {spec.review.warnings.length > 0 && (
            <div className="flex gap-2.5 rounded-lg border border-[#f4dcb9] bg-warn-50 px-4 py-3 text-[12.5px] text-warn">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <ul className="space-y-0.5">
                {spec.review.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {GROUPS.map((g) => (
        <Card key={g.title}>
          <CardHeader title={<span className="flex items-center gap-2">{g.icon} {g.title}</span>} description="Each finding shows how it was obtained, how confident the measurement is and which pages support it." />
          <div className="grid gap-3 p-5 md:grid-cols-2 2xl:grid-cols-3">
            {g.paths.map((path) => {
              const f = getFinding(spec, path);
              return f ? <FindingCard key={path} path={path} finding={f} onEvidence={open} /> : null;
            })}
          </div>
        </Card>
      ))}

      <Card>
        <CardHeader title="Fonts in the reference" description="The browser preview substitutes fonts it does not have; InDesign uses the licensed font files you upload (print builds are refused while a style is missing)." />
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] text-muted uppercase">
              <th className="px-5 py-2 font-semibold">Font</th>
              <th className="py-2 font-semibold">Share</th>
              <th className="py-2 font-semibold">Preview substitute</th>
              <th className="py-2 pr-5 font-semibold">Same family?</th>
            </tr>
          </thead>
          <tbody>
            {spec.typography.fonts.map((f) => (
              <tr key={f.name} className="border-b border-line/70">
                <td className="px-5 py-1.5 text-ink">{f.name}</td>
                <td className="py-1.5 text-muted tabular-nums">{f.share}%</td>
                <td className="py-1.5 text-ink-2">{f.substitute}</td>
                <td className="py-1.5 pr-5">{f.available ? <Badge tone="ok">Yes</Badge> : <Badge tone="warn">Substituted in preview</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <CardHeader
          title="Layout per editorial format"
          description="Which reference page models each of the six formats. Measured geometry reproduces the page; adapted and inferred layouts use the house template in the reference's style."
          actions={<SimLabel>Rule-based matching</SimLabel>}
        />
        <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
          {FORMATS.map((format) => {
            const l = spec.layouts.find((x) => x.format === format)!;
            const candidates = profile.pages.filter((p) => l.examples.includes(p.number) || p.number === l.sourcePage);
            const thumb = l.sourcePage ? profile.previews[l.sourcePage] ?? profile.pages.find((p) => p.number === l.sourcePage)?.thumb : undefined;
            return (
              <div key={format} className="flex gap-3 rounded-lg border border-line p-3">
                <div className="w-[64px] shrink-0 overflow-hidden rounded-sm border border-line bg-canvas" style={{ aspectRatio: `${profile.trim.width} / ${profile.trim.height}` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {thumb ? <img src={thumb} alt="" className="size-full object-cover" /> : <span className="grid h-full place-items-center text-[10px] text-faint">none</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
                    {FORMAT_LABEL[format]}
                    <Badge tone={l.derivation === "geometry" ? "ok" : l.derivation === "adapted" ? "brand" : "warn"}>{l.derivation === "geometry" ? "Measured" : l.derivation === "adapted" ? "Adapted" : "Inferred"}</Badge>
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-muted">{l.note}</p>
                  <label className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-muted">
                    Model page
                    <Select aria-label={`Model page for ${FORMAT_LABEL[format]}`} value={l.sourcePage ?? ""} disabled={!canEdit || !candidates.length} onChange={(e) => {
                      const next = chooseLayoutModel(profile, spec, format, Number(e.target.value));
                      useStore.getState().updateReference(profile.id, { spec: next });
                      toast("success", `${FORMAT_LABEL[format]} model set to page ${e.target.value}`);
                    }} className="h-7 w-[100px] text-[11.5px]">
                      {!candidates.length && <option value="">none</option>}
                      {candidates.map((p) => (
                        <option key={p.number} value={p.number}>
                          p. {p.number} ({REF_TYPE_LABELS[p.type]})
                        </option>
                      ))}
                    </Select>
                    {l.sourcePage && (
                      <button className="text-brand hover:underline" onClick={() => open(l.sourcePage!)}>
                        view
                      </button>
                    )}
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader title="Page map" description="Every measured page with its type. Click a page to see the measured blocks, the AI's reasons and roles, and correct the type — the design spec is rebuilt, keeping your confirmed values." actions={profile.ai ? <Badge tone="ai">AI recognised · rules compared</Badge> : <SimLabel>Heuristic classification</SimLabel>} />
        <div className="flex flex-wrap gap-3 px-5 pt-4 text-[11.5px]">
          {mix.map(([t, n]) => (
            <span key={t} className="flex items-center gap-1.5 text-ink-2">
              <span className="size-2 rounded-full" style={{ background: TYPE_TONE[t] }} /> {REF_TYPE_LABELS[t]} <span className="text-muted">{n}</span>
            </span>
          ))}
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-x-3 gap-y-4 p-5">
          {profile.pages.map((p) => (
            <button key={p.number} onClick={() => setDetail(p)} className="group text-left" aria-label={`Reference page ${p.number}: ${REF_TYPE_LABELS[p.type]}`}>
              <div className={cn("relative overflow-hidden rounded-sm border shadow-card transition group-hover:-translate-y-0.5 group-hover:shadow-pop", profile.oddSizes?.some((o) => o.number === p.number) ? "border-warn" : "border-line")} style={{ aspectRatio: `${profile.trim.width} / ${profile.trim.height}` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.thumb && <img src={p.thumb} alt="" className="size-full object-cover" />}
                {p.type !== p.detectedType && !p.ai?.adopted && <span className="absolute top-1 right-1 rounded bg-white/90 px-1 text-[9.5px] font-semibold text-brand">edited</span>}
                {p.ai?.disagrees && <span className="absolute top-1 left-1 rounded bg-warn px-1 text-[9.5px] font-semibold text-white" title={`AI: ${REF_TYPE_LABELS[p.ai.type]} (${Math.round(p.ai.confidence * 100)}%) · rules: ${REF_TYPE_LABELS[p.detectedType]}`}>differs</span>}
              </div>
              <div className="mt-1.5 flex items-center gap-1 text-[11px]">
                <span className="font-semibold text-ink-2">{p.number}</span>
                {p.ai && <span className="text-[10px] text-ai" title="AI confidence">{Math.round(p.ai.confidence * 100)}%</span>}
                <span className="ml-auto truncate rounded px-1 py-px font-medium text-white" style={{ background: TYPE_TONE[p.type] }}>
                  {REF_TYPE_LABELS[p.type]}
                </span>
              </div>
            </button>
          ))}
        </div>
      </Card>

      {detail && <PageDetail profile={profile} page={detail} onClose={() => setDetail(null)} onType={(t) => canEdit && setType(detail.number, t)} />}
    </div>
  );
}
