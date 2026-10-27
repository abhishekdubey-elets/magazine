"use client";

import { usePublication } from "@/lib/hooks";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Heading,
  ImagePlus,
  LayoutTemplate,
  ListChecks,
  Loader2,
  Quote,
  Send,
  Sparkles,
  Tags,
  TextQuote,
  X,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { ApprovalBadge, EmptyState, PageHeader } from "@/components/common";
import { TemplateWireframe } from "@/components/page/TemplateWireframe";
import { toast } from "@/components/shell/toast";
import { Badge, Button, Card, CardHeader, cn, Field, Input, Modal, Select, SimLabel, Textarea } from "@/components/ui";
import {
  classify,
  CONTENT_TYPE_LABELS,
  imageOpportunities,
  interviewIntro,
  pullQuotes,
  withoutIntro,
  readiness,
  recommendTemplates,
  simulate,
  suggestHeadlines,
  summarize,
  type Classification,
  type ImageOpportunity,
  type ReadinessItem,
  type TemplateRecommendation,
} from "@/lib/ai";
import { findImage, imageSrc } from "@/lib/images";
import { routes } from "@/lib/nav";
import { newId, useStore } from "@/lib/store";
import { countWords } from "@/lib/text-engine";
import type { Article, ContentType, Page } from "@/lib/types";
import { isServerMode } from "@/lib/sync/engine";
import { decideOnServer, proposeOnServer, type ServerAiAction } from "@/services/ai";

type Action = "classify" | "summary" | "quotes" | "headlines" | "images" | "prepare";

interface Results {
  classify?: Classification;
  summary?: string;
  quotes?: string[];
  headlines?: { text: string; style: string }[];
  images?: ImageOpportunity[];
  prepare?: { checks: ReadinessItem[]; recs: TemplateRecommendation[] };
}

const ACTIONS: { id: Action; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: "classify", label: "Classify content", icon: <Tags />, hint: "Detect content type and section" },
  { id: "summary", label: "Generate summary", icon: <TextQuote />, hint: "Extractive standfirst, 40–55 words" },
  { id: "quotes", label: "Extract pull quotes", icon: <Quote />, hint: "Short, quotable sentences" },
  { id: "headlines", label: "Suggest headlines", icon: <Heading />, hint: "Alternatives in house style" },
  { id: "images", label: "Identify image opportunities", icon: <ImagePlus />, hint: "Portraits, scenes, data callouts" },
  { id: "prepare", label: "Prepare for layout", icon: <LayoutTemplate />, hint: "Readiness + template fit" },
];

export default function PreparePage() {
  return (
    <Suspense fallback={null}>
      <Prepare />
    </Suspense>
  );
}

function Prepare() {
  const params = useSearchParams();
  const router = useRouter();
  const articles = useStore((s) => s.articles);
  const id = params.get("article") ?? "art-int-bhashasetu";
  const article = articles.find((a) => a.id === id);
  if (!article) {
    return (
      <div className="p-8">
        <EmptyState title="Article not found" description="Choose an item from the Content Library." action={<Button href={routes.content()}>Content Library</Button>} />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-[1440px] space-y-5 p-6 lg:p-8">
      <PageHeader
        title="AI Content Preparation"
        description="Turn raw copy into layout-ready content. Suggestions are proposed separately — nothing replaces the original text until you accept it."
        actions={
          <Select aria-label="Choose article" value={article.id} onChange={(e) => router.replace(routes.prepare(e.target.value))} className="w-[340px]">
            {articles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title === "Message" ? `Message — ${a.author.name}` : a.title} · {CONTENT_TYPE_LABELS[a.contentType]}
              </option>
            ))}
          </Select>
        }
      />
      <Workspace key={article.id} article={article} />
    </div>
  );
}

