"use client";

import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { makeContext, resolvePage, type LayoutContext } from "./layout-engine";
import { runQa, summarize } from "./qa-engine";
import { useStore } from "./store";
import { fontShorthand, resetMeasureCache } from "./text-engine";
import { paragraphStyles } from "./design-tokens";

/** Bumped once the editorial web fonts are available, to re-run text fitting. */
export const useFonts = create<{ version: number; ready: boolean }>(() => ({ version: 0, ready: false }));

export function useFontWatcher() {
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;
    let cancelled = false;
    const loads = new Set<string>();
    for (const s of Object.values(paragraphStyles)) {
      loads.add(fontShorthand(s, 16));
      loads.add(fontShorthand({ ...s, weight: 700 }, 16));
      loads.add(fontShorthand({ ...s, italic: true }, 16));
    }
    Promise.allSettled([...loads].map((f) => document.fonts.load(f)))
      .then(() => document.fonts.ready)
      .then(() => {
        if (cancelled) return;
        resetMeasureCache();
        useFonts.setState((s) => ({ version: s.version + 1, ready: true }));
      });
    return () => {
      cancelled = true;
    };
  }, []);
}

export function useHydrated() {
  const [h, setH] = useState(false);
  useEffect(() => setH(true), []);
  return h;
}

export function usePublication() {
  const id = useStore((s) => s.activePublicationId);
  const pubs = useStore((s) => s.publications);
  return pubs.find((p) => p.id === id) ?? pubs[0];
}

export function useLayoutContext(): LayoutContext {
  const publication = usePublication();
  const pages = useStore((s) => s.pages);
  const articles = useStore((s) => s.articles);
  const templates = useStore((s) => s.templates);
  const settings = useStore((s) => s.settings);
  const fontsVersion = useFonts((s) => s.version);
  return useMemo(
    () => makeContext(publication, pages.filter((p) => p.publicationId === publication.id), articles, templates, settings, fontsVersion),
    [publication, pages, articles, templates, settings, fontsVersion],
  );
}

export function useQa() {
  const ctx = useLayoutContext();
  const uploads = useStore((s) => s.uploads);
  return useMemo(() => {
    const { issues, resolved } = runQa(ctx, uploads);
    return { issues, resolved, summary: summarize(issues), ctx };
  }, [ctx, uploads]);
}

export function useResolvedPage(pageId: string | undefined) {
  const ctx = useLayoutContext();
  return useMemo(() => {
    const page = ctx.pages.find((p) => p.id === pageId);
    return page ? resolvePage(ctx, page) : undefined;
  }, [ctx, pageId]);
}
