"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { sampleArticles } from "@/data/articles";
import { defaultSettings, DEMO_USER, seedActivity, seedPages, seedPublications, PUBLICATION_ID } from "@/data/seed";
import { builtInTemplates } from "./templates";
import type {
  ActivityEvent,
  Article,
  ExportJob,
  FrameOverride,
  ImageAsset,
  Page,
  PageStatus,
  Publication,
  QARun,
  ReferenceProfile,
  Settings,
  Template,
} from "./types";

export const STORAGE_KEY = "pressflow-demo-v1";

export interface DemoState {
  publications: Publication[];
  pages: Page[];
  articles: Article[];
  templates: Template[];
  /** Uploaded images only; sample artwork is resolved from `artwork.ts`. */
  uploads: ImageAsset[];
  activity: ActivityEvent[];
  exportJobs: ExportJob[];
  qaRuns: QARun[];
  settings: Settings;
  activePublicationId: string;
  guide: { open: boolean; step: number; startedAt?: string };
  /** Analysed reference magazines (Create Like This). Newest first, max 2 (thumbnails are stored). */
  references: ReferenceProfile[];
}

interface Actions {
  addArticle: (a: Article) => void;
  updateArticle: (id: string, patch: Partial<Article>) => void;
  deleteArticle: (id: string) => void;
  updatePage: (id: string, patch: Partial<Page>, opts?: { history?: boolean }) => void;
  setContentOverride: (pageId: string, key: string, value: string | undefined) => void;
  setFrameOverride: (pageId: string, frameId: string, patch: FrameOverride) => void;
  resetFrame: (pageId: string, frameId: string) => void;
  setImageOverride: (pageId: string, bind: string, imageId: string | null | undefined) => void;
  applyTemplate: (pageId: string, templateId: string) => void;
  generateLayout: (pageId: string, articleId: string, templateId: string) => void;
  setPageStatus: (pageId: string, status: PageStatus) => void;
  /** Insert a continuation page after `pageId`, renumbering later pages. Returns the new page id. */
  insertContinuation: (pageId: string) => string | undefined;
  addUpload: (img: ImageAsset) => void;
  log: (e: Omit<ActivityEvent, "id" | "at" | "actor"> & { actor?: string }) => void;
  addExportJob: (job: ExportJob) => void;
  updateExportJob: (id: string, patch: Partial<ExportJob>) => void;
  recordQaRun: (run: QARun) => void;
  updateTemplate: (id: string, patch: Partial<Template>) => void;
  duplicateTemplate: (id: string) => string | undefined;
  updateSettings: (patch: Partial<Settings>) => void;
  setGuide: (g: Partial<DemoState["guide"]>) => void;
  addReference: (r: ReferenceProfile) => void;
  updateReference: (id: string, patch: Partial<ReferenceProfile>) => void;
  deleteReference: (id: string) => void;
  /** Add a publication built from a reference, with its pages and templates. */
  importBuild: (b: { publication: Publication; pages: Page[]; templates: Template[] }) => void;
  resetDemo: () => void;
}

export type Store = DemoState & Actions;

const now = () => new Date().toISOString();
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

export const initialState = (): DemoState => ({
  publications: structuredClone(seedPublications),
  pages: structuredClone(seedPages),
  articles: structuredClone(sampleArticles),
  templates: structuredClone(builtInTemplates),
  uploads: [],
  activity: structuredClone(seedActivity),
  exportJobs: [
    {
      id: "exp-seed-1",
      publicationId: PUBLICATION_ID,
      format: "pdf-proof",
      fileName: "TechMahaImpact-May2026-p1-5-proof.pdf",
      pages: [1, 2, 3, 4, 5],
      status: "completed",
      sizeBytes: 4_812_330,
      createdAt: "2026-05-22T10:58:00.000Z",
      durationMs: 6400,
      qa: { errors: 0, warnings: 0 },
      settings: {
        format: "pdf-proof",
        range: "custom",
        customRange: "1-5",
        bleed: false,
        cropMarks: false,
        quality: "standard",
        embedFonts: true,
        includeQaReport: false,
        allowWithErrors: false,
      },
    },
  ],
  qaRuns: [],
  settings: structuredClone(defaultSettings),
  activePublicationId: PUBLICATION_ID,
  guide: { open: false, step: 0 },
  references: [],
});

