"use client";

import { create } from "zustand";
import { createJSONStorage } from "zustand/middleware";
import { defaultSettings } from "@/data/seed";
import { can, type Capability, type SessionUser } from "../roles";
import { initialState, setActor, setServerBacked, useStore, type DemoState } from "../store";
import type { Settings } from "../types";
import {
  COLLECTIONS,
  COLLECTION_KEYS,
  MAX_PUSH_BYTES,
  type Change,
  type ChangeResult,
  type CollectionKey,
  type Row,
  type ServerSetup,
  type Snapshot,
} from "./collections";

/**
 * Keeps the app's store in step with the server (server mode).
 *
 * The store stays the working copy, so every screen works unchanged. Edits are
 * found by object identity (the store never mutates in place), pushed with the
 * version they started from, and rejected by the server if someone else got
 * there first — in which case the server's copy replaces the local one and
 * the person is told. Teammates' changes are pulled every few seconds.
 */

export type WorkspaceStatus = "booting" | "demo" | "signed-out" | "empty" | "ready" | "error";
export type SyncState = "idle" | "saving" | "offline" | "error";

interface WorkspaceState {
  status: WorkspaceStatus;
  setup: ServerSetup | null;
  user: SessionUser | null;
  org: { id: string; name: string } | null;
  error?: string;
  sync: { state: SyncState; pending: number; lastSyncedAt?: string; message?: string };
  /** Messages for the person (conflicts, rejected edits), shown as toasts by the shell. */
  notices: { id: number; tone: "info" | "warning" | "error"; title: string; description?: string }[];
}

export const useWorkspace = create<WorkspaceState>(() => ({
  status: "booting",
  setup: null,
  user: null,
  org: null,
  sync: { state: "idle", pending: 0 },
  notices: [],
}));

export const isServerMode = () => useWorkspace.getState().setup?.mode === "server";

let noticeId = 0;
function notify(tone: WorkspaceState["notices"][number]["tone"], title: string, description?: string) {
  useWorkspace.setState((s) => ({ notices: [...s.notices, { id: ++noticeId, tone, title, description }].slice(-5) }));
}
const setSync = (p: Partial<WorkspaceState["sync"]>) => useWorkspace.setState((s) => ({ sync: { ...s.sync, ...p } }));

/* -------------------------------------------------------------- state */

type Item = { id: string };
const DELETED = Symbol("deleted");
interface Known {
  v: number;
  ref: unknown;
}
const known = Object.fromEntries(COLLECTION_KEYS.map((c) => [c, new Map<string, Known>()])) as Record<CollectionKey, Map<string, Known>>;
let settingsKnown: Known = { v: 0, ref: null };
let cursor = "";
let started = false;

const noopStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

/** Server settings over the defaults (new settings keys get sensible values). */
function mergeSettings(server: unknown): Settings {
  const s = (server ?? {}) as Partial<Settings>;
  const d = structuredClone(defaultSettings);
  return {
    brand: { ...d.brand, ...s.brand },
    typography: { ...d.typography, ...s.typography },
    page: { ...d.page, ...s.page },
    images: { ...d.images, ...s.images },
    exportDefaults: { ...d.exportDefaults, ...s.exportDefaults },
    integration: { ...d.integration, ...s.integration, mode: s.integration?.mode ?? "adobe-indesign-api" },
  };
}

function itemsOf(col: CollectionKey): Item[] {
  return useStore.getState()[col] as unknown as Item[];
}

function setItems(col: CollectionKey, items: Item[]) {
  useStore.setState({ [col]: items } as unknown as Partial<DemoState>);
}

/** Put the server's copy of an item into the store (or remove it). Returns the stored object. */
function adopt(col: CollectionKey, id: string, data: unknown | null, version: number) {
  const items = itemsOf(col);
  const i = items.findIndex((x) => x.id === id);
  if (data === null) {
    if (i >= 0) setItems(col, items.filter((x) => x.id !== id));
    known[col].delete(id);
    return null;
  }
  const obj = data as Item;
  const next = [...items];
  if (i >= 0) next[i] = obj;
  else if (COLLECTIONS[col].newestFirst) next.unshift(obj);
  else next.push(obj);
  setItems(col, next);
  known[col].set(id, { v: version, ref: obj });
  return obj;
}

/** Register an item the server already created (e.g. an uploaded image) before adding it to the store. */
export function adoptServerItem(col: CollectionKey, item: Item, version: number) {
  known[col].set(item.id, { v: version, ref: item });
}

function applySnapshot(snap: Snapshot) {
  const next: Partial<DemoState> = {};
  for (const col of COLLECTION_KEYS) {
    known[col].clear();
    const rows = snap.collections[col] ?? [];
    const items = rows.map((r) => r.data as Item);
    rows.forEach((r, i) => known[col].set(r.id, { v: r.version, ref: items[i] }));
    (next as Record<string, unknown>)[col] = COLLECTIONS[col].newestFirst ? [...items].reverse() : items;
  }
  next.settings = mergeSettings(snap.settings?.data);
  settingsKnown = { v: snap.settings?.version ?? 0, ref: next.settings };
  const pubs = next.publications ?? [];
  const active = useStore.getState().activePublicationId;
  next.activePublicationId = pubs.some((p) => p.id === active) ? active : pubs[0]?.id ?? "";
  useStore.setState(next);
  cursor = snap.cursor;
}

