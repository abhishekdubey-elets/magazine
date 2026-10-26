"use client";

import { ArrowLeft, Printer } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { PageRenderer } from "@/components/page/PageRenderer";
import { Button } from "@/components/ui";
import { PX_PER_MM } from "@/lib/design-tokens";
import { parseRange } from "@/lib/exporter";
import { useLayoutContext } from "@/lib/hooks";
import { resolvePage } from "@/lib/layout-engine";
import { useStore } from "@/lib/store";

/** CSS px per mm at print resolution (96 dpi). */
const PRINT_PX_PER_MM = 96 / 25.4;

export default function ProofPage() {
  return (
    <Suspense fallback={null}>
      <Proof />
    </Suspense>
  );
}

function Proof() {
  const params = useSearchParams();
  const ctx = useLayoutContext();
  const uploads = useStore((s) => s.uploads);
  const pages = useMemo(() => [...ctx.pages].sort((a, b) => a.number - b.number), [ctx.pages]);
  const numbers = useMemo(() => {
    try {
      return parseRange(params.get("pages") ?? `1-${pages.length}`, pages.length);
    } catch {
      return pages.map((p) => p.number);
    }
  }, [params, pages]);
  const W = ctx.publication.trim.width;
  const H = ctx.publication.trim.height;
  const printScale = PRINT_PX_PER_MM / PX_PER_MM;

  return (
    <div className="min-h-screen bg-[#d9dce2] print:bg-white">
      <style>{`@page { size: ${W}mm ${H}mm; margin: 0 } @media print { .proof-sheet { width: ${W}mm !important; height: ${H}mm !important; margin: 0 !important; box-shadow: none !important; break-after: page; } .proof-inner { transform: scale(${printScale}); } }`}</style>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-white px-5 py-2.5 print:hidden">
        <Button size="sm" variant="ghost" onClick={() => history.back()}>
          <ArrowLeft /> Back
        </Button>
        <p className="text-[13px] font-semibold text-ink">
          Print proof — {ctx.publication.title}, {ctx.publication.issueLabel}
        </p>
        <span className="text-[12px] text-muted">
          {numbers.length} page{numbers.length === 1 ? "" : "s"} · vector text · use your browser&apos;s “Save as PDF” for a review copy (RGB, not PDF/X)
        </span>
        <Button size="sm" variant="primary" className="ml-auto" onClick={() => window.print()}>
          <Printer /> Print / Save as PDF
        </Button>
      </header>
      <div className="flex flex-col items-center gap-8 py-8 print:block print:p-0">
        {numbers.map((n) => {
          const page = pages.find((p) => p.number === n);
          if (!page) return null;
          return (
            <section key={page.id} className="proof-sheet overflow-hidden bg-white shadow-page" style={{ width: W * PX_PER_MM, height: H * PX_PER_MM }} aria-label={`Page ${n}`}>
              <div className="proof-inner origin-top-left">
                <PageRenderer r={resolvePage(ctx, page)} ctx={ctx} uploads={uploads} mode="export" />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