/* ------------------------------------------------------------ undo / redo */

interface HistoryState {
  past: Record<string, Page[]>;
  future: Record<string, Page[]>;
}

export const useHistory = create<HistoryState>(() => ({ past: {}, future: {} }));

function pushHistory(page: Page) {
  useHistory.setState((h) => ({
    past: { ...h.past, [page.id]: [...(h.past[page.id] ?? []).slice(-49), page] },
    future: { ...h.future, [page.id]: [] },
  }));
}

export function undoPage(pageId: string) {
  const h = useHistory.getState();
  const prev = h.past[pageId]?.at(-1);
  if (!prev) return;
  const current = useStore.getState().pages.find((p) => p.id === pageId);
  useHistory.setState({
    past: { ...h.past, [pageId]: h.past[pageId].slice(0, -1) },
    future: { ...h.future, [pageId]: current ? [...(h.future[pageId] ?? []), current] : h.future[pageId] ?? [] },
  });
  useStore.setState((s) => ({ pages: s.pages.map((p) => (p.id === pageId ? prev : p)) }));
}

export function redoPage(pageId: string) {
  const h = useHistory.getState();
  const next = h.future[pageId]?.at(-1);
  if (!next) return;
  const current = useStore.getState().pages.find((p) => p.id === pageId);
  useHistory.setState({
    future: { ...h.future, [pageId]: h.future[pageId].slice(0, -1) },
    past: { ...h.past, [pageId]: current ? [...(h.past[pageId] ?? []), current] : h.past[pageId] ?? [] },
  });
  useStore.setState((s) => ({ pages: s.pages.map((p) => (p.id === pageId ? next : p)) }));
}

/* ---------------------------------------------------------------- storage */

/** Fired when localStorage refuses a write (quota exceeded, private mode). */
export const storageEvents = new EventTarget();