/* --------------------------------------------------------------- push */

interface Pending {
  change: Change;
  ref: unknown;
}

function pendingChanges(): Pending[] {
  const s = useStore.getState();
  const out: Pending[] = [];
  for (const col of COLLECTION_KEYS) {
    const items = s[col] as unknown as Item[];
    const k = known[col];
    const seen = new Set<string>();
    for (const item of items) {
      seen.add(item.id);
      const kn = k.get(item.id);
      if (!kn || kn.ref !== item) out.push({ change: { col, id: item.id, base: kn?.v ?? 0, data: item }, ref: item });
    }
    // Logs are trimmed locally; trimming is not deleting.
    if (!COLLECTIONS[col].log) {
      for (const [id, kn] of k) if (!seen.has(id) && kn.ref !== DELETED) out.push({ change: { col, id, base: kn.v, deleted: true }, ref: DELETED });
    }
  }
  if (s.settings !== settingsKnown.ref) out.push({ change: { col: "settings", id: "settings", base: settingsKnown.v, data: s.settings }, ref: s.settings });
  return out;
}

let pushing = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let backoff = 0;

function schedulePush(delay = 600) {
  if (!started) return;
  clearTimeout(timer);
  timer = setTimeout(() => void push(), delay);
}

function batches(list: Pending[]) {
  const out: Pending[][] = [];
  let cur: Pending[] = [];
  let size = 0;
  for (const p of list) {
    const n = JSON.stringify(p.change).length;
    if (cur.length && (size + n > MAX_PUSH_BYTES || cur.length >= 200)) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(p);
    size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

const NOUN: Record<string, string> = {
  publications: "publication",
  pages: "page",
  articles: "article",
  templates: "template",
  uploads: "image",
  references: "reference",
  settings: "settings",
};

function handleResult(r: ChangeResult, sent: Pending) {
  if (r.col === "settings") {
    const current = useStore.getState().settings;
    if (r.ok) settingsKnown = { v: r.version, ref: sent.ref };
    else if (r.server) {
      const merged = mergeSettings(r.server.data);
      settingsKnown = { v: r.server.version, ref: merged };
      useStore.setState({ settings: merged });
    } else {
      settingsKnown = { v: 0, ref: current };
    }
    return;
  }
  const col = r.col;
  if (r.ok) {
    if (sent.ref === DELETED) {
      known[col].delete(r.id);
      return;
    }
    const current = itemsOf(col).find((x) => x.id === r.id);
    if (r.data && current === sent.ref) {
      adopt(col, r.id, r.data, r.version);
      const d = r.data as { status?: string; reviewNote?: string };
      if (col === "pages" && d.status === "in-review" && d.reviewNote) notify("warning", "Page sent back for approval", d.reviewNote);
    } else {
      known[col].set(r.id, { v: r.version, ref: sent.ref });
    }
    return;
  }
  // Rejected: the server's copy wins.
  const server = r.server && !r.server.deleted ? r.server : null;
  if (server) adopt(col, r.id, server.data, server.version);
  else adopt(col, r.id, null, 0);
  notify(r.reason === "conflict" ? "warning" : "error", r.reason === "conflict" ? `This ${NOUN[col] ?? "item"} was changed by someone else` : `Change not saved`, r.message);
}

async function push() {
  if (!started) return;
  if (pushing) {
    again = true;
    return;
  }
  const list = pendingChanges();
  setSync({ pending: list.length });
  if (!list.length) {
    if (useWorkspace.getState().sync.state === "saving") setSync({ state: "idle" });
    return;
  }
  pushing = true;
  setSync({ state: "saving" });
  try {
    for (const batch of batches(list)) {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ changes: batch.map((p) => p.change) }),
      });
      if (res.status === 401) return signedOut();
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Save failed (${res.status})`);
      const { results } = (await res.json()) as { results: ChangeResult[] };
      results.forEach((r, i) => handleResult(r, batch[i]));
    }
    backoff = 0;
    setSync({ state: "idle", lastSyncedAt: new Date().toISOString(), message: undefined, pending: pendingChanges().length });
  } catch (e) {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    backoff = Math.min(30_000, (backoff || 1000) * 2);
    setSync({ state: offline ? "offline" : "error", message: e instanceof Error ? e.message : String(e) });
    schedulePush(backoff);
  } finally {
    pushing = false;
    if (again) {
      again = false;
      schedulePush(100);
    }
  }
}

/* --------------------------------------------------------------- pull */

function applyRow(row: Row) {
  if (row.col === "settings") {
    if (row.version <= settingsKnown.v) return;
    if (useStore.getState().settings !== settingsKnown.ref) return; // local edit pending
    const merged = mergeSettings(row.data);
    settingsKnown = { v: row.version, ref: merged };
    useStore.setState({ settings: merged });
    return;
  }
  const col = row.col;
  const kn = known[col].get(row.id);
  if (kn && kn.v >= row.version) return;
  const current = itemsOf(col).find((x) => x.id === row.id);
  if (current && (!kn || current !== kn.ref)) return; // unsaved local edit: the push resolves it
  if (row.deleted) {
    if (current) adopt(col, row.id, null, row.version);
    return;
  }
  adopt(col, row.id, row.data, row.version);
}

let pulling = false;
async function pull() {
  if (!started || pulling || !cursor || document.visibilityState === "hidden") return;
  pulling = true;
  try {
    const res = await fetch(`/api/sync?since=${encodeURIComponent(cursor)}`, { cache: "no-store" });
    if (res.status === 401) return signedOut();
    if (!res.ok) return;
    const body = (await res.json()) as { rows: Row[]; cursor: string };
    for (const row of body.rows) applyRow(row);
    cursor = body.cursor;
    if (useWorkspace.getState().sync.state === "offline") setSync({ state: "idle" });
  } catch {
    setSync({ state: "offline" });
  } finally {
    pulling = false;
  }
}

/* -------------------------------------------------------------- start */

function signedOut() {
  started = false;
  useWorkspace.setState({ status: "signed-out" });
  const next = encodeURIComponent(location.pathname + location.search);
  location.href = `/login?next=${next}`;
}

function start() {
  if (started) return;
  started = true;
  useStore.subscribe(() => schedulePush());
  setInterval(() => void pull(), 8000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void pull();
  });
  window.addEventListener("online", () => schedulePush(100));
  // Unsaved edits: warn before leaving, and try to send them on the way out.
  window.addEventListener("beforeunload", (e) => {
    if (pendingChanges().length) e.preventDefault();
  });
  window.addEventListener("pagehide", () => {
    const list = pendingChanges();
    if (!list.length) return;
    const body = JSON.stringify({ changes: list.map((p) => p.change) });
    if (body.length < 60_000) navigator.sendBeacon("/api/sync", new Blob([body], { type: "application/json" }));
  });
}

async function loadWorkspace() {
  const res = await fetch("/api/workspace", { cache: "no-store" });
  if (res.status === 401) return signedOut();
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Could not load the workspace (${res.status}).`);
  const snap = (await res.json()) as Snapshot;
  if (snap.empty) {
    useWorkspace.setState({ status: "empty" });
    return;
  }
  applySnapshot(snap);
  useWorkspace.setState({ status: "ready" });
  start();
}

