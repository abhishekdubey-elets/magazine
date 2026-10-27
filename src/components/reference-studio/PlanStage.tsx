"use client";

import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, FileUp, Plus, ShieldCheck, Sparkles, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ContentEditor } from "@/components/content/ContentEditor";
import { toast } from "@/components/shell/toast";
import { Badge, Button, Card, CardHeader, cn, Field, Input, Select, Switch } from "@/components/ui";
import { CONTENT_TYPE_LABELS } from "@/lib/ai";
import { useFonts } from "@/lib/hooks";
import { newPilot, recordStage } from "@/lib/pilot";
import { importDocument, ImportError } from "@/lib/reference/content-import";
import { buildFormatTemplates, formatFor } from "@/lib/reference/formats";
import { buildIssuePlan, generateIssue, planToc, templateChoices, type PlanInput } from "@/lib/reference/plan";
import { applySpec, deriveDesignSpec, FORMAT_LABEL, FORMATS } from "@/lib/reference/spec";
import { useStore } from "@/lib/store";
import { useCan, useWorkspace } from "@/lib/sync/engine";
import { countWords } from "@/lib/text-engine";
import type { EditorialFormat, PlanEntry, Publication, ReferenceProfile } from "@/lib/types";
import { useStudio } from "./studio-state";

const KIND_TONE: Record<string, "neutral" | "brand" | "ok" | "warn" | "err" | "info"> = { cover: "neutral", contents: "neutral", advertisement: "info", closing: "neutral", continuation: "brand" };

