"use client";

import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { fmtDate, PageHeader } from "@/components/common";
import { NewPublicationDialog } from "@/components/publication/NewPublicationDialog";
import { Badge, Button, Card, Progress } from "@/components/ui";
import { routes } from "@/lib/nav";
import { useStore } from "@/lib/store";

export default function PublicationsPage() {
  const publications = useStore((s) => s.publications);
  const pages = useStore((s) => s.pages);
  const active = useStore((s) => s.activePublicationId);
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Publications"
        description="Every Elets title shares the same template system, content model and preflight rules."
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus /> Start new publication
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {publications.map((p) => {
          const pp = pages.filter((x) => x.publicationId === p.id);
          const done = pp.filter((x) => x.status === "approved").length;
          return (
            <Card key={p.id} className="overflow-hidden">
              <div className="flex gap-4 p-5">
                <div className="flex h-28 w-20 shrink-0 flex-col justify-between rounded-sm p-2 text-white shadow-card" style={{ background: `linear-gradient(160deg, ${p.coverColor}, #13203d)` }}>
                  <span className="text-[10px] font-bold leading-tight">{p.masthead}</span>
                  <span className="text-[8px] opacity-80">{p.issueLabel}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-[15px] font-semibold text-ink">
                      {p.title} — {p.issueLabel}
                    </h2>
                    {active === p.id && <Badge tone="brand">Active</Badge>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12.5px] text-muted">{p.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge tone={p.stage === "published" ? "ok" : "neutral"}>{p.stage.replace("-", " ")}</Badge>
                    <Badge>{pp.length || "—"} pages</Badge>
                    <Badge>Print {fmtDate(p.issueDate)}</Badge>
                  </div>
                </div>
              </div>
              <div className="border-t border-line px-5 py-3">
                <div className="mb-1.5 flex justify-between text-[12px] text-muted">
                  <span>Pages approved</span>
                  <span>
                    {pp.length ? `${done}/${pp.length}` : p.stage === "published" ? "Archived in print" : "Not planned yet"}
                  </span>
                </div>
                <Progress value={pp.length ? (done / pp.length) * 100 : p.stage === "published" ? 100 : 0} tone={p.stage === "published" ? "ok" : "brand"} />
                <Link href={routes.publication(p.id)} className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline">
                  Open workspace <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
      <NewPublicationDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
