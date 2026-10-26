"use client";

import { AlertTriangle, CheckCircle2, Circle, Loader2, Sparkles, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Field, Modal, Select, SimLabel, cn } from "@/components/ui";
import { CONTENT_TYPE_LABELS, readiness, recommendTemplates } from "@/lib/ai";
import { makeContext, resolvePage } from "@/lib/layout-engine";
import { checkPage, summarize } from "@/lib/qa-engine";
import { useStore } from "@/lib/store";
import { countWords } from "@/lib/text-engine";
import { useFonts, usePublication } from "@/lib/hooks";
import { TemplateWireframe } from "../page/TemplateWireframe";
import { toast } from "../shell/toast";

const STEPS = ["Validate content", "Assign template", "Place text, images and furniture", "Fit copy into threaded frames", "Run layout validation"];

export interface GenerateResult {
  template: string;
  placed: number;
  overset: number;
  errors: number;
  warnings: number;
}

export function GenerateDialog({ pageId, open, onOpenChange, onRunning, preferredTemplate }: { pageId: string; open: boolean; onOpenChange: (o: boolean) => void; onRunning: (r: boolean) => void; preferredTemplate?: string | null }) {
  const s = useStore();
  const pub = usePublication();
  const fontsVersion = useFonts((f) => f.version);
  const page = s.pages.find((p) => p.id === pageId)!;
  const [articleId, setArticleId] = useState(page.articleId ?? "");
  const article = s.articles.find((a) => a.id === articleId);
  const recs = useMemo(() => (article ? recommendTemplates(article, s.templates, s.settings, pub.trim) : []), [article, s.templates, s.settings, pub.trim]);
  const [templateId, setTemplateId] = useState<string>("");
  const [step, setStep] = useState(-1);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (open) {
      setArticleId(page.articleId ?? "");
      setStep(-1);
      setResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    setTemplateId(recs.find((r) => r.template.id === (preferredTemplate ?? page.templateId))?.template.id ?? recs[0]?.template.id ?? "");
  }, [recs, page.templateId, preferredTemplate]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const checks = article ? readiness(article) : [];
  const blocking = checks.filter((c) => c.required && !c.ok);
  const running = step >= 0 && !result;

  const run = () => {
    if (!article || !templateId) return;
    onRunning(true);
    setStep(0);
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    at(550, () => setStep(1));
    at(1050, () => setStep(2));
    at(1500, () => {
      useStore.getState().generateLayout(page.id, article.id, templateId);
      setStep(3);
    });
    at(2150, () => setStep(4));
    at(2700, () => {
      const st = useStore.getState();
      const ctx = makeContext(pub, st.pages.filter((p) => p.publicationId === pub.id), st.articles, st.templates, st.settings, fontsVersion);
      const fresh = st.pages.find((p) => p.id === page.id)!;
      const r = resolvePage(ctx, fresh);
      const issues = checkPage(ctx, r, st.uploads);
      const sum = summarize(issues);
      const placed = r.elements.filter((e) => e.frame.bind === "body").reduce((n, e) => n + countWords(e.text), 0);
      const tpl = st.templates.find((t) => t.id === templateId)!;
      const res = { template: tpl.name, placed, overset: r.storyOversetWords, errors: sum.errors, warnings: sum.warnings };
      setResult(res);
      onRunning(false);
      st.log({ kind: "layout", message: `Layout draft generated for page ${page.number} — ${tpl.name}`, pageId: page.id, actor: "PressFlow (demo)", tone: sum.errors ? "warning" : "success" });
      toast(sum.errors ? "warning" : "success", `Page ${page.number} generated`, `${tpl.name} · ${sum.errors} errors, ${sum.warnings} warnings`);
    });
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !running && onOpenChange(o)}
      width="max-w-2xl"
      title={<span className="flex items-center gap-2">Generate layout — page {page.number} <SimLabel>Simulated layout service</SimLabel></span>}
      description="Validates the content, assigns a template and populates a draft page in the browser. A future InDesign service can replace this step behind the same interface."
      footer={
        result ? (
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Review page
          </Button>
        ) : (
          <>
            <Button variant="ghost" disabled={running} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={running} disabled={!article || !!blocking.length || !templateId} onClick={run}>
              {!running && <Sparkles />} Generate layout
            </Button>
          </>
        )
      }
    >
      {step < 0 ? (
        <div className="space-y-4">
          <Field label="Content" htmlFor="gen-article">
            <Select id="gen-article" value={articleId} onChange={(e) => setArticleId(e.target.value)}>
              <option value="">Choose an article…</option>
              {s.articles.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} — {CONTENT_TYPE_LABELS[a.contentType]} · {countWords(a.body)} words
                </option>
              ))}
            </Select>
          </Field>
          {article && (
            <>
              <div>
                <p className="mb-2 text-[12.5px] font-medium text-ink-2">Content validation</p>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {checks.map((c) => (
                    <li key={c.label} className="flex items-center gap-2 text-[12.5px]">
                      {c.ok ? <CheckCircle2 className="size-3.5 text-ok" /> : c.required ? <XCircle className="size-3.5 text-err" /> : <AlertTriangle className="size-3.5 text-warn" />}
                      <span className="text-ink-2">{c.label}</span>
                      <span className="ml-auto truncate text-muted">{c.detail}</span>
                    </li>
                  ))}
                </ul>
                {blocking.length > 0 && <p className="mt-2 text-[12.5px] text-err">Required content is missing — complete it in the Content Library first.</p>}
              </div>
              <div>
                <p className="mb-2 text-[12.5px] font-medium text-ink-2">Template</p>
                <div className="grid grid-cols-3 gap-2.5">
                  {recs.slice(0, 6).map((r, i) => (
                    <button
                      key={r.template.id}
                      onClick={() => setTemplateId(r.template.id)}
                      className={cn("rounded-lg border p-2 text-left transition", templateId === r.template.id ? "border-brand ring-2 ring-brand-100" : "border-line hover:border-line-strong")}
                    >
                      <TemplateWireframe template={r.template} className="w-full rounded-sm border border-line" />
                      <p className="mt-1.5 truncate text-[12px] font-semibold text-ink">{r.template.name}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        {i === 0 && <Badge tone="ai">Recommended</Badge>}
                        <Badge tone={r.fits ? "ok" : "warn"}>{r.capacity ? `≈${r.capacity} w` : "Opener"}</Badge>
                      </div>
                    </button>
                  ))}
                </div>
                {recs.find((r) => r.template.id === templateId) && (
                  <ul className="mt-2.5 space-y-0.5 rounded-md bg-canvas p-2.5 text-[12px] text-ink-2">
                    {recs.find((r) => r.template.id === templateId)!.reasons.map((x) => (
                      <li key={x}>• {x}</li>
                    ))}
                  </ul>
                )}
                {recs.length === 0 && <p className="text-[12.5px] text-muted">No active template supports this content type.</p>}
              </div>
              {page.status !== "planned" && Object.keys(page.frameOverrides).length > 0 && (
                <p className="rounded-md bg-warn-50 px-3 py-2 text-[12.5px] text-warn">Regenerating resets frame position and style adjustments on this page. Text edits are kept and can be undone.</p>
              )}
            </>
          )}
        </div>
      ) : (
        <div>
          <ol className="space-y-2.5">
            {STEPS.map((label, i) => (
              <li key={label} className="flex items-center gap-3 text-[13.5px]">
                {step > i || result ? (
                  <CheckCircle2 className="size-4 text-ok" />
                ) : step === i ? (
                  <Loader2 className="size-4 animate-spin text-brand" />
                ) : (
                  <Circle className="size-4 text-faint" />
                )}
                <span className={cn(step >= i || result ? "text-ink" : "text-muted")}>{label}</span>
              </li>
            ))}
          </ol>
          {result && (
            <div className="mt-5 grid grid-cols-4 gap-2.5">
              {[
                ["Template", result.template],
                ["Words placed", String(result.placed)],
                ["Overset words", String(result.overset)],
                ["QA", `${result.errors} errors · ${result.warnings} warnings`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-line p-2.5">
                  <p className="text-[11px] text-muted">{k}</p>
                  <p className="mt-0.5 text-[12.5px] font-semibold text-ink">{v}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