/** Stage D — pick content for a new topic and shape the issue plan before anything is generated. */
export function PlanStage({ profile, publication }: { profile: ReferenceProfile; publication?: Publication }) {
  const spec = profile.spec ?? deriveDesignSpec(profile);
  const articles = useStore((s) => s.articles);
  const templates = useStore((s) => s.templates);
  const settings = useStore((s) => s.settings);
  const user = useWorkspace((s) => s.user);
  const canApprove = useCan("approve-pages");
  const canEdit = useCan("edit-publications");
  const fontsVersion = useFonts((f) => f.version);
  const { draft, setDraft, approval, setApproval, stopTimer, pilotPages } = useStudio();
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [problems, setProblems] = useState<string[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const actor = user?.name ?? "Editor";

  // First visit: sensible defaults from the reference and the plan of an existing issue.
  useEffect(() => {
    if (draft.title) return;
    const prev = publication?.plan;
    setDraft({
      title: prev?.title ?? profile.name,
      issueLabel: prev?.issueLabel ?? "Next issue",
      topic: prev?.topic ?? "",
      pageCount: prev?.pageCount ?? Math.min(24, Math.max(8, Math.round(profile.pageCount / 4) * 4)),
      includeAds: prev?.includeAds ?? true,
      articleIds: prev?.articleIds.filter((id) => articles.some((a) => a.id === id)) ?? [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  const applied = useMemo(() => applySpec(profile, spec), [profile, spec]);
  const formats = useMemo(() => buildFormatTemplates(applied, spec), [applied, spec]);
  const input: PlanInput = useMemo(
    () => ({ profile: applied, spec, formats, templates: [...templates.filter((t) => !formats.templates.some((f) => f.id === t.id)), ...formats.templates], articles, settings, ...draft, existing: publication?.plan }),
    [applied, spec, formats, templates, articles, settings, draft, publication],
  );
  const plan = useMemo(() => buildIssuePlan(input), [input]);
  const toc = useMemo(() => planToc(plan, articles), [plan, articles]);
  // Approval is tied to what was approved: the draft and the design-spec version (not to rebuild timestamps).
  const hash = useMemo(() => JSON.stringify({ ...draft, spec: spec.version }), [draft, spec.version]);
  const approved = approval?.hash === hash;
  const byId = new Map(articles.map((a) => [a.id, a]));
  const selected = draft.articleIds.map((id) => byId.get(id)).filter((a): a is NonNullable<typeof a> => !!a);
  const unselected = articles.filter((a) => !draft.articleIds.includes(a.id) && a.id !== "art-closing");
  const nextStep = !selected.length
    ? "Tick articles under Content (left) to plan them — nothing to approve yet."
    : plan.unresolved.length
      ? "Resolve the conflicts below before the plan can be approved."
      : !approved
        ? canApprove
          ? "Approve the plan to unlock generation."
          : "An editor must approve the plan before it can be generated."
        : !canEdit
          ? "Your role cannot create publications."
          : "Approved — generate the issue.";

  const toggle = (id: string) => setDraft({ articleIds: draft.articleIds.includes(id) ? draft.articleIds.filter((x) => x !== id) : [...draft.articleIds, id] });
  const move = (id: string, dir: -1 | 1) => {
    const ids = [...draft.articleIds];
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setDraft({ articleIds: ids });
  };

  const onImport = async (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) {
      try {
        const { article, info } = await importDocument(f, applied.sections[0] ? `sec-${profile.id}-0` : "sec-front");
        useStore.getState().addArticle(article);
        useStore.getState().log({ kind: "content", message: `Imported “${article.title}” from ${f.name} (${CONTENT_TYPE_LABELS[article.contentType]}, needs preparation)`, articleId: article.id });
        setDraft({ articleIds: [...useStudio.getState().draft.articleIds, article.id] });
        toast("success", `Imported ${f.name}`, `${countWords(article.body)} words · still needs: ${info.needs.join(", ").toLowerCase()}.`);
      } catch (e) {
        toast("error", `Could not import ${f.name}`, e instanceof ImportError ? e.message : String(e));
      }
    }
  };

  const approve = () => {
    setApproval({ hash, by: actor, at: new Date().toISOString() });
    useStore.getState().log({ kind: "layout", message: `Issue plan approved: ${plan.title} — ${plan.issueLabel} (${plan.pageCount} pages, ${selected.length} articles)`, tone: "success" });
    toast("success", "Issue plan approved", "Generate the issue, or change the plan (approval resets).");
  };

  const generate = () => {
    if (!approved) return;
    setGenerating(true);
    setProblems(null);
    const t0 = performance.now();
    // Let the UI paint the progress state before the layout engine runs.
    setTimeout(() => {
      try {
        const res = generateIssue({ ...plan, status: "approved", approvedBy: approval!.by, approvedAt: approval!.at }, input, fontsVersion, actor);
        const generationMs = performance.now() - t0;
        if (!res.ok) {
          setProblems(res.problems);
          toast("warning", "Issue not generated", `${res.problems.length} problem${res.problems.length > 1 ? "s" : ""} to resolve in the plan.`);
          return;
        }
        const planningMs = stopTimer("planningMs");
        let pilot = newPilot(profile.id, pilotPages.length ? pilotPages : [...new Set(spec.layouts.map((l) => l.sourcePage).filter((n): n is number => !!n))].sort((a, b) => a - b), res.pages.length);
        pilot = recordStage(pilot, "analysisMs", profile.durationMs, "Reference measured in the browser");
        if (planningMs) pilot = recordStage(pilot, "planningMs", planningMs, "Design system review and issue planning (from confirming the design system to approving the plan)");
        pilot = recordStage(pilot, "generationMs", generationMs, `${res.pages.length} pages generated from the plan`);
        pilot.formatsTested = [...new Set(res.pages.map((p) => p.format).filter((f): f is EditorialFormat => !!f))];
        pilot.output = "browser-preview";
        useStore.getState().importBuild({ ...res, publication: { ...res.publication, pilot } });
        useStore.getState().log({ kind: "layout", message: `Issue generated from the design system of “${profile.name}”: ${res.publication.title} — ${res.publication.issueLabel} (${res.pages.length} pages, ${res.templates.length} templates)`, actor: "PressFlow (Design Studio)", tone: "success" });
        useStudio.setState({ publicationId: res.publication.id, stage: "build" });
        useStudio.getState().startTimer("qaMs");
        toast("success", "Issue generated", `${res.pages.length} pages · ${res.report[res.report.length - 1]}`);
      } catch (e) {
        setProblems([e instanceof Error ? e.message : String(e)]);
      } finally {
        setGenerating(false);
      }
    }, 30);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <div className="space-y-5">
        <Card>
          <CardHeader title="New issue" description="A different topic, the reference's design." />
          <div className="grid gap-3 p-5">
            <Field label="Publication title" htmlFor="pl-title">
              <Input id="pl-title" value={draft.title} onChange={(e) => setDraft({ title: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Issue" htmlFor="pl-issue">
                <Input id="pl-issue" value={draft.issueLabel} onChange={(e) => setDraft({ issueLabel: e.target.value })} />
              </Field>
              <Field label="Pages" htmlFor="pl-pages" hint={draft.pageCount % 4 ? <span className="text-warn">Not a multiple of 4</span> : undefined}>
                <Input id="pl-pages" type="number" min={4} max={96} step={4} value={draft.pageCount} onChange={(e) => setDraft({ pageCount: Math.max(4, Number(e.target.value) || 4) })} />
              </Field>
            </div>
            <Field label="Topic" htmlFor="pl-topic" hint="Free text — e.g. healthcare innovation, banking, education policy.">
              <Input id="pl-topic" value={draft.topic} onChange={(e) => setDraft({ topic: e.target.value })} placeholder="What this issue is about" />
            </Field>
            <label className="flex items-start gap-3 text-[13px]">
              <Switch checked={draft.includeAds} onCheckedChange={(v) => setDraft({ includeAds: v })} label="Advertisement placements" />
              <span>
                <span className="block font-medium text-ink">Keep advertisement placements</span>
                <span className="text-[12px] text-muted">Inside front cover and back cover where the reference has them.</span>
              </span>
            </label>
            <Field label="Extra reserved ad pages" htmlFor="pl-ads" hint="Comma-separated page numbers; these pages survive generation untouched.">
              <Input id="pl-ads" value={draft.adPages.join(", ")} onChange={(e) => setDraft({ adPages: e.target.value.split(/[,\s]+/).map(Number).filter((n) => n > 1) })} placeholder="e.g. 7, 12" />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title={`Content (${selected.length} selected)`}
            description="Articles from the Content Library in running order. Source text is never rewritten; AI proposals stay separate until accepted."
            actions={
              <div className="flex gap-1.5">
                <input ref={fileInput} type="file" multiple accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf" className="hidden" aria-label="Import documents" onChange={(e) => { void onImport(e.target.files); e.target.value = ""; }} />
                <Button size="sm" variant="secondary" disabled={!canEdit} onClick={() => fileInput.current?.click()}>
                  <FileUp /> Import text/PDF
                </Button>
                <Button size="sm" variant="secondary" disabled={!canEdit} onClick={() => setEditing(true)}>
                  <Plus /> New article
                </Button>
              </div>
            }
          />
          <ul className="divide-y divide-line">
            {selected.map((a, i) => {
              const format = draft.formatOverrides[a.id] ?? formatFor(a.contentType);
              const choices = templateChoices(input, format, a);
              const entry = plan.entries.find((e) => e.articleId === a.id || e.storyIds?.includes(a.id));
              return (
                <li key={a.id} className="px-4 py-2.5">
                  <div className="flex items-start gap-2">
                    <input type="checkbox" checked readOnly onClick={() => toggle(a.id)} aria-label={`Remove ${a.title}`} className="mt-1" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{a.title}</p>
                      <p className="text-[11.5px] text-muted">
                        {CONTENT_TYPE_LABELS[a.contentType]} · {countWords(a.body)} words · {a.imageIds.length} image{a.imageIds.length === 1 ? "" : "s"} · {a.status.replace("-", " ")}
                        {entry ? ` · page ${entry.number}${entry.storyIds?.includes(a.id) ? " (brief)" : ""}` : ""}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Select aria-label={`Format for ${a.title}`} value={format} onChange={(e) => setDraft({ formatOverrides: { ...draft.formatOverrides, [a.id]: e.target.value as EditorialFormat } })} className="h-7 w-[170px] text-[11.5px]">
                          {FORMATS.map((f) => (
                            <option key={f} value={f}>
                              {FORMAT_LABEL[f]}
                            </option>
                          ))}
                        </Select>
                        {format !== "news-page" && (
                          <Select aria-label={`Template for ${a.title}`} value={draft.templateOverrides[a.id] ?? choices[0].id} onChange={(e) => setDraft({ templateOverrides: { ...draft.templateOverrides, [a.id]: e.target.value } })} className="h-7 min-w-0 flex-1 text-[11.5px]">
                            {choices.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </Select>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <button className="rounded p-0.5 text-muted hover:text-ink disabled:opacity-30" disabled={i === 0} aria-label="Move up" onClick={() => move(a.id, -1)}>
                        <ArrowUp className="size-3.5" />
                      </button>
                      <button className="rounded p-0.5 text-muted hover:text-ink disabled:opacity-30" disabled={i === selected.length - 1} aria-label="Move down" onClick={() => move(a.id, 1)}>
                        <ArrowDown className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
            {unselected.map((a) => (
              <li key={a.id} className="flex items-center gap-2 px-4 py-2 text-[12.5px]">
                <input type="checkbox" checked={false} onChange={() => toggle(a.id)} aria-label={`Select ${a.title}`} />
                <span className="min-w-0 flex-1 truncate text-ink-2">{a.title}</span>
                <span className="shrink-0 text-[11px] text-muted">{CONTENT_TYPE_LABELS[a.contentType]} · {countWords(a.body)}w</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader
            title={<span className="flex items-center gap-2"><WandSparkles className="size-4 text-brand" /> Issue plan — {plan.pageCount} pages</span>}
            description="Page allocation from measured template capacity. Change anything on the left; the plan recomputes. Nothing is generated until an editor approves it."
            actions={
              <div className="flex items-center gap-2">
                {approved ? <Badge tone="ok" dot>Approved by {approval!.by}</Badge> : <Badge tone="neutral">Draft</Badge>}
                <Button size="sm" variant="secondary" disabled={!canApprove || approved || plan.unresolved.length > 0 || !selected.length} onClick={approve}>
                  <ShieldCheck /> Approve plan
                </Button>
                <Button size="sm" variant="primary" disabled={!approved || generating || !canEdit} loading={generating} onClick={generate}>
                  <Sparkles /> {publication?.plan ? "Regenerate issue" : "Generate issue"}
                </Button>
              </div>
            }
          />
          {plan.unresolved.length > 0 && (
            <div className="mx-5 mt-4 flex gap-2.5 rounded-lg border border-[#f5cdcf] bg-err-50 px-4 py-3 text-[12.5px] text-err">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <ul className="space-y-0.5">
                {plan.unresolved.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </div>
          )}
          {problems && (
            <div className="mx-5 mt-4 rounded-lg border border-[#f5cdcf] bg-err-50 px-4 py-3 text-[12.5px] text-err">
              <p className="font-semibold">Generation stopped — nothing was imported</p>
              <ul className="mt-1 space-y-0.5">
                {problems.map((p) => (
                  <li key={p}>• {p}</li>
                ))}
              </ul>
            </div>
          )}
          <p className={cn("mx-5 mt-4 rounded-md px-3 py-2 text-[12.5px]", approved ? "bg-ok-50 text-ok" : "bg-canvas text-ink-2")}>Next step: {nextStep}</p>
          <ul className="mx-5 mt-3 space-y-0.5 text-[12px] text-muted">
            {plan.notes.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
          <div className="thin-scroll overflow-x-auto p-5">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] text-muted uppercase">
                  <th className="py-1.5 pr-2 font-semibold">Page</th>
                  <th className="py-1.5 pr-2 font-semibold">Kind</th>
                  <th className="py-1.5 pr-2 font-semibold">Content</th>
                  <th className="py-1.5 pr-2 font-semibold">Template</th>
                  <th className="py-1.5 pr-2 font-semibold">Images</th>
                  <th className="py-1.5 font-semibold">Why</th>
                </tr>
              </thead>
              <tbody>
                {plan.entries.map((e: PlanEntry) => {
                  const t = input.templates.find((x) => x.id === e.templateId);
                  const a = e.articleId ? byId.get(e.articleId) : undefined;
                  const bad = (e.oversetWords ?? 0) > 0;
                  return (
                    <tr key={e.id} className={cn("border-b border-line/70 align-top", bad && "bg-err-50/60", e.title === "Open slot" && "bg-canvas")}>
                      <td className="py-1.5 pr-2 font-semibold text-ink tabular-nums">{e.number}</td>
                      <td className="py-1.5 pr-2">
                        <Badge tone={KIND_TONE[e.kind] ?? "ok"}>{FORMAT_LABEL[e.kind as EditorialFormat] ?? e.kind}</Badge>
                      </td>
                      <td className="py-1.5 pr-2 text-ink">
                        {a?.title ?? e.title}
                        {e.storyIds?.length ? <span className="block text-[11px] text-muted">+ {e.storyIds.map((id) => byId.get(id)?.title ?? id).join(" · ")}</span> : null}
                      </td>
                      <td className="py-1.5 pr-2 text-ink-2">
                        {t?.name ?? "—"}
                        {t?.derivation === "geometry" && <CheckCircle2 className="ml-1 inline size-3 text-ok" aria-label="Measured geometry" />}
                      </td>
                      <td className={cn("py-1.5 pr-2 tabular-nums", e.requiredImages > e.imagesAvailable ? "text-warn" : "text-muted")}>{e.kind === "advertisement" || e.kind === "cover" || e.kind === "contents" || e.kind === "closing" ? "—" : `${e.imagesAvailable}/${e.requiredImages}`}</td>
                      <td className="py-1.5 text-[11.5px] text-muted">
                        {e.reason}
                        {bad && <span className="block font-medium text-err">≈ {e.oversetWords} words will not fit</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Table of contents" description="As it will appear on the contents page." />
          <ol className="grid gap-x-6 gap-y-1 p-5 text-[12.5px] sm:grid-cols-2">
            {toc.map((t) => (
              <li key={t.number} className="flex gap-2">
                <span className="w-10 shrink-0 font-semibold text-ink tabular-nums">{t.pages}</span>
                <span className="min-w-0">
                  <span className="block truncate text-ink">{t.title}</span>
                  <span className="block truncate text-[11px] text-muted">
                    {FORMAT_LABEL[t.format] ?? t.format}
                    {t.author ? ` · ${t.author}` : ""}
                    {t.stories.length ? ` · with ${t.stories.length} brief${t.stories.length > 1 ? "s" : ""}` : ""}
                  </span>
                </span>
              </li>
            ))}
            {!toc.length && <li className="text-muted">Select content to see the running order.</li>}
          </ol>
        </Card>
      </div>

      {editing && <ContentEditor open onOpenChange={(o) => !o && setEditing(false)} onSaved={(id) => setDraft({ articleIds: [...useStudio.getState().draft.articleIds, id] })} />}
    </div>
  );
}
