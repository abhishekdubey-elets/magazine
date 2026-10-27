"use client";

import { CheckCircle2, CircleHelp, FileSearch, Ruler, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Button, cn, type Tone } from "@/components/ui";
import { describeSource, FINDING_LABELS, LOW_CONFIDENCE } from "@/lib/reference/spec";
import type { Finding, FindingSource, FurnitureSpec, TypeSpec } from "@/lib/types";

/** Shared presentation of one design-spec finding (read-only or with an editor). */

export const SOURCE_TONE: Record<FindingSource, Tone> = { extracted: "ok", inferred: "brand", ai: "ai", default: "warn", confirmed: "ok" };
export const SOURCE_LABEL: Record<FindingSource, string> = { extracted: "Extracted", inferred: "Inferred", ai: "AI recognised", default: "Default", confirmed: "Confirmed" };

export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span className="flex items-center gap-1.5" title={`${pct}% confidence`}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-[#eceff3]">
        <span className={cn("block h-full rounded-full", value >= 0.8 ? "bg-ok" : value >= LOW_CONFIDENCE ? "bg-brand" : "bg-warn")} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-[11px] text-muted tabular-nums">{pct}%</span>
    </span>
  );
}

const typeText = (t: TypeSpec | null) => (t ? `${t.font} · ${t.size}/${t.leading} pt · ${t.weight}${t.align ? ` · ${t.align}` : ""}` : "— (house style)");

/** Human-readable value for a finding path. */
export function fmtValue(path: string, value: unknown): ReactNode {
  switch (path) {
    case "page.trim": {
      const v = value as { width: number; height: number };
      return `${v.width} × ${v.height} mm`;
    }
    case "page.bleed":
    case "page.gutter":
      return `${value as number} mm`;
    case "page.margins": {
      const m = value as { top: number; bottom: number; inside: number; outside: number };
      return `T ${m.top} · B ${m.bottom} · In ${m.inside} · Out ${m.outside} mm`;
    }
    case "page.columns":
      return `${value as number} column${(value as number) === 1 ? "" : "s"}`;
    case "page.furniture": {
      const f = value as FurnitureSpec;
      return `Running head ${f.runningHead} (${f.headY} mm) · folio ${f.folio} (${f.folioY} mm)`;
    }
    case "typography.body":
    case "typography.headline":
    case "typography.deck":
    case "typography.caption":
    case "typography.quote":
    case "typography.subheading":
      return typeText(value as TypeSpec | null);
    case "identity.palette":
      return (
        <span className="flex flex-wrap gap-1">
          {(value as string[]).map((c) => (
            <span key={c} className="flex items-center gap-1 text-[11px]">
              <span className="size-3.5 rounded-sm border border-black/10" style={{ background: c }} /> {c}
            </span>
          ))}
        </span>
      );
    case "identity.accent":
      return (
        <span className="flex items-center gap-1.5">
          <span className="size-3.5 rounded-sm border border-black/10" style={{ background: value as string }} /> {value as string}
        </span>
      );
    case "images.aspectRatios":
      return (value as { label: string; share: number }[]).map((r) => `${r.label} ${r.share}%`).join(" · ") || "—";
    case "images.fullBleedShare":
      return `${value as number}% of images bleed off the page`;
    case "structure.sections":
      return (value as { name: string; pages: number[] }[]).map((s) => `${s.name} (${s.pages.length})`).join(" · ") || "—";
    default:
      return typeof value === "string" ? value : JSON.stringify(value);
  }
}

export function FindingCard({
  path,
  finding,
  onEvidence,
  editor,
  onConfirm,
  canEdit,
}: {
  path: string;
  finding: Finding<unknown>;
  onEvidence?: (page: number) => void;
  /** Editing controls (design-system stage). */
  editor?: ReactNode;
  onConfirm?: () => void;
  canEdit?: boolean;
}) {
  const low = finding.confidence < LOW_CONFIDENCE && finding.source !== "confirmed";
  return (
    <div className={cn("rounded-lg border p-3", low ? "border-[#f4dcb9] bg-warn-50/40" : "border-line bg-white")}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[12.5px] font-semibold text-ink">{FINDING_LABELS[path] ?? path}</p>
        <Badge tone={SOURCE_TONE[finding.source]}>{SOURCE_LABEL[finding.source]}</Badge>
        {low && (
          <span className="flex items-center gap-1 text-[11px] text-warn">
            <CircleHelp className="size-3.5" /> Estimate — please confirm
          </span>
        )}
        <span className="ml-auto">
          <ConfidenceBar value={finding.confidence} />
        </span>
      </div>
      <div className="mt-1.5 text-[13px] text-ink">{fmtValue(path, finding.value)}</div>
      {finding.detected !== undefined && <p className="mt-0.5 text-[11.5px] text-muted">Detected: {fmtValue(path, finding.detected)}</p>}
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted">
        {finding.source === "confirmed" ? <ShieldCheck className="size-3.5 text-ok" /> : finding.source === "extracted" ? <FileSearch className="size-3.5" /> : <Ruler className="size-3.5" />}
        <span>{describeSource(finding)}</span>
        {finding.note && <span>· {finding.note}</span>}
      </p>
      {finding.evidence.length > 0 && onEvidence && (
        <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted">
          Evidence:
          {finding.evidence.slice(0, 12).map((n) => (
            <button key={n} className="rounded border border-line bg-canvas px-1.5 py-px font-medium text-ink-2 hover:border-brand hover:text-brand" onClick={() => onEvidence(n)}>
              p.{n}
            </button>
          ))}
          {finding.evidence.length > 12 && <span>+{finding.evidence.length - 12}</span>}
        </p>
      )}
      {editor && <div className="mt-2.5 border-t border-line pt-2.5">{editor}</div>}
      {onConfirm && finding.source !== "confirmed" && (
        <div className="mt-2 flex justify-end">
          <Button size="sm" variant="secondary" disabled={!canEdit} onClick={onConfirm}>
            <CheckCircle2 /> Confirm value
          </Button>
        </div>
      )}
    </div>
  );
}
