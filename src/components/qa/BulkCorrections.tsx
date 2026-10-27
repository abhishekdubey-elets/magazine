"use client";

import { Layers, Undo2 } from "lucide-react";
import { useState } from "react";
import { create } from "zustand";
import { applyBulk, BULK_HELP, BULK_LABEL, previewBulk, type BulkOperation, type BulkPreview } from "@/lib/bulk-fixes";
import type { LayoutContext } from "@/lib/layout-engine";
import type { BulkOpKey } from "@/lib/issue-qa";
import { useStore } from "@/lib/store";
import type { Page, QACheckId } from "@/lib/types";
import { toast } from "../shell/toast";
import { Badge, Button, Card, CardHeader, cn, Select } from "../ui";

const BULK_OPS: BulkOpKey[] = ["reset-styles", "reset-geometry", "fill-frames", "add-continuations", "regenerate", "reapply-templates"];

/** Preflight checks that a bulk operation addresses across pages. */
export const BULK_FOR_CHECK: Partial<Record<QACheckId, BulkOpKey>> = {
  overflow: "add-continuations",
  "font-consistency": "reset-styles",
  "margin-alignment": "reset-geometry",
  "image-fill": "fill-frames",
};

/** A request from a QA finding: pre-select an operation and the pages it concerns. */
export const useBulkRequest = create<{ op: BulkOpKey; pageIds: string[]; nonce: number; request: (op: BulkOpKey, pageIds: string[]) => void }>((set) => ({
  op: "reset-styles",
  pageIds: [],
  nonce: 0,
  request: (op, pageIds) => set((s) => ({ op, pageIds, nonce: s.nonce + 1 })),
}));

interface Undo {
  label: string;
  publicationId: string;
  pages: Page[];
}

/**
 * Bulk corrections for the active publication: pick pages, pick an
 * operation, preview exactly what changes, apply, undo. Operations never
 * touch article text, photographs or fonts; approved pages that change go
 * back to review.
 */
export function BulkCorrections({ ctx, className }: { ctx: LayoutContext; className?: string }) {
  const req = useBulkRequest();
  const templates = useStore((s) => s.templates);
  const [seen, setSeen] = useState(0);
  const [op, setOp] = useState<BulkOpKey>("reset-styles");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetTemplate, setTargetTemplate] = useState("");
  const [preview, setPreview] = useState<BulkPreview | null>(null);
  const [undo, setUndo] = useState<Undo[]>([]);
  const pages = [...ctx.pages].sort((a, b) => a.number - b.number);
  const publication = ctx.publication;

  // Adopt a request from a QA finding (op + pages) once.
  if (req.nonce !== seen) {
    setSeen(req.nonce);
    setOp(req.op);
    setSelected(new Set(req.pageIds));
    setPreview(null);
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const operation = (): BulkOperation => (op === "reapply-templates" ? { type: op, templateId: targetTemplate || undefined } : { type: op });
  const doPreview = () => setPreview(previewBulk(ctx, [...selected], operation()));
  const apply = () => {
    if (!preview) return;
    const res = applyBulk(ctx, [...selected], operation(), templates);
    setUndo((u) => [...u, { label: BULK_LABEL[op], publicationId: publication.id, pages: ctx.pages }]);
    useStore.getState().replacePages(publication.id, res.pages);
    useStore.getState().log({ kind: "qa", message: `Bulk correction “${BULK_LABEL[op]}” applied to ${res.applied} page${res.applied === 1 ? "" : "s"} of ${publication.title}`, tone: "success" });
    toast("success", `${BULK_LABEL[op]} applied`, `${res.applied} page${res.applied === 1 ? "" : "s"} changed. Affected approvals were reset; the checks re-ran.`);
    setPreview(null);
  };
  const undoLast = () => {
    const last = undo.at(-1);
    if (!last) return;
    useStore.getState().replacePages(last.publicationId, last.pages);
    useStore.getState().log({ kind: "qa", message: `Undid bulk correction “${last.label}” on ${publication.title}`, tone: "default" });
    setUndo((u) => u.slice(0, -1));
    setPreview(null);
    toast("info", "Bulk correction undone", last.label);
  };

  return (
    <Card className={className}>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Layers className="size-4 text-muted" /> Bulk corrections
          </span>
        }
        description="Fix the same problem on many pages at once. Every operation shows its scope and effect before it is applied."
        actions={
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(pages.map((p) => p.id)))}>
              All pages
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        }
      />
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap gap-1">
          {pages.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={selected.has(p.id)}
              onClick={() => toggle(p.id)}
              className={cn("h-7 min-w-7 rounded-md border px-1.5 text-[11.5px] font-semibold tabular-nums", selected.has(p.id) ? "border-brand bg-brand-50 text-brand" : "border-line text-ink-2 hover:bg-canvas")}
              title={`Page ${p.number}${selected.has(p.id) ? " (selected)" : ""}`}
            >
              {p.number}
            </button>
          ))}
        </div>
        <p className="text-[12px] text-muted">
          {selected.size} page{selected.size === 1 ? "" : "s"} selected
        </p>
        <Select aria-label="Operation" value={op} onChange={(e) => { setOp(e.target.value as BulkOpKey); setPreview(null); }}>
          {BULK_OPS.map((k) => (
            <option key={k} value={k}>
              {BULK_LABEL[k]}
            </option>
          ))}
        </Select>
        <p className="text-[12px] text-muted">{BULK_HELP[op]}</p>
        {op === "reapply-templates" && (
          <Select aria-label="Target template" value={targetTemplate} onChange={(e) => setTargetTemplate(e.target.value)}>
            <option value="">Keep each page&apos;s template (clear overrides only)</option>
            {templates
              .filter((t) => !t.trim || (Math.abs(t.trim.width - publication.trim.width) < 1 && Math.abs(t.trim.height - publication.trim.height) < 1))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </Select>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={!selected.size} onClick={doPreview}>
            Preview changes
          </Button>
          <Button variant="secondary" disabled={!undo.length} onClick={undoLast}>
            <Undo2 /> Undo {undo.length ? `(${undo.length})` : ""}
          </Button>
        </div>

        {preview && (
          <div className="rounded-lg border border-line bg-canvas p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[13px] font-semibold text-ink">{preview.summary}</p>
              <Badge tone={preview.affected.length ? "brand" : "neutral"}>
                {preview.affected.length} page{preview.affected.length === 1 ? "" : "s"} change
              </Badge>
              {preview.untouched > 0 && <Badge>{preview.untouched} unchanged</Badge>}
              {preview.affected.some((a) => a.reopens) && <Badge tone="warn">{preview.affected.filter((a) => a.reopens).length} approval{preview.affected.filter((a) => a.reopens).length === 1 ? "" : "s"} reset</Badge>}
            </div>
            {preview.scope.length > 0 && <p className="mt-1 text-[12px] text-muted">{preview.scope.join(" · ")}</p>}
            {preview.affected.length > 0 && (
              <ul className="thin-scroll mt-2 max-h-[200px] space-y-1 overflow-y-auto">
                {preview.affected.map((a) => (
                  <li key={a.pageId} className="text-[12px] text-ink-2">
                    <span className="font-semibold text-ink">p. {a.number}</span> {a.title}: {a.changes.join("; ")}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex gap-2">
              <Button variant="primary" size="sm" disabled={!preview.affected.length} onClick={apply}>
                Apply to {preview.affected.length} page{preview.affected.length === 1 ? "" : "s"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        <p className="text-[11.5px] text-muted">Never changes article text, photographs or fonts. Approve pages in Layout Studio once they are right.</p>
      </div>
    </Card>
  );
}