/** Decide demo vs server mode and load the workspace. Called once by the app shell. */
export async function bootWorkspace() {
  if (useWorkspace.getState().status !== "booting") return;
  let info: { setup: ServerSetup; user: SessionUser | null; org?: { id: string; name: string } } | null = null;
  try {
    const res = await fetch("/api/session", { cache: "no-store" });
    if (res.ok) info = await res.json();
  } catch {
    /* static hosting or offline: demo */
  }
  if (!info || info.setup.mode === "demo") {
    await useStore.persist.rehydrate();
    useWorkspace.setState({ status: "demo", setup: info?.setup ?? null });
    return;
  }
  // Server mode: the server is the source of truth; nothing is kept in this browser.
  useStore.persist.setOptions({ storage: createJSONStorage(() => noopStorage) });
  setServerBacked(true);
  useWorkspace.setState({ setup: info.setup, user: info.user, org: info.org ?? null });
  if (!info.user) return signedOut();
  setActor(info.user.name);
  try {
    await loadWorkspace();
  } catch (e) {
    useWorkspace.setState({ status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

/** First run (admin): fill the empty workspace with the sample issue and the built-in templates. */
export async function seedWorkspace() {
  const s = initialState();
  const collections: Partial<Record<CollectionKey, unknown[]>> = Object.fromEntries(COLLECTION_KEYS.map((c) => [c, s[c]]));
  const settings = { ...s.settings, integration: { ...s.settings.integration, mode: "adobe-indesign-api" } };
  const res = await fetch("/api/workspace/seed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ collections, settings }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Setup failed (${res.status}).`);
  await loadWorkspace();
}

/** Push now (e.g. before starting a print build) and resolve once nothing is pending. */
export async function flushSync(): Promise<boolean> {
  if (!started) return true;
  for (let i = 0; i < 10; i++) {
    clearTimeout(timer);
    await push();
    while (pushing) await new Promise((r) => setTimeout(r, 100));
    if (!pendingChanges().length) return true;
    if (useWorkspace.getState().sync.state === "error" || useWorkspace.getState().sync.state === "offline") return false;
  }
  return !pendingChanges().length;
}

/** Server version of a synced item (sent with print builds so the server can tell stale copies). */
export const knownVersion = (col: CollectionKey, id: string) => known[col].get(id)?.v ?? 0;

export async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  location.href = "/login";
}

/** May the signed-in person do this? Always true in demo mode (one local user). */
export function useCan(cap: Capability): boolean {
  return useWorkspace((s) => s.setup?.mode !== "server" || can(s.user?.role, cap));
}

/** Non-hook variant of `useCan` for event handlers. */
export function canNow(cap: Capability): boolean {
  const s = useWorkspace.getState();
  return s.setup?.mode !== "server" || can(s.user?.role, cap);
}