function Workspace({ article }: { article: Article }) {
  const router = useRouter();
  const update = useStore((s) => s.updateArticle);
  const log = useStore((s) => s.log);
  const sections = usePublication().sections;
  const templates = useStore((s) => s.templates);
  const settings = useStore((s) => s.settings);
  const pages = useStore((s) => s.pages);
  const uploads = useStore((s) => s.uploads);
  const [results, setResults] = useState<Results>({});
  /** Server mode: id of the stored proposal per action (for the accept/reject record). */
  const [proposalIds, setProposalIds] = useState<Partial<Record<keyof Results, string>>>({});
  const [running, setRunning] = useState<Set<Action>>(new Set());
  const [sendOpen, setSendOpen] = useState(false);
  const [quoteSel, setQuoteSel] = useState<Set<number>>(new Set());
  const [summaryDraft, setSummaryDraft] = useState("");
  const [moveIntro, setMoveIntro] = useState(true);
  const intro = interviewIntro(article.body);
  const words = countWords(article.body);
  const trim = usePublication().trim;
  const rec = useMemo(() => recommendTemplates(article, templates, settings, trim)[0], [article, templates, settings, trim]);
  const cls = useMemo(() => classify(article), [article]);

  const viaServer = async (a: ServerAiAction): Promise<Results> => {
    const r = await proposeOnServer(a, article.id);
    setProposalIds((p) => ({ ...p, [a]: r.id }));
    if (r.rejected.length) toast("info", `${r.rejected.length} suggestion${r.rejected.length > 1 ? "s" : ""} dropped`, r.rejected[0]);
    const o = r.output as Record<string, unknown>;
    if (a === "classify") return { classify: o as unknown as Classification };
    if (a === "summary") return { summary: String(o.summary ?? "") };
    if (a === "quotes") return { quotes: (o.quotes as string[]) ?? [] };
    return { headlines: (o.headlines as { text: string; style: string }[]) ?? [] };
  };

  const run = async (a: Action) => {
    setRunning((r) => new Set(r).add(a));
    let serverRes: Results | null = null;
    if (isServerMode() && a !== "images" && a !== "prepare") {
      try {
        serverRes = await viaServer(a);
      } catch (e) {
        toast("warning", "AI service unavailable", `${e instanceof Error ? e.message : String(e)} — showing rule-based suggestions.`);
      }
    }
    const res = serverRes ?? await simulate(() => {
      switch (a) {
        case "classify":
          return { classify: classify(article) };
        case "summary":
          return { summary: summarize(article) };
        case "quotes":
          return { quotes: pullQuotes(article) };
        case "headlines":
          return { headlines: suggestHeadlines(article) };
        case "images":
          return { images: imageOpportunities(article) };
        case "prepare":
          return { prepare: { checks: readiness(article), recs: recommendTemplates(article, templates, settings, trim) } };
      }
    }, a === "prepare" ? 900 : 650);
    if (res.summary) setSummaryDraft(res.summary);
    if (res.quotes) setQuoteSel(new Set(res.quotes.map((_, i) => i)));
    setResults((r) => ({ ...r, ...res }));
    setRunning((r) => {
      const n = new Set(r);
      n.delete(a);
      return n;
    });
    if (a === "classify" && res.classify) log({ kind: "ai", message: `Article classified as ${CONTENT_TYPE_LABELS[res.classify.type]} (confidence ${res.classify.confidence}): “${article.title}”`, articleId: article.id, actor: isServerMode() ? "PressFlow AI" : "PressFlow (demo)" });
  };
  const dismiss = (a: keyof Results, decided = false) => {
    if (!decided) decideOnServer(proposalIds[a], "rejected");
    setProposalIds((p) => ({ ...p, [a]: undefined }));
    setResults((r) => ({ ...r, [a]: undefined }));
  };
  const accept = (patch: Partial<Article>, what: string, key: keyof Results) => {
    decideOnServer(proposalIds[key], "accepted", what);
    update(article.id, patch);
    log({ kind: "ai", message: `${what} accepted for “${article.title}”`, articleId: article.id });
    toast("success", `${what} accepted`, "Saved to the article in the Content Library.");
    dismiss(key, true);
  };

  const placedOn = pages.filter((p) => p.articleId === article.id).sort((a, b) => a.number - b.number);

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_440px]">
      {/* Editor */}
      <Card className="min-w-0">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              Content editor <ApprovalBadge status={article.status} />
            </span>
          }
          description={`${words} words · ${CONTENT_TYPE_LABELS[article.contentType]} · edits save automatically`}
          actions={
            <Button variant="primary" onClick={() => setSendOpen(true)}>
              <Send /> Send to Layout Studio
            </Button>
          }
        />
        <div className="grid grid-cols-6 gap-3.5 p-5">
          <Field label="Article title" htmlFor="p-title" className="col-span-6">
            <Input id="p-title" value={article.title} onChange={(e) => update(article.id, { title: e.target.value })} className="text-[15px] font-semibold" />
          </Field>
          <Field label="Subtitle / deck" htmlFor="p-sub" className="col-span-6">
            <Input id="p-sub" value={article.subtitle ?? ""} onChange={(e) => update(article.id, { subtitle: e.target.value })} />
          </Field>
          <Field label={article.contentType === "interview" ? "Interviewee" : "Author"} htmlFor="p-author" className="col-span-2">
            <Input id="p-author" value={article.author.name} onChange={(e) => update(article.id, { author: { ...article.author, name: e.target.value } })} />
          </Field>
          <Field label="Designation" htmlFor="p-des" className="col-span-2">
            <Input id="p-des" value={article.author.designation ?? ""} placeholder="Missing" onChange={(e) => update(article.id, { author: { ...article.author, designation: e.target.value } })} className={cn(!article.author.designation && "border-[#f4dcb9] bg-warn-50/40")} />
          </Field>
          <Field label="Organisation" htmlFor="p-org" className="col-span-2">
            <Input id="p-org" value={article.author.organisation ?? ""} onChange={(e) => update(article.id, { author: { ...article.author, organisation: e.target.value } })} />
          </Field>
          <Field label="Introductory summary" htmlFor="p-sum" className="col-span-6" hint={article.summary ? `${countWords(article.summary)} words` : "Empty — use Generate Summary"}>
            <Textarea id="p-sum" rows={3} value={article.summary ?? ""} onChange={(e) => update(article.id, { summary: e.target.value })} />
          </Field>
          <Field label="Main article text" htmlFor="p-body" className="col-span-6">
            <Textarea id="p-body" rows={16} value={article.body} onChange={(e) => update(article.id, { body: e.target.value })} className="text-[13px] leading-relaxed" />
          </Field>
          <div className="col-span-6 space-y-2">
            <p className="text-[12.5px] font-medium text-ink-2">Pull quotes ({article.pullQuotes.length})</p>
            {article.pullQuotes.length === 0 && <p className="rounded-md border border-dashed border-line px-3 py-2.5 text-[12.5px] text-muted">No pull quotes yet — use Extract Pull Quotes.</p>}
            {article.pullQuotes.map((q, i) => (
              <div key={i} className="flex gap-2">
                <Input aria-label={`Pull quote ${i + 1}`} value={q} onChange={(e) => update(article.id, { pullQuotes: article.pullQuotes.map((x, j) => (j === i ? e.target.value : x)) })} />
                <Button size="icon" variant="ghost" aria-label="Remove pull quote" onClick={() => update(article.id, { pullQuotes: article.pullQuotes.filter((_, j) => j !== i) })}>
                  <X />
                </Button>
              </div>
            ))}
          </div>
          <div className="col-span-6 space-y-2">
            <p className="text-[12.5px] font-medium text-ink-2">Image captions</p>
            {article.imageIds.length === 0 && <p className="rounded-md border border-dashed border-[#f5cdcf] bg-err-50/40 px-3 py-2.5 text-[12.5px] text-err">No images attached — layouts with photo frames will fail QA.</p>}
            {article.imageIds.map((imgId, i) => (
              <div key={imgId + i} className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageSrc(findImage(imgId, uploads))} alt="" className="h-9 w-12 shrink-0 rounded object-cover" />
                <Input aria-label={`Caption ${i + 1}`} value={article.captions[i] ?? ""} placeholder="Caption missing" onChange={(e) => update(article.id, { captions: article.imageIds.map((_, j) => (j === i ? e.target.value : article.captions[j] ?? "")) })} />
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-line bg-line md:grid-cols-4">
          {[
            ["Estimated word count", `${words} words`],
            ["Suggested section", sections.find((s) => s.id === article.sectionId)?.name ?? "—"],
            ["Detected type", `${CONTENT_TYPE_LABELS[cls.type]} (${Math.round(cls.confidence * 100)}%)`],
            ["Suggested layout", rec ? rec.template.name : "—"],
          ].map(([k, v]) => (
            <div key={k} className="bg-white px-5 py-3">
              <p className="text-[11.5px] text-muted">{k}</p>
              <p className="mt-0.5 truncate text-[13px] font-medium text-ink">{v}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-line px-5 py-3 text-[12.5px] text-muted">
          {placedOn.length ? (
            <>Placed on page{placedOn.length > 1 ? "s" : ""} {placedOn.map((p) => p.number).join(", ")}.</>
          ) : (
            "Not yet placed on a page."
          )}
        </div>
      </Card>

      {/* Assistant */}
      <div className="space-y-4">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Sparkles className="size-4 text-ai" /> Preparation assistant</span>} description="Local, deterministic heuristics stand in for AI services in this demo." actions={<SimLabel />} />
          <div className="grid grid-cols-2 gap-2 p-3">
            {ACTIONS.map((a) => (
              <button
                key={a.id}
                disabled={running.has(a.id)}
                onClick={() => run(a.id)}
                className="flex items-start gap-2.5 rounded-lg border border-line p-2.5 text-left transition hover:border-[#c9bff0] hover:bg-ai-50/50 disabled:opacity-60"
              >
                <span className="mt-0.5 text-ai [&_svg]:size-4">{running.has(a.id) ? <Loader2 className="animate-spin" /> : a.icon}</span>
                <span>
                  <span className="block text-[12.5px] font-semibold text-ink">{a.label}</span>
                  <span className="block text-[11.5px] leading-snug text-muted">{a.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>

        {results.classify && (
          <Suggestion title="Suggested classification" onReject={() => dismiss("classify")}>
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-semibold text-ink">{CONTENT_TYPE_LABELS[results.classify.type]}</span>
              <Badge tone="ai">{Math.round(results.classify.confidence * 100)}% confidence</Badge>
              {results.classify.type === article.contentType && <Badge tone="ok">Matches current</Badge>}
            </div>
            <div className="mt-3 space-y-1">
              {results.classify.scores.slice(0, 4).map((s) => (
                <div key={s.type} className="flex items-center gap-2 text-[12px]">
                  <span className="w-[120px] text-muted">{CONTENT_TYPE_LABELS[s.type]}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#eceff3]">
                    <span className="block h-full rounded-full bg-ai/70" style={{ width: `${Math.min(100, (Math.max(0, s.score) / Math.max(1, results.classify!.scores[0].score)) * 100)}%` }} />
                  </span>
                </div>
              ))}
            </div>
            <ul className="mt-3 space-y-0.5 text-[12px] text-ink-2">
              {results.classify.reasons.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
            <Actions>
              <Button size="sm" variant="ai" disabled={results.classify.type === article.contentType} onClick={() => accept({ contentType: results.classify!.type as ContentType }, "Classification", "classify")}>
                <Check /> Apply type
              </Button>
            </Actions>
          </Suggestion>
        )}

        {results.summary !== undefined && (
          <Suggestion title="Proposed summary" onReject={() => dismiss("summary")}>
            <Textarea aria-label="Proposed summary" rows={4} value={summaryDraft} onChange={(e) => setSummaryDraft(e.target.value)} className="text-[13px]" />
            <p className="mt-1 text-[11.5px] text-muted">{countWords(summaryDraft)} words · extracted from the article; edit before accepting</p>
            {article.summary && <p className="mt-2 rounded-md bg-canvas px-2.5 py-2 text-[12px] text-muted">Current: {article.summary}</p>}
            {intro && (
              <label className="mt-2.5 flex gap-2 rounded-md border border-line p-2.5 text-[12px] text-ink-2">
                <input type="checkbox" className="mt-0.5 accent-[#5b3fc4]" checked={moveIntro} onChange={(e) => setMoveIntro(e.target.checked)} />
                <span>
                  Use the introduction as the standfirst and remove it from the body ({countWords(intro)} words), so it is not printed twice. <span className="text-muted">The edit is logged and can be undone in the editor.</span>
                </span>
              </label>
            )}
            <Actions>
              <Button size="sm" variant="ai" disabled={!summaryDraft.trim()} onClick={() => accept({ summary: summaryDraft.trim(), ...(intro && moveIntro ? { body: withoutIntro(article.body) } : {}) }, intro && moveIntro ? "Standfirst (introduction moved out of body)" : "Summary", "summary")}>
                <Check /> {article.summary ? "Replace summary" : "Accept summary"}
              </Button>
            </Actions>
          </Suggestion>
        )}

        {results.quotes && (
          <Suggestion title="Pull quote candidates" onReject={() => dismiss("quotes")}>
            <ul className="space-y-2">
              {results.quotes.map((q, i) => (
                <li key={i}>
                  <label className="flex gap-2.5 rounded-md border border-line p-2.5 text-[12.5px] text-ink-2 has-[:checked]:border-[#c9bff0] has-[:checked]:bg-ai-50/40">
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-[#5b3fc4]"
                      checked={quoteSel.has(i)}
                      onChange={(e) => {
                        const n = new Set(quoteSel);
                        if (e.target.checked) n.add(i);
                        else n.delete(i);
                        setQuoteSel(n);
                      }}
                    />
                    <span>“{q}” <span className="text-faint">({countWords(q)} words)</span></span>
                  </label>
                </li>
              ))}
            </ul>
            <Actions>
              <Button size="sm" variant="ai" disabled={!quoteSel.size} onClick={() => accept({ pullQuotes: [...article.pullQuotes, ...results.quotes!.filter((_, i) => quoteSel.has(i))].slice(0, 4) }, `${quoteSel.size} pull quote${quoteSel.size > 1 ? "s" : ""}`, "quotes")}>
                <Check /> Add selected
              </Button>
            </Actions>
          </Suggestion>
        )}

        {results.headlines && (
          <Suggestion title="Headline alternatives" onReject={() => dismiss("headlines")}>
            <ul className="space-y-2">
              {results.headlines.map((h) => (
                <li key={h.text} className="rounded-md border border-line p-2.5">
                  <p className="text-[13.5px] font-semibold text-ink">{h.text}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Badge>{h.style}</Badge>
                    <button className="ml-auto text-[12px] font-medium text-ai hover:underline" onClick={() => accept({ title: h.text }, "Headline", "headlines")}>
                      Use as headline
                    </button>
                    <button className="text-[12px] font-medium text-ai hover:underline" onClick={() => accept({ subtitle: h.text }, "Deck", "headlines")}>
                      Use as deck
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Suggestion>
        )}

        {results.images && (
          <Suggestion title="Image opportunities" onReject={() => dismiss("images")}>
            {results.images.length === 0 && <p className="text-[12.5px] text-muted">No strong visual cues found in the copy.</p>}
            <ul className="space-y-2">
              {results.images.map((op) => {
                const attached = op.suggestedImageId && article.imageIds.includes(op.suggestedImageId);
                return (
                  <li key={op.title} className="flex gap-3 rounded-md border border-line p-2.5">
                    {op.suggestedImageId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageSrc(findImage(op.suggestedImageId, uploads))} alt="" className="h-14 w-16 shrink-0 rounded object-cover" />
                    ) : (
                      <span className="grid h-14 w-16 shrink-0 place-items-center rounded bg-canvas text-[10px] font-semibold text-muted uppercase">{op.kind}</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-semibold text-ink">{op.title}</p>
                      <p className="text-[11.5px] text-muted">{op.reason}</p>
                      {op.suggestedImageId && (
                        <button
                          disabled={!!attached}
                          className="mt-1 text-[12px] font-medium text-ai hover:underline disabled:text-ok disabled:no-underline"
                          onClick={() => {
                            update(article.id, { imageIds: [...article.imageIds, op.suggestedImageId!], captions: [...article.imageIds.map((_, j) => article.captions[j] ?? ""), op.caption] });
                            toast("success", "Sample image attached", "Marked as FPO — replace with the supplied photograph before print.");
                          }}
                        >
                          {attached ? "✓ Attached" : "Attach sample image (FPO)"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Suggestion>
        )}

        {results.prepare && (
          <Suggestion title="Layout readiness" onReject={() => dismiss("prepare")}>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
              {results.prepare.checks.map((c) => (
                <li key={c.label} className="flex items-center gap-1.5 text-[12px]">
                  {c.ok ? <CheckCircle2 className="size-3.5 text-ok" /> : c.required ? <XCircle className="size-3.5 text-err" /> : <AlertTriangle className="size-3.5 text-warn" />}
                  <span className="truncate text-ink-2">{c.label}</span>
                </li>
              ))}
            </ul>
            {results.prepare.recs[0] && (
              <div className="mt-3 flex gap-3 rounded-lg border border-[#ddd6f8] bg-ai-50/50 p-3">
                <TemplateWireframe template={results.prepare.recs[0].template} className="w-14 shrink-0 rounded-sm border border-line" />
                <div className="min-w-0">
                  <p className="text-[11.5px] font-semibold text-ai uppercase">Recommended layout</p>
                  <p className="text-[13px] font-semibold text-ink">{results.prepare.recs[0].template.name}</p>
                  <ul className="mt-1 space-y-0.5 text-[11.5px] text-ink-2">
                    {results.prepare.recs[0].reasons.map((r) => (
                      <li key={r}>• {r}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <Actions>
              <Button size="sm" variant="primary" onClick={() => setSendOpen(true)}>
                <Send /> Send to Layout Studio
              </Button>
            </Actions>
          </Suggestion>
        )}

        {!Object.values(results).some(Boolean) && running.size === 0 && (
          <Card className="p-5 text-center">
            <ListChecks className="mx-auto size-5 text-muted" />
            <p className="mt-2 text-[13px] font-medium text-ink">Run an action to see suggestions</p>
            <p className="mt-1 text-[12px] text-muted">Each suggestion can be accepted, edited or rejected.</p>
          </Card>
        )}
      </div>
      {sendOpen && <SendDialog article={article} onClose={() => setSendOpen(false)} onSent={(pageId, planned) => router.push(`${routes.studio(pageId)}${planned ? "&generate=1" : ""}`)} />}
    </div>
  );
}

function Suggestion({ title, children, onReject }: { title: string; children: React.ReactNode; onReject: () => void }) {
  return (
    <Card className="border-[#ddd6f8]">
      <div className="flex items-center gap-2 border-b border-[#ece8fb] px-4 py-2.5">
        <Sparkles className="size-3.5 text-ai" />
        <p className="text-[13px] font-semibold text-ink">{title}</p>
        <SimLabel className="ml-auto">Demo-generated</SimLabel>
        <button className="rounded p-0.5 text-muted hover:bg-canvas hover:text-ink" aria-label={`Reject ${title}`} title="Reject" onClick={onReject}>
          <X className="size-4" />
        </button>
      </div>
      <div className="p-4">{children}</div>
    </Card>
  );
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 flex justify-end gap-2">{children}</div>;
}

function SendDialog({ article, onClose, onSent }: { article: Article; onClose: () => void; onSent: (pageId: string, planned: boolean) => void }) {
  const allPages = useStore((s) => s.pages);
  const pubId = useStore((s) => s.activePublicationId);
  const pages = useMemo(() => allPages.filter((p) => p.publicationId === pubId).sort((a, b) => a.number - b.number), [allPages, pubId]);
  const placed = pages.filter((p) => p.articleId === article.id);
  const open = pages.filter((p) => !p.articleId && !p.templateId);
  const [target, setTarget] = useState<string>(placed[0]?.id ?? open[0]?.id ?? "new");

  const go = () => {
    const s = useStore.getState();
    let pageId = target;
    if (target === "new") {
      const n = pages.length + 1;
      const page: Page = {
        id: newId("page"),
        publicationId: pubId,
        number: n,
        pageType: article.contentType === "interview" ? "interview" : article.contentType === "leadership-message" ? "leadership-message" : "article",
        title: article.title,
        sectionId: article.sectionId,
        articleId: article.id,
        status: "planned",
        contentOverrides: {},
        imageOverrides: {},
        frameOverrides: {},
        updatedAt: new Date().toISOString(),
      };
      useStore.setState((st) => ({ pages: [...st.pages, page], publications: st.publications.map((p) => (p.id === pubId ? { ...p, pageIds: [...p.pageIds, page.id] } : p)) }));
      pageId = page.id;
    } else {
      const page = pages.find((p) => p.id === target)!;
      if (page.articleId !== article.id) s.updatePage(page.id, { articleId: article.id, sectionId: article.sectionId, title: article.title, status: "planned" });
    }
    s.log({ kind: "layout", message: `“${article.title}” sent to Layout Studio`, articleId: article.id, pageId });
    const p = useStore.getState().pages.find((x) => x.id === pageId)!;
    onSent(pageId, p.status === "planned");
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Send to Layout Studio"
      description="Choose where this content should be laid out."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={go}>
            Continue <ArrowRight />
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {placed.map((p) => (
          <Choice key={p.id} checked={target === p.id} onChange={() => setTarget(p.id)} title={`Page ${p.number} — already assigned`} sub={p.status === "planned" ? "Layout not generated yet" : `Status: ${p.status.replace("-", " ")}`} />
        ))}
        {open.map((p) => (
          <Choice key={p.id} checked={target === p.id} onChange={() => setTarget(p.id)} title={`Page ${p.number} — empty slot`} sub="Assign and generate" />
        ))}
        <Choice checked={target === "new"} onChange={() => setTarget("new")} title={`Add page ${pages.length + 1} at the end`} sub="Creates a new planned page in this issue" />
      </div>
    </Modal>
  );
}

function Choice({ checked, onChange, title, sub }: { checked: boolean; onChange: () => void; title: string; sub: string }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg border p-3", checked ? "border-brand bg-brand-50/50" : "border-line hover:border-line-strong")}>
      <input type="radio" checked={checked} onChange={onChange} className="accent-[#2453c4]" />
      <span>
        <span className="block text-[13px] font-medium text-ink">{title}</span>
        <span className="block text-[12px] text-muted">{sub}</span>
      </span>
    </label>
  );
}
