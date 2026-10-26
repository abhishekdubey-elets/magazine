"use client";

import { FileUp, History, Loader2, Trash2, WandSparkles, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { fmtBytes, fmtDateTime, PageHeader } from "@/components/common";
import { toast } from "@/components/shell/toast";
import { Badge, Button, Card, CardHeader, cn, Progress, Segmented, SimLabel } from "@/components/ui";
import { AnalysisError, analyzeReference, type AnalyzeProgress } from "@/lib/reference/analyze";
import { useStore } from "@/lib/store";
import { ReferenceReport } from "./ReferenceReport";

const STEPS = ["Upload a reference PDF", "Measure structure & style", "Review what was found", "Create a similar issue"];

export function CreateLikeThis() {
  const params = useSearchParams();
  const router = useRouter();
  const references = useStore((s) => s.references);
  const refId = params.get("ref");
  const current = references.find((r) => r.id === refId);
  const [progress, setProgress] = useState<AnalyzeProgress | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [maxPages, setMaxPages] = useState<"24" | "40" | "80">("40");
  const [drag, setDrag] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const run = async (file: File) => {
    setError(null);
    setFileName(file.name);
    ctrl.current = new AbortController();
    setProgress({ stage: "Starting", value: 0 });
    try {
      const profile = await analyzeReference(file, { maxPages: Number(maxPages), onProgress: setProgress, signal: ctrl.current.signal });
      useStore.getState().addReference(profile);
      useStore.getState().log({ kind: "ai", message: `Reference analysed: “${profile.name}” — ${profile.pages.length} pages measured, ${profile.trim.width} × ${profile.trim.height} mm`, actor: "PressFlow (local analysis)" });
      toast("success", "Analysis complete", `${profile.pages.length} pages measured in ${(profile.durationMs / 1000).toFixed(1)} s`);
      router.replace(`/create?ref=${profile.id}`, { scroll: false });
    } catch (e) {
      const msg = e instanceof AnalysisError ? e.message : `Analysis failed: ${e instanceof Error ? e.message : String(e)}`;
      setError(msg);
      if (!(e instanceof AnalysisError && /cancelled/.test(e.message))) toast("error", "Couldn't analyse the file", msg);
    } finally {
      setProgress(null);
      ctrl.current = null;
    }
  };

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") {
      setError("Please upload the reference magazine as a PDF file.");
      return;
    }
    void run(f);
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-6 lg:p-8">
      <PageHeader
        eyebrow={<SimLabel>Local analysis · no file leaves this browser</SimLabel>}
        title="Create Like This"
        description="Upload a magazine you want to emulate. PressFlow measures its page size, grid, typography, colours, sections and page layouts, then builds editable templates and a new issue in the same style."
        actions={
          current && !progress ? (
            <Button onClick={() => router.replace("/create", { scroll: false })}>
              <FileUp /> Analyse another reference
            </Button>
          ) : undefined
        }
      />

      <ol className="grid gap-2 sm:grid-cols-4" aria-label="Steps">
        {STEPS.map((s, i) => {
          const step = progress ? 1 : current ? 2 : 0;
          return (
            <li key={s} className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-[13px]", i === step ? "border-brand bg-brand-50 text-brand" : i < step ? "border-line bg-white text-ink-2" : "border-line bg-white text-muted")}>
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold", i < step ? "bg-ok text-white" : i === step ? "bg-brand text-white" : "bg-[#eceff3] text-faint")}>{i < step ? "✓" : i + 1}</span>
              <span className="font-medium">{s}</span>
            </li>
          );
        })}
      </ol>

      {progress ? (
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-brand" />
            <div className="min-w-0 flex-1" aria-live="polite">
              <p className="text-[14px] font-semibold text-ink">Analysing “{fileName}”</p>
              <p className="mt-0.5 text-[13px] text-muted">{progress.stage}</p>
              <Progress className="mt-3" value={progress.value} />
              <p className="mt-3 text-[12px] text-muted">Large print files take a minute or two. The PDF is read locally — it is never uploaded.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => ctrl.current?.abort()}>
              <X /> Cancel
            </Button>
          </div>
        </Card>
      ) : current ? (
        <ReferenceReport key={current.id} profile={current} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
          <Card className="p-5">
            <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" aria-label="Choose reference PDF" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
            <div
              role="button"
              tabIndex={0}
              onClick={() => input.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
              className={cn("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition", drag ? "border-brand bg-brand-50" : "border-line-strong bg-[#fafbfc] hover:border-brand hover:bg-brand-50/40")}
            >
              <span className="grid size-12 place-items-center rounded-full bg-white text-brand shadow-card">
                <WandSparkles className="size-6" />
              </span>
              <p className="mt-4 text-[15px] font-semibold text-ink">Drop a reference magazine here, or click to choose</p>
              <p className="mt-1 max-w-md text-[13px] text-muted">A print or digital PDF (up to 300 MB). PDFs with live text give the best results; scanned files only yield page size, images and colours.</p>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-[12.5px] font-medium text-ink-2">Pages to measure</span>
              <Segmented
                size="sm"
                value={maxPages}
                onChange={setMaxPages}
                options={[
                  { value: "24", label: "Up to 24 (fast)" },
                  { value: "40", label: "Up to 40" },
                  { value: "80", label: "Up to 80 (thorough)" },
                ]}
              />
              <span className="text-[12px] text-muted">Longer files are sampled evenly from cover to back.</span>
            </div>
            {error && <p className="mt-4 rounded-md bg-err-50 px-3 py-2 text-[13px] text-err">{error}</p>}
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader title="What gets measured" />
              <ul className="space-y-2 p-5 text-[12.5px] text-ink-2">
                <li>• <b>Page & grid</b> — trim and bleed boxes, margins, columns and gutters from text positions.</li>
                <li>• <b>Typography</b> — every font and point size in use; body size and leading, headline, deck and caption styles.</li>
                <li>• <b>Colour</b> — palette from flat-colour areas (panels, tabs, large type) of rendered pages.</li>
                <li>• <b>Structure</b> — sections from running heads; each page classified (cover, contents, interview, article, opener, ad…).</li>
                <li>• <b>Layouts</b> — frame geometry of a model page per type, turned into editable templates.</li>
              </ul>
              <p className="border-t border-line px-5 py-3 text-[12px] text-muted">Classification and style inference are rule-based heuristics on measured data. Review and correct them before creating.</p>
            </Card>
            <Card>
              <CardHeader title={<span className="flex items-center gap-2"><History className="size-4 text-muted" /> Saved analyses</span>} description="Kept in this browser (last 2)" />
              {references.length === 0 ? (
                <p className="px-5 py-6 text-center text-[12.5px] text-muted">No references analysed yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {references.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {r.pages[0]?.thumb ? <img src={r.pages[0].thumb} alt="" className="h-14 w-10 shrink-0 rounded-sm border border-line object-cover" /> : <span className="h-14 w-10 rounded-sm bg-canvas" />}
                      <button className="min-w-0 flex-1 text-left" onClick={() => router.replace(`/create?ref=${r.id}`, { scroll: false })}>
                        <span className="block truncate text-[13px] font-medium text-ink hover:text-brand">{r.name}</span>
                        <span className="block text-[11.5px] text-muted">
                          {r.pageCount} pp · {r.trim.width}×{r.trim.height} mm · {fmtBytes(r.fileSize)} · {fmtDateTime(r.createdAt)}
                        </span>
                      </button>
                      <Badge>{r.pages.length} measured</Badge>
                      <Button size="icon-sm" variant="ghost" aria-label={`Delete analysis ${r.name}`} onClick={() => useStore.getState().deleteReference(r.id)}>
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
