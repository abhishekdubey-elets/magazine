"use client";

import { Check, ChevronRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { PageHeader } from "@/components/common";
import { Badge, cn } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useWorkspace } from "@/lib/sync/engine";
import { AnalyseStage } from "./AnalyseStage";
import { BuildStage } from "./BuildStage";
import { DesignStage } from "./DesignStage";
import { PilotStage } from "./PilotStage";
import { PlanStage } from "./PlanStage";
import { STAGES, useStudio, type Stage } from "./studio-state";
import { UploadStage } from "./UploadStage";

/**
 * Reference-to-Magazine Studio: learn a design system from a reference
 * magazine, plan a new issue on a different topic, generate it, check it and
 * build it in InDesign — six stages, one screen.
 */
export function ReferenceStudio() {
  const params = useSearchParams();
  const router = useRouter();
  const sessionRef = useStudio((s) => s.refId);
  const refId = params.get("ref") ?? sessionRef;
  const references = useStore((s) => s.references);
  const publications = useStore((s) => s.publications);
  const profile = references.find((r) => r.id === refId);
  const stage = useStudio((s) => s.stage);
  const setStage = useStudio((s) => s.setStage);
  const publicationId = useStudio((s) => s.publicationId);
  const serverMode = useWorkspace((s) => s.setup?.mode === "server");
  const publication = publications.find((p) => p.id === publicationId) ?? publications.find((p) => p.referenceId === refId && p.plan);

  // Without a reference only the upload stage makes sense.
  useEffect(() => {
    if (!profile && stage !== "upload") setStage("upload");
  }, [profile, stage, setStage]);

  const available = (s: Stage) => {
    switch (s) {
      case "upload":
        return true;
      case "analyse":
      case "design":
      case "plan":
        return !!profile;
      case "build":
      case "pilot":
        return !!profile && !!publication;
    }
  };
  const done = (s: Stage) => {
    switch (s) {
      case "upload":
        return !!profile;
      case "analyse":
        return !!profile?.spec;
      case "design":
        return profile?.spec?.review.status === "confirmed";
      case "plan":
        return !!publication?.plan;
      case "build":
        return !!publication && publication.pilot?.output === "indesign";
      case "pilot":
        return !!publication?.pilot?.manualBaselineMinutes;
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 p-6 lg:p-8">
      <PageHeader
        eyebrow={<Badge tone={serverMode ? "brand" : "neutral"}>{serverMode ? "Team workspace" : "Browser demo mode — InDesign builds need the server"}</Badge>}
        title="Reference-to-Magazine Studio"
        description="Learn the design system of an existing magazine, plan a new issue on a different topic, generate every page from reusable templates, check it, and build an editable InDesign document — without lowering print quality."
      />

      <ol className="grid gap-2 md:grid-cols-3 xl:grid-cols-6" aria-label="Stages">
        {STAGES.map((s, i) => {
          const active = s.id === stage;
          const ok = done(s.id);
          const can = available(s.id);
          return (
            <li key={s.id}>
              <button
                disabled={!can}
                onClick={() => {
                  setStage(s.id);
                  if (profile && !params.get("ref")) router.replace(`/reference-studio?ref=${profile.id}`, { scroll: false });
                }}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-[12.5px] transition",
                  active ? "border-brand bg-brand-50 text-brand" : can ? "border-line bg-white text-ink-2 hover:border-brand/50" : "border-line bg-white text-faint",
                )}
              >
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold", ok ? "bg-ok text-white" : active ? "bg-brand text-white" : "bg-[#eceff3] text-faint")}>{ok ? <Check className="size-3.5" /> : i + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{s.short}</span>
                  <span className="block truncate text-[11px] font-normal opacity-80">{s.label}</span>
                </span>
                {active && <ChevronRight className="ml-auto size-3.5 shrink-0" />}
              </button>
            </li>
          );
        })}
      </ol>

      {stage === "upload" && <UploadStage profile={profile} />}
      {stage === "analyse" && profile && <AnalyseStage profile={profile} />}
      {stage === "design" && profile && <DesignStage profile={profile} />}
      {stage === "plan" && profile && <PlanStage profile={profile} publication={publication} />}
      {stage === "build" && profile && publication && <BuildStage profile={profile} publication={publication} />}
      {stage === "pilot" && profile && publication && <PilotStage profile={profile} publication={publication} />}
    </div>
  );
}
