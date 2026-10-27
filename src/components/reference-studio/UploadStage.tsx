"use client";

import { ArrowRight, FileUp, History, Loader2, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { fmtBytes, fmtDateTime } from "@/components/common";
import { toast } from "@/components/shell/toast";
import { Badge, Button, Card, CardHeader, cn, Progress, Segmented } from "@/components/ui";
import { AnalysisError, analyzeReference, type AnalyzeProgress } from "@/lib/reference/analyze";
import { AI_IMAGE_WIDTH, recognizeProfile } from "@/lib/reference/recognize-client";
import { deriveDesignSpec } from "@/lib/reference/spec";
import { useStore } from "@/lib/store";
import { useCan, useWorkspace } from "@/lib/sync/engine";
import type { ReferenceProfile } from "@/lib/types";
import { useStudio } from "./studio-state";

/** Stage A — upload the reference magazine (PDF) and measure it in the browser. */
export function UploadStage({ profile }: { profile?: ReferenceProfile }) {
  const router = useRouter();
  const references = useStore((s) => s.references);
  const canEdit = useCan("edit-references");
  const aiProvider = useWorkspace((s) => s.setup?.ai.provider ?? null);
  const [useAi, setUseAi] = useState(true);
  const setStage = useStudio((s) => s.setStage);
  const openReference = useStudio((s) => s.openReference);
  const [progress, setProgress] = useState<AnalyzeProgress | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [maxPages, setMaxPages] = useState<"24" | "40" | "80">("40");
  const [drag, setDrag] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const open = (id: string) => {
    openReference(id, "analyse");
    router.replace(`/reference-studio?ref=${id}`, { scroll: false });
  };

  const run = async (file: File) => {
    setError(null);
    setFileName(file.name);
    ctrl.current = new AbortController();
    setProgress({ stage: "Starting", value: 0 });
    try {
      const withAi = !!aiProvider && useAi;
      const { aiImages, ...measured } = await analyzeReference(file, { maxPages: Number(maxPages), onProgress: setProgress, signal: ctrl.current.signal, aiImageWidth: withAi ? AI_IMAGE_WIDTH : undefined });
      let profile: ReferenceProfile = measured;
      let aiNote = "";
      if (withAi && aiImages) {
        try {
          profile = await recognizeProfile(measured, aiImages, { onProgress: setProgress, signal: ctrl.current.signal });
          const d = profile.ai?.disagreements.length ?? 0;
          aiNote = ` · AI recognised ${profile.ai?.pages ?? 0} pages${d ? ` (${d} differ from the rules — check them)` : ""}`;
        } catch (e) {
          if (ctrl.current?.signal.aborted) throw e;
          toast("warning", "AI recognition unavailable — rules used", e instanceof Error ? e.message : String(e));
        }
      }
      const spec = deriveDesignSpec(profile);
      const next = { ...profile, spec };
      useStore.getState().addReference(next);
      useStore.getState().log({ kind: "ai", message: `Reference analysed for the studio: “${next.name}” — ${next.pages.length} pages measured${next.ai ? `, ${next.ai.pages} recognised by ${next.ai.provider === "openai" ? "OpenAI" : "Claude"}` : ""}, design spec v${spec.version} (${spec.review.warnings.length} warnings)`, actor: next.ai ? "PressFlow (measurement + AI recognition)" : "PressFlow (local analysis)" });
      toast("success", "Analysis complete", `${next.pages.length} pages measured in ${(next.durationMs / 1000).toFixed(1)} s${aiNote}`);
      open(next.id);
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

  if (progress) {
    return (
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-brand" />
          <div className="min-w-0 flex-1" aria-live="polite">
            <p className="text-[14px] font-semibold text-ink">Analysing “{fileName}”</p>
            <p className="mt-0.5 text-[13px] text-muted">{progress.stage}</p>
            <Progress className="mt-3" value={progress.value} />
            <p className="mt-3 text-[12px] text-muted">Page boxes, text runs, image placements and colours are measured from the PDF itself in this browser. {aiProvider && useAi ? "Page types, sections and text roles are then recognised by the AI from page images sent to the server — nothing it says changes a measurement." : "Page types are inferred by rules."} The PDF itself is never uploaded.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => ctrl.current?.abort()}>
            <X /> Cancel
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
      <Card className="p-5">
        <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" aria-label="Choose reference PDF" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
        <div
          role="button"
          tabIndex={0}
          aria-disabled={!canEdit}
          onClick={() => canEdit && input.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && canEdit && input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (canEdit) onFiles(e.dataTransfer.files); }}
          className={cn("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition", drag ? "border-brand bg-brand-50" : "border-line-strong bg-[#fafbfc] hover:border-brand hover:bg-brand-50/40", !canEdit && "cursor-not-allowed opacity-60")}
        >
          <span className="grid size-12 place-items-center rounded-full bg-white text-brand shadow-card">
            <FileUp className="size-6" />
          </span>
          <p className="mt-4 text-[15px] font-semibold text-ink">Drop the reference magazine here, or click to choose</p>
          <p className="mt-1 max-w-md text-[13px] text-muted">A print or digital PDF up to 300 MB, any page count. Multi-page files are sampled front to back; PDFs with live text yield typography and grid, scanned files only page size, images and colours (no OCR is available).</p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-[12.5px] font-medium text-ink-2">Pages to measure</span>
          <Segmented size="sm" value={maxPages} onChange={setMaxPages} options={[{ value: "24", label: "Up to 24 (fast)" }, { value: "40", label: "Up to 40" }, { value: "80", label: "Up to 80 (thorough)" }]} />
        </div>
        <label className={cn("mt-3 flex items-start gap-2.5 text-[12.5px]", aiProvider ? "text-ink-2" : "text-muted")}>
          <input type="checkbox" className="mt-0.5" checked={!!aiProvider && useAi} disabled={!aiProvider} onChange={(e) => setUseAi(e.target.checked)} />
          <span>
            <span className="font-medium">AI recognition of page types, sections and text roles</span>{" "}
            {aiProvider ? (
              <span className="text-muted">(via {aiProvider === "openai" ? "OpenAI" : "Claude"} on the server, page images only). Measurements stay rule-based; every answer is shown with its confidence and can be corrected.</span>
            ) : (
              <span>— not available: no AI provider key is set on the server; rules classify the pages.</span>
            )}
          </span>
        </label>
        {error && <p className="mt-4 rounded-md bg-err-50 px-3 py-2 text-[13px] text-err">{error}</p>}
        {!canEdit && <p className="mt-4 text-[12.5px] text-muted">Your role cannot analyse references; open a saved analysis instead.</p>}
        {profile && (
          <div className="mt-5 flex items-center gap-3 rounded-lg border border-line bg-canvas px-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {profile.pages[0]?.thumb && <img src={profile.pages[0].thumb} alt="" className="h-12 rounded-sm border border-line" />}
            <div className="min-w-0 flex-1 text-[13px]">
              <p className="font-semibold text-ink">Current reference: {profile.name}</p>
              <p className="text-muted">{profile.pageCount} pages · design spec v{profile.spec?.version ?? "—"} · {profile.spec?.review.status === "confirmed" ? "confirmed" : "draft"}</p>
            </div>
            <Button onClick={() => setStage("analyse")}>
              Continue <ArrowRight />
            </Button>
          </div>
        )}
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><History className="size-4 text-muted" /> Saved design profiles</span>} description="Analyse a reference once; reuse its design system for every issue." />
          {references.length === 0 ? (
            <p className="px-5 py-6 text-center text-[12.5px] text-muted">No references analysed yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {references.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.pages[0]?.thumb ? <img src={r.pages[0].thumb} alt="" className="h-14 w-10 shrink-0 rounded-sm border border-line object-cover" /> : <span className="h-14 w-10 rounded-sm bg-canvas" />}
                  <button className="min-w-0 flex-1 text-left" onClick={() => open(r.id)}>
                    <span className="block truncate text-[13px] font-medium text-ink hover:text-brand">{r.name}</span>
                    <span className="block text-[11.5px] text-muted">
                      {r.pageCount} pp · {r.trim.width}×{r.trim.height} mm · {fmtBytes(r.fileSize)} · {fmtDateTime(r.createdAt)}
                    </span>
                  </button>
                  <Badge tone={r.spec?.review.status === "confirmed" ? "ok" : "neutral"}>{r.spec ? `v${r.spec.version} ${r.spec.review.status}` : "no spec"}</Badge>
                  {canEdit && (
                    <Button size="icon-sm" variant="ghost" aria-label={`Delete analysis ${r.name}`} onClick={() => useStore.getState().deleteReference(r.id)}>
                      <Trash2 />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="What happens next" />
          <ol className="list-decimal space-y-1.5 py-4 pr-5 pl-9 text-[12.5px] text-ink-2">
            <li>Every measured property becomes a finding with its confidence and the pages that support it.</li>
            <li>You review and confirm the design system: grid, type, colour, furniture and a layout per editorial format.</li>
            <li>Pick Content Library articles for a new topic; the planner allocates pages and continuation pages.</li>
            <li>Pages are generated, checked (content, layout, print, visual) and built as an editable InDesign document.</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}
