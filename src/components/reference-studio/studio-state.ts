"use client";

import { create } from "zustand";
import type { EditorialFormat, PilotTimings } from "@/lib/types";

/**
 * Reference-to-Magazine Studio session state (this browser tab). Durable data
 * — reference profiles with their design spec, publications with their plan
 * and pilot run — lives in the workspace store; this holds the editor's draft
 * choices and the stage timers that feed the pilot report.
 */

export type Stage = "upload" | "analyse" | "design" | "plan" | "build" | "pilot";

export const STAGES: { id: Stage; label: string; short: string }[] = [
  { id: "upload", label: "Upload the reference magazine", short: "Reference" },
  { id: "analyse", label: "Analyse the reference", short: "Analysis" },
  { id: "design", label: "Review the design system", short: "Design system" },
  { id: "plan", label: "New issue: content & plan", short: "Issue plan" },
  { id: "build", label: "Generate, check & build", short: "Build" },
  { id: "pilot", label: "Pilot report", short: "Pilot" },
];

export interface PlanDraft {
  title: string;
  issueLabel: string;
  topic: string;
  pageCount: number;
  includeAds: boolean;
  articleIds: string[];
  formatOverrides: Record<string, EditorialFormat>;
  templateOverrides: Record<string, string>;
  adPages: number[];
}

interface StudioState {
  stage: Stage;
  /** Reference opened in this session (the URL's ?ref= takes precedence). */
  refId: string | null;
  /** Publication created from the current reference in this session. */
  publicationId: string | null;
  draft: PlanDraft;
  /** Stage timers: when a stage started being worked on (for the pilot report). */
  timers: Partial<Record<keyof PilotTimings, number>>;
  /** Bulk-correction undo stack (newest last). */
  undo: { label: string; publicationId: string; pages: import("@/lib/types").Page[] }[];
  /** Editor's approval of the current plan draft (reset when the draft changes). */
  approval: { hash: string; by: string; at: string } | null;
  /** Reference pages chosen as the pilot sample. */
  pilotPages: number[];
  setApproval: (a: StudioState["approval"]) => void;
  setPilotPages: (pages: number[]) => void;
  setStage: (s: Stage) => void;
  openReference: (refId: string, stage?: Stage) => void;
  setDraft: (patch: Partial<PlanDraft>) => void;
  resetDraft: (patch?: Partial<PlanDraft>) => void;
  startTimer: (stage: keyof PilotTimings) => void;
  /** Stop a running timer and return the elapsed milliseconds (0 if not running). */
  stopTimer: (stage: keyof PilotTimings) => number;
  pushUndo: (entry: StudioState["undo"][number]) => void;
  popUndo: () => StudioState["undo"][number] | undefined;
}

export const emptyDraft = (): PlanDraft => ({
  title: "",
  issueLabel: "",
  topic: "",
  pageCount: 16,
  includeAds: true,
  articleIds: [],
  formatOverrides: {},
  templateOverrides: {},
  adPages: [],
});

export const useStudio = create<StudioState>((set, get) => ({
  stage: "upload",
  refId: null,
  publicationId: null,
  draft: emptyDraft(),
  timers: {},
  undo: [],
  approval: null,
  pilotPages: [],
  setApproval: (approval) => set({ approval }),
  setPilotPages: (pilotPages) => set({ pilotPages }),
  setStage: (stage) => set({ stage }),
  openReference: (refId, stage = "analyse") => set({ refId, stage }),
  setDraft: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  resetDraft: (patch) => set({ draft: { ...emptyDraft(), ...patch } }),
  startTimer: (stage) => set((s) => (s.timers[stage] ? s : { timers: { ...s.timers, [stage]: Date.now() } })),
  stopTimer: (stage) => {
    const at = get().timers[stage];
    if (!at) return 0;
    set((s) => {
      const timers = { ...s.timers };
      delete timers[stage];
      return { timers };
    });
    return Date.now() - at;
  },
  pushUndo: (entry) => set((s) => ({ undo: [...s.undo.slice(-9), entry] })),
  popUndo: () => {
    const last = get().undo.at(-1);
    if (last) set((s) => ({ undo: s.undo.slice(0, -1) }));
    return last;
  },
}));