const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch (err) {
      storageEvents.dispatchEvent(new CustomEvent("error", { detail: err }));
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

/* ------------------------------------------------------------------ store */

export const useStore = create<Store>()(
  persist(
    (set, get) => {
      const mutatePage = (id: string, fn: (p: Page) => Page, history = true) => {
        const page = get().pages.find((p) => p.id === id);
        if (!page) return;
        if (history) pushHistory(page);
        const next = { ...fn(page), updatedAt: now() };
        set((s) => ({
          pages: s.pages.map((p) => (p.id === id ? next : p)),
          publications: s.publications.map((pub) =>
            pub.id === page.publicationId ? { ...pub, updatedAt: next.updatedAt, updatedBy: DEMO_USER } : pub,
          ),
        }));
      };

      return {
        ...initialState(),

        addArticle: (a) => set((s) => ({ articles: [a, ...s.articles] })),
        updateArticle: (id, patch) =>
          set((s) => ({ articles: s.articles.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: now() } : a)) })),
        deleteArticle: (id) =>
          set((s) => ({
            articles: s.articles.filter((a) => a.id !== id),
            pages: s.pages.map((p) => (p.articleId === id ? { ...p, articleId: undefined, status: "planned" as const } : p)),
          })),

        updatePage: (id, patch, opts) => mutatePage(id, (p) => ({ ...p, ...patch }), opts?.history ?? true),

        setContentOverride: (pageId, key, value) =>
          mutatePage(pageId, (p) => {
            const contentOverrides = { ...p.contentOverrides };
            if (value === undefined) delete contentOverrides[key];
            else contentOverrides[key] = value;
            return { ...p, contentOverrides };
          }),

        setFrameOverride: (pageId, frameId, patch) =>
          mutatePage(pageId, (p) => {
            const prev = p.frameOverrides[frameId] ?? {};
            const merged: FrameOverride = { ...prev, ...patch };
            if (patch.style || prev.style) merged.style = { ...prev.style, ...patch.style };
            return { ...p, frameOverrides: { ...p.frameOverrides, [frameId]: merged } };
          }),

        resetFrame: (pageId, frameId) =>
          mutatePage(pageId, (p) => {
            const frameOverrides = { ...p.frameOverrides };
            delete frameOverrides[frameId];
            return { ...p, frameOverrides };
          }),

        setImageOverride: (pageId, bind, imageId) =>
          mutatePage(pageId, (p) => {
            const imageOverrides = { ...p.imageOverrides };
            if (imageId === undefined) delete imageOverrides[bind];
            else imageOverrides[bind] = imageId;
            return { ...p, imageOverrides };
          }),

        applyTemplate: (pageId, templateId) =>
          mutatePage(pageId, (p) => ({ ...p, templateId, frameOverrides: {} })),

        generateLayout: (pageId, articleId, templateId) =>
          mutatePage(pageId, (p) => ({
            ...p,
            articleId,
            templateId,
            frameOverrides: {},
            status: p.status === "planned" ? "draft" : p.status,
            generatedAt: now(),
          })),

        setPageStatus: (pageId, status) =>
          mutatePage(pageId, (p) => ({ ...p, status, approvedAt: status === "approved" ? now() : p.approvedAt })),

        insertContinuation: (pageId) => {
          const src = get().pages.find((p) => p.id === pageId);
          if (!src) return undefined;
          const page: Page = {
            id: uid("page"),
            publicationId: src.publicationId,
            number: src.number + 1,
            pageType: "article",
            title: `${src.title.replace(/ \(continued\)$/, "")} (continued)`,
            sectionId: src.sectionId,
            templateId: "tpl-continuation",
            articleId: src.articleId,
            status: "draft",
            contentOverrides: {},
            imageOverrides: {},
            frameOverrides: {},
            generatedAt: now(),
            updatedAt: now(),
          };
          set((s) => ({
            pages: [
              ...s.pages.map((p) => (p.publicationId === src.publicationId && p.number > src.number ? { ...p, number: p.number + 1 } : p)),
              page,
            ],
            publications: s.publications.map((pub) => (pub.id === src.publicationId ? { ...pub, pageIds: [...pub.pageIds, page.id] } : pub)),
          }));
          return page.id;
        },

        addUpload: (img) => set((s) => ({ uploads: [img, ...s.uploads] })),

        log: (e) =>
          set((s) => ({
            activity: [{ id: uid("act"), at: now(), actor: e.actor ?? DEMO_USER, ...e }, ...s.activity].slice(0, 80),
          })),

        addExportJob: (job) => set((s) => ({ exportJobs: [job, ...s.exportJobs].slice(0, 40) })),
        updateExportJob: (id, patch) => set((s) => ({ exportJobs: s.exportJobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) })),
        recordQaRun: (run) => set((s) => ({ qaRuns: [run, ...s.qaRuns].slice(0, 20) })),

        updateTemplate: (id, patch) =>
          set((s) => ({ templates: s.templates.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: now() } : t)) })),

        duplicateTemplate: (id) => {
          const src = get().templates.find((t) => t.id === id);
          if (!src) return undefined;
          const copy: Template = {
            ...structuredClone(src),
            id: uid("tpl"),
            name: `${src.name} (copy)`,
            builtIn: false,
            status: "draft",
            duplicatedFrom: src.id,
            updatedAt: now(),
          };
          set((s) => ({ templates: [...s.templates, copy] }));
          return copy.id;
        },

        updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
        setGuide: (g) => set((s) => ({ guide: { ...s.guide, ...g } })),

        addReference: (r) => set((s) => ({ references: [r, ...s.references.filter((x) => x.id !== r.id)].slice(0, 2) })),
        updateReference: (id, patch) => set((s) => ({ references: s.references.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
        deleteReference: (id) => set((s) => ({ references: s.references.filter((r) => r.id !== id) })),
        importBuild: ({ publication, pages, templates }) =>
          set((s) => ({
            publications: [publication, ...s.publications],
            pages: [...s.pages, ...pages],
            templates: [...s.templates.filter((t) => !templates.some((n) => n.id === t.id)), ...templates],
            activePublicationId: publication.id,
          })),

        resetDemo: () => {
          useHistory.setState({ past: {}, future: {} });
          set({ ...initialState() });
        },
      };
    },
    {
      name: STORAGE_KEY,
      version: 10,
      storage: createJSONStorage(() => safeStorage),
      migrate: () => initialState(),
    },
  ),
);

export const newId = uid;
